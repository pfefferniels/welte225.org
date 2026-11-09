// What the page and the worker say to each other.
import type { Reduction } from '../reduction/types.ts';
import type { PianoPart } from './piano.ts';
import type { SpectrogramScale, SpectrogramStyleName } from './spectrogram.ts';
import type { Seconds, Ticks } from './units.ts';

/** Where a rendering starts: a place in the score (kept across levels) or a time in this level. */
export type StartAt = { readonly tick: Ticks } | { readonly seconds: Seconds };

/**
 * What a rendering is of: the elaboration, which sets how exaggerated the piano's performance is,
 * how much more the voice's, and how loosely the voice keeps to the pitch.
 */
export interface Setting {
  readonly elaboration: number;
}

/**
 * The page runs several workers. Each prepares the levels it is asked about (the same for all: the
 * chain is deterministic); the first is asked for the plan, the others only to stop what they were
 * doing, so that the plan comes as soon as it can; then every worker renders the chunks it is
 * handed, ranges of tract states between places where the voice is silent. A message with a newer
 * request id stops the work for an older one.
 */
export type ToWorker =
  | { readonly type: 'setup'; readonly reduction: Reduction; readonly spectrogram: SpectrogramStyleName }
  | { readonly type: 'plan'; readonly id: number; readonly setting: Setting; readonly start: StartAt }
  | { readonly type: 'stop'; readonly id: number }
  | {
      readonly type: 'chunk';
      readonly id: number;
      readonly setting: Setting;
      readonly from: number;
      readonly to: number;
    };

export interface Timings {
  readonly espressivo: number;
  readonly hummer: number;
  readonly gestures: number;
}

export interface Plan {
  readonly type: 'plan';
  readonly id: number;
  readonly setting: Setting;
  /** The piano's exaggeration, and the voice's (further, except in timing). */
  readonly pianoLevel: number;
  readonly voiceLevel: number;
  /** The rendering's length. */
  readonly duration: Seconds;
  readonly bars: readonly (readonly [Seconds, string])[];
  /** Score time against performed ms (without the padding), for keeping a place across levels. */
  readonly clock: { readonly ticks: readonly Ticks[]; readonly ms: readonly number[] };
  /** The piano's two parts: the piece, and its harmonies (reduction/harmonies.mei) in the same performance. */
  readonly piece: PianoPart;
  readonly harmonies: PianoPart;
  readonly timings: Timings;
  /** Where the sound starts coming, and its tract state (at the start of a 10 ms slot). */
  readonly startSeconds: Seconds;
  readonly startState: number;
  /** Tract states in all (110 samples each), and those where the voice is silent, to cut at. */
  readonly stateCount: number;
  readonly seams: readonly number[];
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
  | { readonly type: 'chunkDone'; readonly id: number; readonly from: number; readonly to: number }
  | { readonly type: 'error'; readonly id: number; readonly message: string };

/**
 * A worker of its own draws the piano under the voice: the page hands it a part's sound as it is
 * heard (a recording, or the sampled grand played ahead), and gets its spectrogram back in columns,
 * from the one asked for to the end and then from the beginning. A newer request stops an older.
 */
export interface PictureRequest {
  readonly type: 'picture';
  readonly id: number;
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly spectrogram: SpectrogramStyleName;
  readonly scale: SpectrogramScale;
  /** The column to begin with: where the playhead is. */
  readonly from: number;
}

export interface PictureColumns {
  readonly type: 'columns';
  readonly id: number;
  readonly column: number;
  readonly count: number;
  readonly pixels: Uint8Array;
}
