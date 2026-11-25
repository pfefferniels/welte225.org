// How the music is made along the fader: a table of points, set by ear in the tuner (an artifact that
// renders with this code, its values set directly), and the values between them. At each point, what
// the piano plays and how loud, how exaggerated, how fast and how inexactly; what the voice follows
// and how loud, how exaggerated its own gestures, how loosely on pitch and how readily heard. Between
// two points a number follows a monotone cubic through the points (smooth, and never beyond them
// between two); what the piano plays and what the voice follows hold from their point to the next. A
// point that is a step holds all its values up to the next: that stretch of the fader is one setting.
//
// So the fader goes: the harmonic reduction in half notes, gone through in a hurry (×2.4), the
// humming loud and loose over the piano's chords; the same in quarter notes; from 0.4 the piece,
// exaggerated, and from there more and more as Grünfeld plays it, the humming receding until at the
// top it is gone and the piano plays his performance as the reconstruction sets it down. In timing
// the voice goes with the piano (its tempo, its rubato and rolls exaggerated as the piano's, as
// inexactly struck), so that the two strike together.
import { monotoneCubic } from './math.ts';
import type { Setting } from './protocol.ts';

const unit = (x: number): number => Math.min(1, Math.max(0, x));

/** What the piano plays, or the voice follows: the harmonic reduction in half or in quarter notes, or the piece. */
export type Stage = 'halves' | 'quarters' | 'piece';
export type Plays = 'none' | Stage;

/** The points along the fader, as the tuner writes them (Copy settings). */
export const ELABORATION = {
  points: [0, 0.2, 0.4, 0.8, 1],
  steps: [false, false, false, false, false],
  piano: {
    plays: ['halves', 'quarters', 'piece', 'piece', 'piece'] as readonly Plays[],
    /** dB; −60 is off. */
    db: [-3, -2, -1, 0, 0],
    /** How far the MPM is exaggerated for the piano, and for the voice in timing: ×1 as Grünfeld. */
    exaggeration: [1.4, 1.98, 1.6, 1.1, 1],
    /** How much faster than Grünfeld, the piano and the voice alike. */
    tempo: [2.4, 1.6, 1.23, 1.05, 1],
    /** How inexactly struck: ms off, one standard deviation (and 8.3 % in loudness at 100 ms). */
    ms: [50, 10, 4, 2, 0],
  },
  voice: {
    follows: ['halves', 'quarters', 'piece', 'piece', 'piece'] as readonly Stage[],
    /** dB; −60 is off. */
    db: [-6, -12, -24, -52, -60],
    /** How far its own gestures are exaggerated: the dynamics, the articulation and the rest. */
    exaggeration: [1.5, 1.3, 1.2, 1.1, 1.1],
    /** How loosely it keeps to the written pitch, 0 to 1. */
    looseness: [1, 0.72, 0.42, 0.1, 0],
    /** How much the maps must move for it to be heard wholly, before the tempo (`threshold`). */
    presence: [0.36, 0.44, 0.4, 0.26, 0.18],
  },
} as const;

const { points, steps } = ELABORATION;

/** The point whose stretch an elaboration is in (up to the next point), or −1 before the first. */
function segmentAt(e: number): number {
  let k = -1;
  points.forEach((p, i) => {
    if (p <= e + 1e-9 && i < points.length - 1) k = i;
  });
  return k;
}

/** Where a step holds the elaboration: the step's point, else null. */
export function stepAt(elaboration: number): number | null {
  const k = segmentAt(unit(elaboration));
  return k >= 0 && steps[k] ? points[k] : null;
}

/** A number of the table at an elaboration: held within a step, else on the curve through the points. */
function numberAt(values: readonly number[], elaboration: number): number {
  const e = unit(elaboration);
  const k = segmentAt(e);
  if (k >= 0 && steps[k]) return values[k];
  return monotoneCubic(points, values, e);
}

/** A choice of the table at an elaboration: the last point's at or before it. */
function choiceAt<T>(values: readonly T[], elaboration: number): T {
  const e = unit(elaboration);
  let v = values[0];
  points.forEach((p, i) => {
    if (p <= e + 1e-9) v = values[i];
  });
  return v;
}

/** What the piano plays at an elaboration. */
export const pianoPlays = (elaboration: number): Plays => choiceAt(ELABORATION.piano.plays, elaboration);
/** What the voice follows: whose notes it takes, and what it sings (reductions.ts). */
export const voiceFollows = (elaboration: number): Stage => choiceAt(ELABORATION.voice.follows, elaboration);
/** The piano's level and the humming's, in dB. */
export const pianoDb = (elaboration: number): number => numberAt(ELABORATION.piano.db, elaboration);
export const voiceDb = (elaboration: number): number => numberAt(ELABORATION.voice.db, elaboration);

