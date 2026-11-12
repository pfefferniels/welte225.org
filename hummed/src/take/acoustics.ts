// What is heard of a voice, frame by frame: how loud it is, whether the folds swing and at what
// pitch, and how its sound is spread over three bands. The recording and the model's copy of it are
// both read this way, and the inversion compares the two.
import { SAMPLE_RATE } from '../shared/units.ts';
import { HOP } from './body.ts';

export interface Sound {
  /** Frames, `HOP` samples apart; frame i is centred on sample i · HOP. */
  readonly count: number;
  /** Level in dB (RMS over 30 ms). */
  readonly level: Float32Array;
  /** The pitch in Hz, as found whether or not the frame is voiced. */
  readonly f0: Float32Array;
  /** How periodic the frame is, 0 to 1. */
  readonly periodicity: Float32Array;
  /** Band levels in dB: where a hum has its sound, where an open mouth adds, where closed folds do. */
  readonly low: Float32Array;
  readonly mid: Float32Array;
  readonly high: Float32Array;
}

/** The bands' edges in Hz: low to `BANDS[1]`, mid to `BANDS[2]`, high to `BANDS[3]`. */
export const BANDS = [70, 350, 2500, 5000] as const;
/** The pitches looked for. */
export const PITCH_RANGE = { low: 65, high: 520 } as const;

const LEVEL_WINDOW = Math.round(0.03 * SAMPLE_RATE);
const FFT_SIZE = 2048;
const FLOOR = 1e-12;
const db = (power: number): number => 10 * Math.log10(power + FLOOR);

/** In-place radix-2 FFT of `re`, `im` (their length a power of two). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size)
      for (let k = 0; k < half; k++) {
        const c = Math.cos(step * k);
        const s = Math.sin(step * k);
        const a = start + k;
        const b = a + half;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
  }
}

/** The band levels of every frame. */
function bands(samples: Float32Array, count: number): Pick<Sound, 'low' | 'mid' | 'high'> {
  const window = Float64Array.from(
    { length: FFT_SIZE },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE),
  );
  const bin = (hz: number): number => Math.round((hz * FFT_SIZE) / SAMPLE_RATE);
  const edges = BANDS.map(bin);
  const out = [new Float32Array(count), new Float32Array(count), new Float32Array(count)];
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  for (let f = 0; f < count; f++) {
    const start = f * HOP - FFT_SIZE / 2;
    for (let i = 0; i < FFT_SIZE; i++) {
      const k = start + i;
      re[i] = k >= 0 && k < samples.length ? samples[k] * window[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < 3; b++) {
      let power = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) power += re[k] * re[k] + im[k] * im[k];
      out[b][f] = db(power / (FFT_SIZE * FFT_SIZE));
    }
  }
  return { low: out[0], mid: out[1], high: out[2] };
}

/** The level of every frame. */
function levels(samples: Float32Array, count: number): Float32Array {
  // running sums of squares, so that each frame's window is two reads
  const sums = new Float64Array(samples.length + 1);
  for (let i = 0; i < samples.length; i++) sums[i + 1] = sums[i] + samples[i] * samples[i];
  const out = new Float32Array(count);
  for (let f = 0; f < count; f++) {
    const a = Math.max(0, f * HOP - (LEVEL_WINDOW >> 1));
    const b = Math.min(samples.length, a + LEVEL_WINDOW);
    out[f] = db(b > a ? (sums[b] - sums[a]) / (b - a) : 0);
  }
  return out;
}

/** The sound at a quarter of the rate, low-passed by two running means. */
const DECIMATION = 4;
function decimate(samples: Float32Array): Float32Array {
  const mean = (x: Float32Array): Float32Array => {
    const out = new Float32Array(x.length);
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      sum += x[i];
      if (i >= DECIMATION) sum -= x[i - DECIMATION];
      out[i] = sum / DECIMATION;
    }
    return out;
  };
  const smooth = mean(mean(samples));
  // the two means delay the sound by DECIMATION − 1 samples
  const delay = DECIMATION - 1;
  const out = new Float32Array(Math.floor(samples.length / DECIMATION));
  for (let i = 0; i < out.length; i++) out[i] = smooth[Math.min(smooth.length - 1, i * DECIMATION + delay)];
  return out;
}

