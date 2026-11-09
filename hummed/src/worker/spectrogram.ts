// Spectrogram columns of the voice, black on white, as grey levels (0 black, 255 white).
import { SPECTROGRAM, type SpectrogramStyle } from '../shared/spectrogram.ts';
import { SAMPLE_RATE } from '../shared/units.ts';
import { makeSpectrum } from './fft.ts';
import { CELLS, greysOf, shadeOf } from './greys.ts';

/**
 * Columns `first` up to `end`, each centred on its hop, of sound of which `audio` holds the part from
 * sample `offset` on (silence elsewhere). The sound is the voice's, at 44.1 kHz, unless another
 * rate is given (the piano's, as the browser decoded it): the columns are a hundredth of a second
 * apart at any rate.
 */
export type SpectrogramColumns = (
  audio: Float32Array,
  offset: number,
  first: number,
  end: number,
) => Uint8Array;

/**
 * The columns of each style and rate asked for so far, to be given again (the piano's picture asks
 * anew for every part). Making them plans the transform and tabulates the greys, which takes some
 * milliseconds; and V8 compiles a function of which there is only one more tightly, with the arrays
 * it works in as constants, which is worth a sixth of a column's time.
 */
const made = new Map<string, SpectrogramColumns>();

export function makeSpectrogram(style: SpectrogramStyle, sampleRate = SAMPLE_RATE): SpectrogramColumns {
  const { fmin, fmax, window, fftSize, scale } = style;
  const scaled =
    scale.kind === 'db' ? `${scale.topDb} dB down ${scale.rangeDb}` : `${scale.full} to the ${scale.power}`;
  const key = `${fmin}-${fmax} Hz, ${window} of ${fftSize} at ${sampleRate}, ${scaled}`;
  let columns = made.get(key);
  if (!columns) {
    columns = columnsOf(style, sampleRate);
    made.set(key, columns);
  }
  return columns;
}

function columnsOf(style: SpectrogramStyle, sampleRate: number): SpectrogramColumns {
  const { rows } = SPECTROGRAM;
  const { window, fftSize, scale } = style;
  const hop = sampleRate / SPECTROGRAM.columnsPerSecond;
  const hann = Float64Array.from(
    { length: window },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (window - 1)),
  );
  // Each row is read between two FFT bins: the one under it and how far it is towards the next
  // (the top row highest).
  const rowBin = new Int32Array(rows);
  const rowAlong = new Float64Array(rows);
  for (let r = 0; r < rows; r++) {
    const bin = ((style.fmax * Math.pow(style.fmin / style.fmax, r / (rows - 1))) / sampleRate) * fftSize;
    rowBin[r] = Math.floor(bin);
    rowAlong[r] = bin - Math.floor(bin);
  }
  // The transform gives no more bins than the rows read. Rows above half the sample rate (of sound
  // at a rate so low) read bins that are not there, and stay white.
  const lowest = rowBin[rows - 1];
  const read = rowBin[0] + 2;
  const bins = Math.min(read, fftSize / 2 + 1);
  const spectrum = makeSpectrum(fftSize, hann, bins);
  /** Each bin's magnitude; on the decibel scale its square, and its decibels once a row has asked. */
  const magnitude = new Float64Array(read);
  const decibels = new Float64Array(read);
  /** The sound of a column whose transform reaches before the part given or past it. */
  const padded = new Float32Array(fftSize);

  const shade = shadeOf(scale);
  // amplitude as it is (the voice in the melodic range) takes no power, and needs no table
  const plain = scale.kind === 'amplitude' && scale.power === 1;
  const greys = plain ? new Int16Array(0) : greysOf(shade);
  const full = scale.kind === 'amplitude' ? scale.full : 1;
  // On the decibel scale a row between two bins that are both under the scale's floor is white,
  // whatever their logarithms. The floor as a squared magnitude, taken a millionth of a decibel
  // lower so that rounding cannot matter:
  const floor = scale.kind === 'db' ? scale.topDb - scale.rangeDb : 0;
  const range = scale.kind === 'db' ? scale.rangeDb : 1;
  const quiet = Math.max(0, Math.pow(10, (floor - 1e-6) / 20) - 1e-9) ** 2;
  const white = Math.round(shade(0));

  return (audio, offset, first, end) => {
    const out = new Uint8Array((end - first) * rows);
    for (let c = first, at = 0; c < end; c++) {
      let start = Math.round(c * hop) - window / 2 - offset;
      let sound = audio;
      if (start < 0 || start + fftSize > audio.length) {
        const from = Math.max(0, start);
        const to = Math.min(audio.length, start + window);
        padded.fill(0);
        if (to > from) padded.set(audio.subarray(from, to), from - start);
        sound = padded;
        start = 0;
      }
      const { re, im } = spectrum(sound, start);
      if (scale.kind === 'amplitude') {
        for (let k = lowest; k < bins; k++) magnitude[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        for (let r = 0; r < rows; r++, at++) {
          const k = rowBin[r];
          const between = magnitude[k] + rowAlong[r] * (magnitude[k + 1] - magnitude[k]);
          const level = Math.min(1, between / full);
          if (plain) out[at] = Math.round(255 * (1 - level));
          else {
            const grey = greys[(level * CELLS) | 0];
            out[at] = grey >= 0 ? grey : Math.round(shade(level));
          }
        }
      } else {
        for (let k = lowest; k < bins; k++) magnitude[k] = re[k] * re[k] + im[k] * im[k];
        decibels.fill(NaN);
        for (let r = 0; r < rows; r++, at++) {
          const k = rowBin[r];
          if (magnitude[k] < quiet && magnitude[k + 1] < quiet) {
            out[at] = white;
            continue;
          }
          let d0 = decibels[k];
          if (Number.isNaN(d0)) d0 = decibels[k] = 20 * Math.log10(Math.sqrt(magnitude[k]) + 1e-9);
          let d1 = decibels[k + 1];
          if (Number.isNaN(d1)) d1 = decibels[k + 1] = 20 * Math.log10(Math.sqrt(magnitude[k + 1]) + 1e-9);
          const level = Math.min(1, Math.max(0, (d0 + rowAlong[r] * (d1 - d0) - floor) / range));
          const grey = greys[(level * CELLS) | 0];
          out[at] = grey >= 0 ? grey : Math.round(shade(level));
        }
      }
    }
    return out;
  };
}
