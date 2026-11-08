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

export interface Rest {
  readonly kind: 'rest';
  readonly start: Ticks;
  readonly end: Ticks;
  /** A rest marked as a breath: the voice breathes in before what follows. */
  readonly breath: boolean;
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

/** A grace note of the harmonies (reduction/harmonies.mei), sounding just before the note it leads to. */
export interface Grace {
  readonly id: string;
  readonly pitch: Midi;
  /** The `xml:id` of the note it leads to. */
  readonly before: string;
}
