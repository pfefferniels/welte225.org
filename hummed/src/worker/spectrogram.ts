// Spectrogram columns of the voice, black on white, as grey levels (0 black, 255 white).
import { SPECTROGRAM as SPEC } from '../shared/spectrogram.ts';
import { SAMPLE_RATE } from '../shared/units.ts';
import { makeFft } from './fft.ts';

const fft = makeFft(SPEC.fftSize);
const hann = Float64Array.from(
  { length: SPEC.window },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SPEC.window - 1)),
);
/** The FFT bin (fractional) under each row, the top row highest. */
const rowBins = Float64Array.from(
  { length: SPEC.rows },
  (_, r) => ((SPEC.fmax * Math.pow(SPEC.fmin / SPEC.fmax, r / (SPEC.rows - 1))) / SAMPLE_RATE) * SPEC.fftSize,
);
const frame = new Float64Array(SPEC.window);
const db = (re: Float64Array, im: Float64Array, i: number): number =>
  20 * Math.log10(Math.hypot(re[i], im[i]) + 1e-9);

/** Grey for a level from 0 (quiet) to 1 (loud): white through mid grey to black. */
function grey(level: number): number {
  const x = Math.pow(level, 1.15);
  return Math.round(x < 0.45 ? 255 - (115 * x) / 0.45 : 140 * (1 - (x - 0.45) / 0.55));
}

/** Columns `first` up to `end` of the audio, each centred on its hop. */
export function spectrogramColumns(audio: Float32Array, first: number, end: number): Uint8Array {
  const out = new Uint8Array((end - first) * SPEC.rows);
  for (let c = first; c < end; c++) {
    const centre = c * SPEC.hop;
    for (let i = 0; i < SPEC.window; i++) {
      const k = centre - SPEC.window / 2 + i;
      frame[i] = (k >= 0 && k < audio.length ? audio[k] : 0) * hann[i];
    }
    const { re, im } = fft(frame);
    for (let r = 0; r < SPEC.rows; r++) {
      const b = rowBins[r];
      const i0 = Math.floor(b);
      const f = b - i0;
      const d0 = db(re, im, i0);
      const level = d0 + f * (db(re, im, i0 + 1) - d0);
      out[(c - first) * SPEC.rows + r] = grey(
        Math.min(1, Math.max(0, (level - (SPEC.topDb - SPEC.rangeDb)) / SPEC.rangeDb)),
      );
    }
  }
  return out;
}
