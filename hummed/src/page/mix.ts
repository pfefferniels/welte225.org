// One fader, elaboration, sets what is heard: how much of the music is there, and how refined. The
// piano plays the harmonic reductions, then the piece struck again on a grid, then the piece itself,
// the humming with it throughout, quieter and quieter as a pianist hums along (shared/shape.ts has
// the table).
import type { Performed } from '../shared/instructions.ts';
import {
  BORDERS,
  isPiece,
  pianoDb,
  pianoPlays,
  stepAt,
  voiceDb,
  voiceFollows,
  type Follows,
  type Plays,
} from '../shared/shape.ts';

/** Where what the piano plays changes along the fader. */
export { BORDERS };

/** The piano's level where it plays nothing and a part is switched on in the details. */
const PIANO = Math.pow(10, -5 / 20);
const gain = (db: number): number => (db <= -60 ? 0 : Math.pow(10, db / 20));

/** The gains of the humming and of the piano's two parts, of which one sounds at a time. */
export interface Mix {
  readonly hum: number;
  readonly harmonies: number;
  readonly piece: number;
}

/** What the piano plays: nothing, the harmonies (a reduction, as the setting has it), or the piece (as the setting plays it). */
export type PianoChoice = 'none' | 'harmonies' | 'piece';

/** What is heard: the humming or not, and which of the piano's parts, if any. */
export interface Parts {
  readonly voice: boolean;
  readonly piano: PianoChoice;
}

const unit = (x: number): number => Math.min(1, Math.max(0, x));

/** The piano's part for what it plays. */
const partOf = (plays: Plays): PianoChoice =>
  plays === 'none' ? 'none' : isPiece(plays) ? 'piece' : 'harmonies';

/** What the elaboration lets be heard: the humming, and the piano's part there (none at the bare end). */
export function partsAt(elaboration: number): Parts {
  return { voice: true, piano: partOf(pianoPlays(unit(elaboration))) };
}

/**
 * The gains for what is heard, the humming and the piano as loud as the elaboration has them; a
 * part the fader does not play there, switched on in the details, as loud as the piano is there (at
 * −5 dB where the piano plays nothing).
 */
export function mixOf(elaboration: number, parts: Parts): Mix {
  const e = unit(elaboration);
  const hum = parts.voice ? gain(voiceDb(e)) : 0;
  const piano = partsAt(e).piano === 'none' ? PIANO : gain(pianoDb(e));
  return {
    hum,
    harmonies: parts.piano === 'harmonies' ? piano : 0,
    piece: parts.piano === 'piece' ? piano : 0,
  };
}

export const mix = (elaboration: number): Mix => mixOf(elaboration, partsAt(elaboration));

/**
 * Whose instructions are heard: the piece's where the piano plays it or the voice follows it (as
 * it does at the setting it was rendered for: humming over it, or singing its melody), else the
 * harmonic reductions'. With nothing heard, the voice's.
 */
export function performedOf(parts: Parts, followed: Follows): Performed {
  const piece = followed === 'piece' || followed === 'melody';
  if (parts.piano === 'piece' || (parts.voice && piece)) return 'piece';
  return parts.piano === 'harmonies' || !piece ? 'reductions' : 'piece';
}

/**
 * Which stretch of the fader an elaboration is in: where what the piano plays and what the voice
 * follows are the same, and within a step, the step's.
 */
const stretchOf = (e: number): string => `${pianoPlays(e)} ${voiceFollows(e)} ${stepAt(e) ?? ''}`;

/**
 * The elaboration the voice is rendered for: within a step, the step's point (the stretch is one
 * setting); elsewhere in steps of 0.05, so that moving the fader renders anew only at each, and the
 * step on the fader's side of a border, so that what is rendered is what is heard.
 */
const ELABORATION_STEPS = 20;
export const voiceElaboration = (elaboration: number): number => {
  const e = unit(elaboration);
  const step = stepAt(e);
  if (step !== null) return step;
  const near = Math.round(e * ELABORATION_STEPS) / ELABORATION_STEPS;
  if (stretchOf(near) === stretchOf(e)) return near;
  const side =
    (near > e ? Math.floor(e * ELABORATION_STEPS) : Math.ceil(e * ELABORATION_STEPS)) / ELABORATION_STEPS;
  return stretchOf(side) === stretchOf(e) ? side : Math.round(e * 100) / 100;
};

/** Every elaboration the voice is rendered for, in order: what the Pianoteq recordings are of. */
export const RENDERED: readonly number[] = [
  ...new Set(Array.from({ length: 101 }, (_, i) => voiceElaboration(i / 100))),
].sort((a, b) => a - b);

/** What the fader shows: what the piano plays, or the humming, alone at the bare end. */
export const heard = (elaboration: number): Exclude<Plays, 'none'> | 'humming' => {
  const plays = pianoPlays(unit(elaboration));
  return plays === 'none' ? 'humming' : plays;
};
