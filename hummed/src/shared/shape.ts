// How exaggerated the performance is, how flighty (how fast, how exactly struck), and how loosely the
// voice sings: all follow the elaboration, unless the visitor sets the first two apart (`Shape`).
// The barer the music (0, the humming alone), the rawer the gestures: the MPM ×2 (at Grünfeld's tempo
// doubled sounded unnatural, ×1.6 still too much; gone through twice as fast, it is what works); the
// more of it there is, the subtler, until at 1 the piano plays the reconstruction as the MPM sets it
// down. The barer, the more of a sketch it is, too: gone through faster, and less exactly.
// The voice is the inner guide of the playing: a little more exaggerated than the piano, except
// where notes move in time, which it shares with the piano so that the two stay together.
import type { Setting } from './protocol.ts';

const unit = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * How the music is made at a setting: what the elaboration sets, the flightiness and the
 * exaggerations of which the visitor may set apart from it (the details under the fader).
 */
export interface Shape {
  /** How much of a sketch it is, 0 (as the MPM has it) to 1: how much faster, and how much less exactly. */
  readonly flightiness: number;
  /**
   * How much rawer the piano's gestures, 0 (as the MPM has it) to 1: how far the MPM is exaggerated
   * for the piano, and for the voice in timing, which it shares with the piano.
   */
  readonly exaggeration: number;
  /** How much rawer the voice's own gestures, 0 to 1: the dynamics, the articulation and the rest. */
  readonly voiceExaggeration: number;
  /** How loosely the voice keeps to the written pitch, 0 to 1. */
  readonly approximateness: number;
}

/**
 * How flighty the music is at an elaboration, 1 alone and 0 at the top, falling as the exaggeration
 * does: a sketch is gone through quickly (`tempoFactor`) and struck less exactly (`IMPRECISION`,
 * imprecision.ts).
 */
export const flightiness = (elaboration: number): number => Math.pow(1 - unit(elaboration), 2);

/** Where the piano passes from the harmonies to the piece (as a fraction of the fader). */
export const PIECE_FROM = 1 / 3;

/**
 * How far the MPM is exaggerated for the piano at an elaboration, from 1 to 0, fast, then gently:
 * from the humming alone through the harmonies (to 0.44 just before the piece), and anew through
 * the piece, which comes in as raw as the humming was, refined to the MPM as it is at the top.
 */
export const exaggeration = (elaboration: number): number => {
  const e = unit(elaboration);
  return e < PIECE_FROM ? Math.pow(1 - e, 2) : Math.pow(1 - (e - PIECE_FROM) / (1 - PIECE_FROM), 2);
};

/**
 * How far the voice's own gestures are exaggerated, from 1 alone to 0 at the top: once, smoothly,
 * over the whole fader, where the piano's starts anew with the piece. In timing the voice goes with
 * the piano, or the two would not strike together.
 */
export const voiceExaggeration = (elaboration: number): number => Math.pow(1 - unit(elaboration), 2);

/** How loosely the voice keeps to the written pitch, 0 to 1: loosest alone, closest under the piece. */
export const approximateness = (elaboration: number): number => 1 - unit(elaboration);

/** The shape the elaboration gives. */
export const shapeAt = (elaboration: number): Shape => ({
  flightiness: flightiness(elaboration),
  exaggeration: exaggeration(elaboration),
  voiceExaggeration: voiceExaggeration(elaboration),
  approximateness: approximateness(elaboration),
});

/**
 * The shape of a setting: the elaboration's, but for what the visitor set apart, each where its
 * slider stands on the fader's scale.
 */
export const shapeOf = (setting: Setting): Shape => ({
  ...shapeAt(setting.elaboration),
  ...(setting.flighty !== undefined && { flightiness: flightiness(setting.flighty) }),
  ...(setting.exaggerated !== undefined && {
    exaggeration: exaggeration(setting.exaggerated),
    voiceExaggeration: voiceExaggeration(setting.exaggerated),
  }),
});

/** The piano's exaggeration (and the voice's timing): ×2 alone and where the piece comes in, ×1 at 1. */
export const pianoLevel = (shape: Pick<Shape, 'exaggeration'>): number => 1 + shape.exaggeration;

/**
 * The voice's, except in timing: ×1.85 alone, ×1.43 where the piece comes in (no jump, where the
 * piano's goes back to ×2), ×1.1 at the top, a little beyond the piano's there.
 */
export const voiceLevel = (shape: Pick<Shape, 'voiceExaggeration'>): number =>
  1.1 + 0.75 * shape.voiceExaggeration;

/**
 * How much faster than the MPM the music goes, the piano and the voice alike: ×2 at the bare end, ×1
 * at 1. Exaggerated, the tempo's slow stretches grow more than its fast ones shrink: the factor
 * outweighs that, so that the piece is the shorter the barer it is.
 */
export const tempoFactor = (shape: Pick<Shape, 'flightiness'>): number => 1 + shape.flightiness;

/**
 * How inexactly the notes are struck when the music is wholly flighty, the piano and the voice
 * alike, one standard deviation of each: how far each date of the score comes early or late (ms),
 * and how much louder or softer each note is (a fraction of its velocity).
 */
export const IMPRECISION = { timingMs: 100, dynamics: 0.083 } as const;

/**
 * How much the maps that govern the voice have to move for it to be heard wholly
 * (src/hummer/presence.ts), in what counts as 1 there: at the MPM's own tempo the dynamics at 3.6
 * units a second, the tempo changing by a quarter of itself a second. Movement is read by the
 * second, and a sketch gone through faster moves as much sooner without moving more: the threshold
 * rises with the tempo. Otherwise it is the same at every elaboration: the barer the music, the
 * more exaggerated the MPM and the more its maps move, so the more of the voice is heard.
 */
export const THRESHOLD = 0.6;
export const threshold = (shape: Pick<Shape, 'flightiness'>): number => THRESHOLD * tempoFactor(shape);

/** Where the page starts (index.html): the piece (×1.12), the humming under it (×1.19). */
export const DEFAULT_ELABORATION = 0.65;
