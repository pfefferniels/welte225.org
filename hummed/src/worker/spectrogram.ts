// Spectrogram columns of the voice, black on white, as grey levels (0 black, 255 white).
import { SPECTROGRAM, type SpectrogramScale, type SpectrogramStyle } from '../shared/spectrogram.ts';
import { SAMPLE_RATE } from '../shared/units.ts';
import { makeFft } from './fft.ts';

/** Grey for a level from 0 (quiet) to 1 (loud) on the decibel scale: white through mid grey to black. */
function greyOfDb(level: number): number {
  const x = Math.pow(level, 1.15);
  return Math.round(x < 0.45 ? 255 - (115 * x) / 0.45 : 140 * (1 - (x - 0.45) / 0.55));
}

/** The grey of one row, interpolated between the two FFT bins around it, on the style's scale. */
function greyOf(scale: SpectrogramScale, m0: number, m1: number, f: number): number {
  if (scale.kind === 'db') {
    const d0 = 20 * Math.log10(m0 + 1e-9);
    const level = d0 + f * (20 * Math.log10(m1 + 1e-9) - d0);
    return greyOfDb(Math.min(1, Math.max(0, (level - (scale.topDb - scale.rangeDb)) / scale.rangeDb)));
  }
  const amplitude = Math.min(1, (m0 + f * (m1 - m0)) / scale.full);
  return Math.round(255 * (1 - Math.pow(amplitude, scale.power)));
}

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

export function makeSpectrogram(style: SpectrogramStyle, sampleRate = SAMPLE_RATE): SpectrogramColumns {
  const { rows } = SPECTROGRAM;
  const hop = sampleRate / SPECTROGRAM.columnsPerSecond;
  const fft = makeFft(style.fftSize);
  const hann = Float64Array.from(
    { length: style.window },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (style.window - 1)),
  );
  /** The FFT bin (fractional) under each row, the top row highest. */
  const rowBins = Float64Array.from(
    { length: rows },
    (_, r) => ((style.fmax * Math.pow(style.fmin / style.fmax, r / (rows - 1))) / sampleRate) * style.fftSize,
  );
  const frame = new Float64Array(style.window);
  return (audio, offset, first, end) => {
    const out = new Uint8Array((end - first) * rows);
    for (let c = first; c < end; c++) {
      const centre = Math.round(c * hop);
      for (let i = 0; i < style.window; i++) {
        const k = centre - style.window / 2 + i - offset;
        frame[i] = (k >= 0 && k < audio.length ? audio[k] : 0) * hann[i];
      }
      const { re, im } = fft(frame);
      for (let r = 0; r < rows; r++) {
        const b = rowBins[r];
        const i0 = Math.floor(b);
        out[(c - first) * rows + r] = greyOf(
          style.scale,
          Math.hypot(re[i0], im[i0]),
          Math.hypot(re[i0 + 1], im[i0 + 1]),
          b - i0,
        );
      }
    }
    return out;
  };
}
