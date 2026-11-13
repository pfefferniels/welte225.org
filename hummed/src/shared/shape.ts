// How the music is made along the fader. From left to right, the piano goes from the harmonic
// reduction in half notes through the same in quarters to the piece; meanwhile everything that makes
// a sketch of it falls, smoothly, from its height at the bare end: how fast and how inexactly it goes
// (the flightiness: twice as fast, 100 ms off), how exaggerated the voice's gestures (×2) and how loud
// the voice is (page/mix.ts). The piano's exaggeration does otherwise: none in the half notes, where
// the MPM's tempo and dynamics apply as they are, rising to ×2 where the piece comes in, as raw as it
// gets, and falling from there to the MPM as Grünfeld's performance sets it down, at the top.
// (Gone through twice as fast, ×2 is what works: at Grünfeld's tempo doubled sounded unnatural.)
// In timing the voice goes with the piano, so that the two strike together.
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

/**
 * What the piano plays along the fader: the harmonic reduction in half notes, running evenly; from
 * here the same in quarter notes, the whole harmony struck on every quarter; from here the piece.
 */
export const QUARTERS_FROM = 0.25;
export const PIECE_FROM = 0.45;
export type Stage = 'halves' | 'quarters' | 'piece';
export const stageAt = (elaboration: number): Stage =>
  elaboration < QUARTERS_FROM ? 'halves' : elaboration < PIECE_FROM ? 'quarters' : 'piece';

/**
 * How far the MPM is exaggerated for the piano at an elaboration, 0 to 1: not at all in the half
 * notes (the MPM's tempo and dynamics as they are), rising through the quarters to the full where
 * the piece comes in, then falling to the MPM as it is at the top; flat where it starts to rise,
 * at the top and at the end, so that it has no corner anywhere.
 */
export const exaggeration = (elaboration: number): number => {
  const e = unit(elaboration);
  if (e < QUARTERS_FROM || e === 1) return 0;
  if (e < PIECE_FROM)
    return Math.pow(Math.sin(((Math.PI / 2) * (e - QUARTERS_FROM)) / (PIECE_FROM - QUARTERS_FROM)), 2);
  return Math.pow(Math.cos(((Math.PI / 2) * (e - PIECE_FROM)) / (1 - PIECE_FROM)), 2);
};

/**
 * How far the voice's own gestures are exaggerated, from 1 at the bare end to 0 at the top: once,
 * smoothly, as its loudness and the flightiness fall, where the piano's rises and falls. In timing
 * the voice goes with the piano, or the two would not strike together.
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

/** The piano's exaggeration (and the voice's timing): ×1 in the half notes, ×2 where the piece comes in, ×1 at 1. */
export const pianoLevel = (shape: Pick<Shape, 'exaggeration'>): number => 1 + shape.exaggeration;

/** The voice's, except in timing: ×2 at the bare end, falling smoothly to ×1.1 at the top. */
export const voiceLevel = (shape: Pick<Shape, 'voiceExaggeration'>): number =>
  1.1 + 0.9 * shape.voiceExaggeration;

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

/** Where the page starts (index.html): the piece, the piano ×1.71, the humming ×1.21 under it. */
export const DEFAULT_ELABORATION = 0.65;
