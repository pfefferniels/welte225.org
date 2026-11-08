/** The spectrogram both sides draw: 360 log-spaced rows from 70 Hz to 4.5 kHz, 100 columns per second. */
export const SPECTROGRAM = {
  rows: 360,
  fmin: 70,
  fmax: 4500,
  columnsPerSecond: 100,
  /** Samples between columns. */
  hop: 441,
  window: 4096,
  fftSize: 8192,
  /** The level drawn darkest, dB, and the range below it that is drawn at all. */
  topDb: 41.09,
  rangeDb: 60,
} as const;
