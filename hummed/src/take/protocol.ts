// What the take's page and its worker say to each other.
import type { HeldNote } from '../shared/piano.ts';
import type { Misfit } from './inversion.ts';
import type { MovementOptions, Movements } from './movements.ts';
import type { Reading, TakeTiming } from './reading.ts';
import type { Roll } from './roll.ts';

/** The page to the worker. */
export type TakeRequest =
  | {
      readonly type: 'analyse';
      /** The take's sound: mono, 44.1 kHz. */
      readonly samples: Float32Array;
      readonly timing: TakeTiming;
      readonly roll: Roll;
      /** Whether the sound is a real voice's (see `InversionOptions.equalize`). */
      readonly equalize: boolean;
      readonly movements: MovementOptions;
      /** The tapper's lead as an earlier take found it (`ReadingOptions.tapLead`). */
      readonly tapLead?: number;
      /** How much the voice counts between the notes (`ReadingOptions.between`). */
      readonly between?: number;
    }
  /** The last take's movements read anew, with other options; its sound is not taken apart again. */
  | {
      readonly type: 'reread';
      readonly movements: MovementOptions;
      readonly tapLead?: number;
      readonly between?: number;
    }
  /** The last take's MPM performed, its expression exaggerated by `factor` (1: as it was read). */
  | { readonly type: 'perform'; readonly factor: number };

/** A take taken apart and read, as the page shows it. */
export interface TakeResult {
  readonly frames: number;
  readonly f0: Float32Array;
  readonly pressure: Float32Array;
  readonly adduction: Float32Array;
  readonly opening: Float32Array;
  readonly voiced: Uint8Array;
  /** The recording's level per frame, dB. */
  readonly level: Float32Array;
  /** The model's copy of the voice: mono, 44.1 kHz. */
  readonly copy: Float32Array;
  readonly misfits: readonly Misfit[];
  readonly movements: Movements;
  readonly reading: Reading;
  /** The take as Music Performance Markup (mpm.ts). */
  readonly mpm: string;
}

/** The worker to the page. */
export type TakeResponse =
  | { readonly type: 'round'; readonly pass: number; readonly passes: number; readonly misfit: Misfit }
  | { readonly type: 'done'; readonly result: TakeResult }
  | {
      readonly type: 'reread';
      readonly movements: Movements;
      readonly reading: Reading;
      readonly mpm: string;
    }
  /** The MPM as espressivo performs it: the bars' notes as the sampler holds them, from 0. */
  | {
      readonly type: 'performed';
      readonly factor: number;
      readonly notes: readonly HeldNote[];
      readonly length: number;
    }
  | { readonly type: 'failed'; readonly message: string };
