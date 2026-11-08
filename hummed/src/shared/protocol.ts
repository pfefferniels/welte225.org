// What the page and the worker say to each other.
import type { Reduction } from '../reduction/types.ts';
import type { PianoPart } from './piano.ts';
import type { SpectrogramStyleName } from './spectrogram.ts';
import type { Seconds, Ticks } from './units.ts';

/** Where a rendering starts: a place in the score (kept across levels) or a time in this level. */
export type StartAt = { readonly tick: Ticks } | { readonly seconds: Seconds };

/**
 * The page runs several workers. Each prepares the levels it is asked about (the same for all: the
 * chain is deterministic); the first is asked for the plan, the others only to stop what they were
 * doing, so that the plan comes as soon as it can; then every worker renders the chunks it is
 * handed, ranges of tract states between places where the voice is silent. A message with a newer
 * request id stops the work for an older one.
 */
export type ToWorker =
  | { readonly type: 'setup'; readonly reduction: Reduction; readonly spectrogram: SpectrogramStyleName }
  | { readonly type: 'plan'; readonly id: number; readonly level: number; readonly start: StartAt }
  | { readonly type: 'stop'; readonly id: number }
  | {
      readonly type: 'chunk';
      readonly id: number;
      readonly level: number;
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
  /** The piano's exaggeration, and the voice's (a step further, except in timing). */
  readonly level: number;
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
