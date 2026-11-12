// A recorded voice taken apart: the course of the body's four movements (body.ts) under which
// VocalTractLab sounds as the recording does. The pitch is read off the recording. The other three
// are found by synthesis: the model sings, its sound is compared with the recording's, and each
// movement is corrected by what it alone changes: the lungs by how loud the voice is, the folds by
// its highest band, the lips by its middle one. A few rounds bring the copy onto the recording.
import { clip } from '../shared/math.ts';
import { analyse, voicedFrames, type Sound } from './acoustics.ts';
import { emptyTracks, MAX_PRESSURE, soundOf, type Body, type Tracks } from './body.ts';
import type { VtlEngine } from '../vtl/engine.ts';

export interface InversionOptions {
  /** Rounds of synthesis and correction. */
  readonly passes?: number;
  /**
   * The lung pressure (dPa) of the voice's loudest moments (the level 90 % of its frames stay
   * under). A microphone does not tell how loud a voice was, so the pressure is known only against
   * this; what the voice does is in its course.
   */
  readonly anchor?: number;
  /**
   * Whether the bands' balance is read against the voice's own middle: the recording's median
   * balance is taken for the model's (half-closed folds, lips shut), and the folds and the lips
   * move by what departs from it. A real voice through a real microphone is coloured otherwise than
   * the model, and without this the colour would be read as movement. Off for sound the model made.
   */
  readonly equalize?: boolean;
  /** Told after each round how far the copy still is from the recording. */
  readonly onPass?: (pass: number, misfit: Misfit) => void;
}

/** How far the copy is from the recording, over the voiced frames: median absolute dB. */
export interface Misfit {
  readonly level: number;
  readonly mid: number;
  readonly high: number;
}

export interface Inversion {
  readonly tracks: Tracks;
  /** The frames in which the recorded voice sounds. */
  readonly voiced: Uint8Array;
  /** The recording, read frame by frame. */
  readonly target: Sound;
  /** The model's copy and how it reads. */
  readonly copy: Float32Array;
  readonly model: Sound;
  /** The misfit before each round's correction, and after the last. */
  readonly misfits: readonly Misfit[];
}

/** What a doubling of lung pressure adds to the model's level: 22 dB for ten times the pressure. */
const DB_PER_DECADE = 22;
/** What closing the folds from breathy to modal adds to the high band against the low one, dB. */
const HIGH_PER_ADDUCTION = 10;
/** What parting the lips from a hum to an "a" adds to the middle band against the low one, dB. */
const MID_PER_OPENING = 16;
/** How much of a round's correction is applied. */
const GAIN = { pressure: 0.9, adduction: 0.6, opening: 0.6 } as const;
/**
 * Frames over which each correction is smoothed: 40 ms for the lungs, which shape every note; half
 * a second for the folds, which change their closing slowly (and whose band is the one a tract of
 * another shape than the model's colours most); 100 ms for the lips.
 */
const SMOOTH = { pressure: 8, adduction: 100, opening: 20 } as const;
/** How far the folds and the lips may be moved in one round. */
const STEP = { adduction: 0.15, opening: 0.3 } as const;
/** Frames at either end of a stretch of voice in which its bands say nothing: it comes and goes. */
const EDGE = 6;
/** The lowest pressure of a sounding voice: under it the model's folds do not swing. */
const MIN_PRESSURE = 300;

const percentile = (values: Float32Array, q: number): number => {
  if (values.length === 0) return 0;
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.round(q * (sorted.length - 1))];
};
const median = (values: Float32Array): number => percentile(values, 0.5);

/** The values of `track` at the frames where `mask` is set. */
const where = (track: ArrayLike<number>, mask: Uint8Array): Float32Array => {
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(track[i]);
  return Float32Array.from(out);
};

/** A running mean over `width` frames. */
function smooth(values: Float32Array, width: number): Float32Array {
  const out = new Float32Array(values.length);
  const half = width >> 1;
  let sum = 0;
  for (let i = -half; i < values.length; i++) {
    const enter = i + half;
    const leave = i - half - 1;
    if (enter < values.length) sum += values[enter];
    if (leave >= 0) sum -= values[leave];
    if (i >= 0) out[i] = sum / (Math.min(values.length - 1, enter) - Math.max(0, leave + 1) + 1);
  }
  return out;
}

/** `values` where `mask` is set, and between such frames a straight line (held at the ends). */
function bridged(values: ArrayLike<number>, mask: Uint8Array): Float32Array {
  const out = new Float32Array(mask.length);
  let last = -1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    out[i] = values[i];
    if (last < 0) out.fill(values[i], 0, i);
    else
      for (let k = last + 1; k < i; k++)
        out[k] = out[last] + ((k - last) / (i - last)) * (values[i] - out[last]);
    last = i;
  }
  if (last >= 0) out.fill(out[last], last + 1);
  return out;
}

/** The recording's pitch as the folds' track: steadied over 25 ms, carried through the silences. */
function pitchTrack(target: Sound, voiced: Uint8Array): Float32Array {
  const log = Float32Array.from(target.f0, (hz) => Math.log2(Math.max(hz, 1)));
  const steady = new Float32Array(log.length);
  const window: number[] = [];
  for (let i = 0; i < log.length; i++) {
    window.length = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(log.length - 1, i + 2); k++)
      if (voiced[k]) window.push(log[k]);
    window.sort((a, b) => a - b);
    steady[i] = window.length > 0 ? window[window.length >> 1] : log[i];
  }
  return bridged(steady, voiced).map((l) => 2 ** l);
}

