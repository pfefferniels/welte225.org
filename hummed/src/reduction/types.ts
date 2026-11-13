import type { Midi, Ticks } from '../shared/units.ts';

/** How a voiceless stream of air leaves the mouth: past the tongue tip (s) or the lower lip (f). */
export type AirPassage = 'teeth' | 'lips';

/** A sung note: tied notes are one, timed and voiced by the transcription note it points to. */
export interface SungNote {
  readonly kind: 'note';
  /** The `xml:id` of the note in the reduction (the first of a tie). */
  readonly id: string;
  /** The `xml:id` of the transcription note it follows. */
  readonly ref: string;
  readonly pitch: Midi;
  readonly start: Ticks;
  readonly end: Ticks;
  /** Held on while the piano moves: it ends where it is written, not where the key is let go. */
  readonly pedal: boolean;
}

/** The voice is silent, and breathes in before what follows. */
export interface Rest {
  readonly kind: 'rest';
  readonly start: Ticks;
  readonly end: Ticks;
}

export interface Air {
  readonly kind: 'air';
  readonly start: Ticks;
  readonly end: Ticks;
  readonly through: AirPassage;
}

export type ReductionEvent = SungNote | Rest | Air;

export interface Bar {
  readonly label: string;
  readonly tick: Ticks;
}

/** What is hummed, in score time. */
export interface Reduction {
  readonly events: readonly ReductionEvent[];
  /** The downbeat of every bar but the upbeat. */
  readonly bars: readonly Bar[];
}