/**
 * Which harmonic reduction the piano's harmonies are at an elaboration: the one it plays; under the
 * piece the quarters, and where the piano is silent those it plays first.
 */
export function harmoniesStage(elaboration: number): 'halves' | 'quarters' {
  const plays = pianoPlays(elaboration);
  if (plays === 'halves' || plays === 'quarters') return plays;
  if (plays === 'piece') return 'quarters';
  return ELABORATION.piano.plays.find((p) => p === 'halves' || p === 'quarters') ?? 'halves';
}

/** Where what the piano plays changes along the fader: where the fader has a gap. */
export const BORDERS: readonly number[] = points.filter(
  (_, i) => i > 0 && ELABORATION.piano.plays[i] !== ELABORATION.piano.plays[i - 1],
);

/**
 * How the music is made at a setting: what the elaboration sets, of which the visitor may set the
 * flightiness (tempo and inexactness) and the exaggerations apart (the details under the fader).
 */
export interface Shape {
  /** How much faster than Grünfeld, the piano and the voice alike. */
  readonly tempo: number;
  /** How inexactly struck, the piano and the voice alike: ms off, one standard deviation. */
  readonly inexactMs: number;
  /** How far the MPM is exaggerated for the piano, and for the voice in timing, which it shares with the piano. */
  readonly pianoExaggeration: number;
  /** How far the voice's own gestures are exaggerated: the dynamics, the articulation and the rest. */
  readonly voiceExaggeration: number;
  /** How loosely the voice keeps to the written pitch, 0 to 1. */
  readonly approximateness: number;
  /** How much the maps must move for the voice to be heard wholly, at Grünfeld's tempo (`threshold`). */
  readonly presence: number;
}

/** How fast and how inexactly at an elaboration: what the flightiness slider of the details sets. */
const flightAt = (e: number): Pick<Shape, 'tempo' | 'inexactMs'> => ({
  tempo: numberAt(ELABORATION.piano.tempo, e),
  inexactMs: numberAt(ELABORATION.piano.ms, e),
});
/** How exaggerated at an elaboration: what the exaggeration slider of the details sets. */
const exaggerationAt = (e: number): Pick<Shape, 'pianoExaggeration' | 'voiceExaggeration'> => ({
  pianoExaggeration: numberAt(ELABORATION.piano.exaggeration, e),
  voiceExaggeration: numberAt(ELABORATION.voice.exaggeration, e),
});

/** The shape the elaboration gives. */
export const shapeAt = (elaboration: number): Shape => ({
  ...flightAt(elaboration),
  ...exaggerationAt(elaboration),
  approximateness: numberAt(ELABORATION.voice.looseness, elaboration),
  presence: numberAt(ELABORATION.voice.presence, elaboration),
});

/**
 * The shape of a setting: the elaboration's, but for what the visitor set apart, each as the fader
 * would have it where its slider stands.
 */
export const shapeOf = (setting: Setting): Shape => ({
  ...shapeAt(setting.elaboration),
  ...(setting.flighty !== undefined && flightAt(setting.flighty)),
  ...(setting.exaggerated !== undefined && exaggerationAt(setting.exaggerated)),
});

/** The piano's exaggeration, and the voice's in timing. */
export const pianoLevel = (shape: Pick<Shape, 'pianoExaggeration'>): number => shape.pianoExaggeration;

/** The voice's exaggeration, except in timing. */
export const voiceLevel = (shape: Pick<Shape, 'voiceExaggeration'>): number => shape.voiceExaggeration;

/** How much faster than the MPM the music goes, the piano and the voice alike. */
export const tempoFactor = (shape: Pick<Shape, 'tempo'>): number => shape.tempo;

/**
 * How inexactly the notes are struck at 100 ms, one standard deviation of each: how far each date of
 * the score comes early or late (ms), and how much louder or softer each note is (a fraction of its
 * velocity). Both scale with the shape's `inexactMs`.
 */
export const IMPRECISION = { timingMs: 100, dynamics: 0.083 } as const;

/**
 * How much the maps that govern the voice have to move for it to be heard wholly
 * (src/hummer/presence.ts), in what counts as 1 there: at the site's own (the tuner's start) the
 * dynamics at 3.6 units a second, the tempo changing by a quarter of itself a second. Movement is
 * read by the second, and music gone through faster moves as much sooner without moving more: the
 * threshold rises with the tempo.
 */
export const THRESHOLD = 0.6;
export const threshold = (shape: Pick<Shape, 'presence' | 'tempo'>): number => shape.presence * shape.tempo;

/** Where the page starts (index.html): the piece, a little exaggerated and a little faster, the humming under it. */
export const DEFAULT_ELABORATION = 0.65;