/** Below this the normalized difference counts as a period found (YIN's threshold). */
const YIN_THRESHOLD = 0.15;

/**
 * Pitch and periodicity of every frame, after de Cheveigné and Kawahara's YIN: the lag at which the
 * sound differs least from itself, the first such dip rather than the deepest, so that a period is
 * not taken for two.
 */
function pitches(samples: Float32Array, count: number): Pick<Sound, 'f0' | 'periodicity'> {
  const x = decimate(samples);
  const rate = SAMPLE_RATE / DECIMATION;
  const minLag = Math.floor(rate / PITCH_RANGE.high);
  const maxLag = Math.ceil(rate / PITCH_RANGE.low);
  const width = 2 * maxLag;
  const f0 = new Float32Array(count);
  const periodicity = new Float32Array(count);
  const d = new Float64Array(maxLag + 2);
  for (let f = 0; f < count; f++) {
    const start = Math.round((f * HOP) / DECIMATION) - (width >> 1) - (maxLag >> 1);
    if (start < 0 || start + width + maxLag + 1 >= x.length) continue;
    let running = 0;
    let best = -1;
    let bestValue = Infinity;
    d[0] = 1;
    for (let lag = 1; lag <= maxLag + 1; lag++) {
      let sum = 0;
      for (let j = 0; j < width; j++) {
        const diff = x[start + j] - x[start + j + lag];
        sum += diff * diff;
      }
      running += sum;
      d[lag] = running > 0 ? (sum * lag) / running : 1;
    }
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (d[lag] < YIN_THRESHOLD) {
        // down to the bottom of this dip
        while (lag + 1 <= maxLag && d[lag + 1] < d[lag]) lag++;
        best = lag;
        bestValue = d[lag];
        break;
      }
      if (d[lag] < bestValue) {
        best = lag;
        bestValue = d[lag];
      }
    }
    if (best < 0) continue;
    // the dip's bottom between the lags, by a parabola through its three points
    const a = d[best - 1];
    const b = d[best];
    const c = d[best + 1];
    const curve = a - 2 * b + c;
    const shift = curve > 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curve)) : 0;
    f0[f] = rate / (best + shift);
    periodicity[f] = Math.max(0, Math.min(1, 1 - bestValue));
  }
  return { f0, periodicity };
}

/**
 * A sound (at 44.1 kHz), read frame by frame. Without `pitch` the pitch is not looked for (the
 * model's copy is given its pitch, and looking for it is most of the work).
 */
export function analyse(samples: Float32Array, pitch = true): Sound {
  const count = Math.floor(samples.length / HOP);
  const unpitched = { f0: new Float32Array(count), periodicity: new Float32Array(count) };
  return {
    count,
    level: levels(samples, count),
    ...(pitch ? pitches(samples, count) : unpitched),
    ...bands(samples, count),
  };
}

/** The frames in which the folds swing: periodic, and no more than `range` dB under the loudest. */
export function voicedFrames(sound: Sound, range = 45, periodicity = 0.7): Uint8Array {
  const sorted = Float32Array.from(sound.level).sort();
  const top = sorted[Math.floor(0.98 * (sorted.length - 1))];
  const raw = Uint8Array.from({ length: sound.count }, (_, i) =>
    sound.periodicity[i] >= periodicity && sound.level[i] > top - range ? 1 : 0,
  );
  // a frame or two that drop out inside a note, or stand alone in a silence, are no change of voice
  const out = raw.slice();
  const run = 4;
  let i = 0;
  while (i < raw.length) {
    let j = i;
    while (j < raw.length && raw[j] === raw[i]) j++;
    if (j - i < run && i > 0 && j < raw.length) out.fill(1 - raw[i], i, j);
    i = j;
  }
  return out;
}
