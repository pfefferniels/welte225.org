// What the page and the worker say to each other.
import type { ArticulatorMove } from '../hummer/articulators.ts';
import type { DynamicsCurve } from '../hummer/performance.ts';
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
 * The name the page gives the workers that render the voice: one so named loads VocalTractLab and
 * the data as soon as it is there, before the page has said anything to it.
 */
export const VOICE_WORKER = 'voice';

/**
 * The page runs several workers, and one request at a time: a message with a newer request id stops
 * the work for an older one.
 *
 * The first worker plans. Asked for a `plan`, it prepares the setting (unless it has kept it: it
 * keeps the last few it prepared), answers with the plan, and goes straight on to render the first
 * chunk of `chunkOrder(plan)`, the one that will be heard first, without being handed it.
 *
 * With other workers to help, they prepare the setting side by side, talking over channels of their
 * own (`link`: the page's thread is often busy drawing, and would hold their messages up). The
 * planner asks a helper to `perform` the piano's two parts (`piano`), which the plan needs and the
 * voice does not. It performs the voice itself and hums it, sends the lips-open gestural score to a
 * helper (`score`) and turns the lips-closed one into tract states itself; the helper sends back
 * the open score's (`open`). With two helpers, one plays the piano and the other, before it is sent
 * the score, performs the voice with sub-note dynamics and sends the curve the hummer reads of it
 * (`dynamics`), which the planner otherwise does after the voice's own performance. Should a helper
 * fail, the page tells the planner that it is `alone`, and it does the rest itself.
 *
 * Every worker then renders the chunks it is handed, ranges of tract states between places where the
 * voice is silent, one after another in the order they come. A worker renders from the prepared
 * setting, its `level`: the planner makes a copy for each worker that has not got this one (`share`
 * of them) once its own first sound is out, and the page hands each copy on, followed by that
 * worker's first chunk. A worker handed a chunk of a setting it has no level of prepares it itself:
 * later, but the same, the chain being deterministic.
 */
export type ToWorker =
  | {
      readonly type: 'setup';
      readonly reduction: Reduction;
      readonly spectrogram: SpectrogramStyleName;
      /** How many prepared settings the planning worker keeps (some 27 MB each). */
      readonly keep: number;
    }
  /**
   * Channels to the workers this one prepares settings with. The planner's lead to its helpers: the
   * first turns the open score into states, the last performs the piano, and of two the first
   * performs the dynamics. A helper's leads to the planner.
   */
  | { readonly type: 'link'; readonly ports: readonly MessagePort[] }
  | {
      readonly type: 'plan';
      readonly id: number;
      readonly setting: Setting;
      readonly start: StartAt;
      /** Whether there is a worker to help with the preparation. */
      readonly helped: boolean;
      /** How many copies of the level to send after the plan, for the workers without it. */
      readonly share: number;
    }
  | { readonly type: 'stop'; readonly id: number }
  | {
      readonly type: 'chunk';
      readonly id: number;
      readonly setting: Setting;
      readonly from: number;
      readonly to: number;
    }
  | { readonly type: 'alone'; readonly id: number }
  | LevelMessage;

/** What the planner and a helper say to each other, over their own channel. */
export type BetweenWorkers = PerformRequest | ScoreMessage | PianoMessage | DynamicsMessage | OpenMessage;

/** The planner to a helper: perform the piano's two parts, or the voice's dynamics, at this setting. */
export interface PerformRequest {
  readonly type: 'perform';
  readonly id: number;
  readonly setting: Setting;
  readonly what: 'piano' | 'dynamics';
}

/** The helper to the planner: the dynamics of the voice's performance as a curve, and how long it took (ms). */
export interface DynamicsMessage {
  readonly type: 'dynamics';
  readonly id: number;
  readonly curve: DynamicsCurve;
  readonly ms: number;
}

/** The planner to a helper: a gestural score to turn into tract states, the articulators moved. */
export interface ScoreMessage {
  readonly type: 'score';
  readonly id: number;
  readonly score: string;
  readonly maxStates: number;
  readonly moves: readonly ArticulatorMove[];
}

/** The helper to the planner: the piano's two parts, and how long they took (ms). */
export interface PianoMessage {
  readonly type: 'piano';
  readonly id: number;
  readonly piece: PianoPart;
  readonly harmonies: PianoPart;
  readonly ms: number;
}

/** The helper to the planner: the tract states of the score it was sent, and how long they took (ms). */
export interface OpenMessage {
  readonly type: 'open';
  readonly id: number;
  readonly count: number;
  readonly tract: Float64Array;
  readonly ms: number;
}

/**
 * A prepared setting, what its chunks are rendered from: the tract states of both scores (19 values
 * a state), the glottis (11 a state), the lips' opening per ms, and the plan as far as it does not
 * depend on where a rendering starts.
 */
export interface LevelData {
  readonly plan: PlanBody;
  readonly closed: Float64Array;
  readonly glottis: Float64Array;
  readonly open: Float64Array;
  readonly weight: Float32Array;
}

/** The planner to a worker that has no level of the request's setting. */
export interface LevelMessage {
  readonly type: 'level';
  readonly id: number;
  readonly level: LevelData;
}

/** How long the preparation took (ms), the helper's part included. */
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

/** A plan without what depends on where the rendering starts: the same for every request of a setting. */
export type PlanBody = Omit<Plan, 'id' | 'startSeconds' | 'startState'>;

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
  | { readonly type: 'error'; readonly id: number; readonly message: string }
  | LevelMessage;

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
