// What the page and the worker say to each other.
import type { Reduction } from '../reduction/types.ts';
import type { SpectrogramStyleName } from './spectrogram.ts';
import type { Midi, Seconds, Ticks } from './units.ts';

/** Where a rendering starts: a place in the score (kept across levels) or a time in this level. */
export type StartAt = { readonly tick: Ticks } | { readonly seconds: Seconds };

export type ToWorker =
  | { readonly type: 'setup'; readonly reduction: Reduction; readonly spectrogram: SpectrogramStyleName }
  | { readonly type: 'render'; readonly id: number; readonly level: number; readonly start: StartAt };

/** A piano note as the page plays it: held by the sustain pedal as on the roll. */
export interface PianoNote {
  readonly on: Seconds;
  readonly duration: Seconds;
  readonly pitch: Midi;
  readonly velocity: Midi;
}

export interface Timings {
  readonly espressivo: number;
  readonly hummer: number;
  readonly gestures: number;
}

export interface Plan {
  readonly type: 'plan';
  readonly id: number;
  /** The piano's exaggeration, and the voice's (a step further, except in timing). */
  readonly level: number;
  readonly voiceLevel: number;
  /** The rendering's length. */
  readonly duration: Seconds;
  readonly bars: readonly (readonly [Seconds, string])[];
  /** Score time against performed ms (without the padding), for keeping a place across levels. */
  readonly clock: { readonly ticks: readonly Ticks[]; readonly ms: readonly number[] };
  readonly piano: readonly PianoNote[];
  readonly timings: Timings;
  /** Where the sound starts coming. */
  readonly startSeconds: Seconds;
}

export interface AudioMessage {
  readonly type: 'audio';
  readonly id: number;
  /** The first sample of `samples` in the rendering. */
  readonly start: number;
  readonly samples: Float32Array;
  /** Spectrogram columns (rows each, black on white), from column `column` on, if any are ready. */
  readonly spectrogram: {
    readonly column: number;
    readonly count: number;
    readonly pixels: Uint8Array;
  } | null;
}

export type FromWorker =
  | Plan
  | AudioMessage
  | { readonly type: 'done'; readonly id: number }
  | { readonly type: 'error'; readonly id: number; readonly message: string };
