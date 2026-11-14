// How the voice is drawn: 360 log-spaced rows, 100 columns per second, black on white, in one of
// two styles. The melodic range (after Sonic Visualiser's "Melodic Range Spectrogram"), which the
// page shows, covers 40 Hz to 1.5 kHz with a long window and in amplitude rather than decibels, so
// the sung line and its first harmonics stand out; the full spectrogram (?spectrogram=full) shows the
// hum's harmonics up to 4.5 kHz in decibels.

/** What the page and the worker share about every style. */
export const SPECTROGRAM = {
  rows: 360,
  columnsPerSecond: 100,
  /** Samples between columns, of the voice (44.1 kHz). */
  hop: 441,
} as const;

/** How a level becomes a grey. */
export type SpectrogramScale =
  /** Decibels: `topDb` (of the raw FFT magnitude) darkest, `rangeDb` below it white. */
  | { readonly kind: 'db'; readonly topDb: number; readonly rangeDb: number }
  /** Amplitude: `full` (raw FFT magnitude) darkest, the fraction of it raised to `power`. */
  | { readonly kind: 'amplitude'; readonly full: number; readonly power: number };

export interface SpectrogramStyle {
  readonly fmin: number;
  readonly fmax: number;
  /** The analysis window (Hann), and the FFT it is zero-padded to. */
  readonly window: number;
  readonly fftSize: number;
  readonly scale: SpectrogramScale;
}

export const SPECTROGRAM_STYLES = {
  full: {
    fmin: 70,
    fmax: 4500,
    window: 4096,
    fftSize: 8192,
    scale: { kind: 'db', topDb: 33.09, rangeDb: 60 },
  },
  // the voice's strongest partials (the 99th percentile of each column's peak) at full black, in
  // linear amplitude as Sonic Visualiser draws it: the line and its octave, little else
  melodic: {
    fmin: 40,
    fmax: 1500,
    window: 8192,
    fftSize: 8192,
    scale: { kind: 'amplitude', full: 86.39, power: 1 },
  },
} as const satisfies Record<string, SpectrogramStyle>;

export type SpectrogramStyleName = keyof typeof SPECTROGRAM_STYLES;

export const isSpectrogramStyleName = (name: string | null): name is SpectrogramStyleName =>
  name !== null && Object.hasOwn(SPECTROGRAM_STYLES, name);

/**
 * The piano under the voice, in the same rows: how its level becomes a grey. In the melodic range
 * the square root of the amplitude, so that a key is seen for as long as it is heard and not at
 * its strike alone; full black where a loud chord's strongest partial is.
 */
export const PIANO_SCALES = {
  full: { kind: 'db', topDb: 33.09, rangeDb: 60 },
  melodic: { kind: 'amplitude', full: 86.39, power: 0.7 },
} as const satisfies Record<SpectrogramStyleName, SpectrogramScale>;

/** The inks: the humming in red over the piano in a blue grey, on white. */
export const INKS = {
  hum: [184, 28, 44],
  piano: [52, 72, 96],
} as const satisfies Record<string, readonly [number, number, number]>;