/**
 * The body's movements under which the model sounds as `samples` do (mono, 44.1 kHz).
 */
export function invert(
  engine: VtlEngine,
  body: Body,
  samples: Float32Array,
  options: InversionOptions = {},
): Inversion {
  const { passes = 4, anchor = 7000, equalize = true, onPass } = options;
  const target = analyse(samples);
  const voiced = voicedFrames(target);
  const n = target.count;
  const tracks = emptyTracks(n);
  const misfits: Misfit[] = [];
  if (!voiced.includes(1)) {
    const copy = new Float32Array(samples.length);
    return { tracks, voiced, target, copy, model: analyse(copy, false), misfits };
  }

  tracks.f0.set(pitchTrack(target, voiced));
  // the lungs push while the voice sounds, coming and going over 25 ms
  const gate = smooth(Float32Array.from(voiced), 5);
  const loud = percentile(where(target.level, voiced), 0.9);
  for (let i = 0; i < n; i++) {
    const p = anchor * 10 ** ((target.level[i] - loud) / DB_PER_DECADE);
    tracks.pressure[i] = voiced[i] ? clip(p, MIN_PRESSURE, MAX_PRESSURE) : 0;
  }
  tracks.adduction.fill(0.5);

  // where a band of the recording lies in its noise, it says nothing about the voice
  const silent = Uint8Array.from(voiced, (v) => 1 - v);
  const enoughSilence = where(target.level, silent).length >= 20;
  const noise = (band: Float32Array): number =>
    enoughSilence ? percentile(where(band, silent), 0.5) : -Infinity;
  const steady = Uint8Array.from(voiced, (v, i) => {
    if (!v) return 0;
    for (let k = Math.max(0, i - EDGE); k <= Math.min(n - 1, i + EDGE); k++) if (!voiced[k]) return 0;
    return 1;
  });
  const heard = (band: Float32Array): Uint8Array => {
    const floor = noise(band) + 6;
    return Uint8Array.from(steady, (v, i) => (v && band[i] > floor ? 1 : 0));
  };
  const midHeard = heard(target.mid);
  const highHeard = heard(target.high);
  const balance = (sound: Sound, band: Float32Array, i: number): number => band[i] - sound.low[i];

  let offsetMid = 0;
  let offsetHigh = 0;
  let copy: Float32Array = new Float32Array(0);
  let model = target;
  for (let pass = 0; pass <= passes; pass++) {
    const gated = { ...tracks, pressure: tracks.pressure.map((p, i) => p * gate[i]) };
    copy = soundOf(engine, body, gated);
    model = analyse(copy, false);
    const modelLoud = percentile(where(model.level, voiced), 0.9);
    const errLevel = new Float32Array(n);
    const errMid = new Float32Array(n);
    const errHigh = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      errLevel[i] = target.level[i] - loud - (model.level[i] - modelLoud);
      errMid[i] = balance(target, target.mid, i) - balance(model, model.mid, i);
      errHigh[i] = balance(target, target.high, i) - balance(model, model.high, i);
    }
    if (pass === 0 && equalize) {
      offsetMid = median(where(errMid, midHeard));
      offsetHigh = median(where(errHigh, highHeard));
    }
    for (let i = 0; i < n; i++) {
      errMid[i] -= offsetMid;
      errHigh[i] -= offsetHigh;
    }
    const misfit: Misfit = {
      level: median(where(errLevel, voiced).map(Math.abs)),
      mid: median(where(errMid, midHeard).map(Math.abs)),
      high: median(where(errHigh, highHeard).map(Math.abs)),
    };
    misfits.push(misfit);
    onPass?.(pass, misfit);
    if (pass === passes) break;

    const correction = (err: Float32Array, mask: Uint8Array, limit: number, width: number): Float32Array =>
      smooth(
        bridged(
          err.map((e) => clip(e, -limit, limit)),
          mask,
        ),
        width,
      );
    const dLevel = correction(errLevel, voiced, 12, SMOOTH.pressure);
    const dHigh = highHeard.includes(1) ? correction(errHigh, highHeard, 15, SMOOTH.adduction) : null;
    const dMid = midHeard.includes(1) ? correction(errMid, midHeard, 20, SMOOTH.opening) : null;
    for (let i = 0; i < n; i++) {
      if (!voiced[i]) continue;
      tracks.pressure[i] = clip(
        tracks.pressure[i] * 10 ** ((GAIN.pressure * dLevel[i]) / DB_PER_DECADE),
        MIN_PRESSURE,
        MAX_PRESSURE,
      );
    }
    for (let i = 0; i < n; i++) {
      if (dHigh) {
        const step = clip((GAIN.adduction * dHigh[i]) / HIGH_PER_ADDUCTION, -STEP.adduction, STEP.adduction);
        tracks.adduction[i] = clip(tracks.adduction[i] + step, 0, 1);
      }
      if (dMid) {
        const step = clip((GAIN.opening * dMid[i]) / MID_PER_OPENING, -STEP.opening, STEP.opening);
        tracks.opening[i] = clip(tracks.opening[i] + step, 0, 1);
      }
    }
  }
  for (let i = 0; i < n; i++) tracks.pressure[i] *= gate[i];
  return { tracks, voiced, target, copy, model, misfits };
}
