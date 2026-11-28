// What the roll is made of: the notes as played and as rendered, the remarks with the notes they
// are about, and what the pointer finds on it.
import type { Ms, Ticks } from '../shared/units.ts';
import type { Bar, Grace, PieceNote, Press } from './piece.ts';
import type { Remark } from './remarks.ts';
import type { PedalKind, Sounded } from './rendering.ts';
import type { Signature } from './staff.ts';

/** A note of the roll: as it was played, and as the MPM renders it on the recording's clock. */
export interface RollNote extends PieceNote {
  readonly mpm: Sounded;
}

/** A remark as the roll holds it: with the notes it is about, and the two an arrow goes between. */
export interface Marked {
  readonly remark: Remark;
  readonly own: readonly RollNote[];
  readonly ends: readonly [RollNote, RollNote] | null;
  /**
   * The stretch of the score that is played for it, `to` exclusive: its passage with what it takes
   * around it to hear what is said of it (context.ts). Null for a remark about the whole piece.
   */
  readonly heard: { readonly from: Ticks; readonly to: Ticks } | null;
  /** The notes of that stretch that are not its own. */
  readonly around: readonly RollNote[];
}

export interface RollData {
  readonly notes: readonly RollNote[];
  readonly graces: readonly Grace[];
  /** The pedals as they were pressed, and as the MPM moves them (0 to 127 from each move on). */
  readonly presses: readonly Press[];
  readonly moves: readonly { readonly kind: PedalKind; readonly ms: Ms; readonly value: number }[];
  readonly bars: readonly Bar[];
  readonly signature: Signature;
  /** When the tempo has a score position, on the recording's clock. */
  readonly msAt: (date: Ticks) => Ms;
  /** How long the roll is. */
  readonly total: Ms;
}

/** What the pointer is on. */
export interface Hit {
  /** The remark whose words or arrow are under it. */
  readonly direct: Marked | null;
  /** The remark that is lit and over whose passage it is, whatever else lies there. */
  readonly held: Marked | null;
  readonly note: RollNote | null;
  /** Whether it is above the notes, among the rows of the whole piece and the ruler. */
  readonly above: boolean;
}
