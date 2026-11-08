import type { Seconds } from '../shared/units.ts';

/** How the hummer hums, measured from a recording of the pianist humming (data/hum-style.json). */
export interface HumStyle {
  /** Semitones each breath-led onset starts below its pitch, used in turn. */
  readonly scoops: readonly number[];
  /** How long a note fades before its end, where a breath follows. */
  readonly releaseS: Seconds;
  /** The pitch wobble's spread, in cents. */
  readonly wobbleCents: number;
}

/** The voice's level corrections (data/calibration.json), written by tools/calibrate.ts. */
export interface Calibration {
  /** Output gain of the voice. */
  readonly gain: number;
  /** Per sung note, by its `xml:id` in the reduction: dB to add so it is as loud as the dynamics ask. */
  readonly notes: Readonly<Record<string, number>>;
}
