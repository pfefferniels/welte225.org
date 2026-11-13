// One fader, elaboration, sets what is heard: how much of the music is there. At 0 only the
// humming. Above it the piano plays under the humming, at once as loud as it will be: for the first
// third the harmonies (the piece reduced to its chords), from there on the piece itself. The humming
// recedes as the fader rises and goes on, quieter still, as a pianist hums along while playing.
import { PIECE_FROM } from '../shared/shape.ts';

/** Where the piano passes from the harmonies to the piece (shared/shape.ts: the exaggeration starts anew there). */
export { PIECE_FROM };

/** The piano's level, the same for both parts: it comes in whole, and does not fade in. */
const PIANO = Math.pow(10, -5 / 20);
/** The humming: 0 dB alone at 0, falling to this at the top, fast at first (as the square root). */
const HUM_FLOOR_DB = -22;

/** The gains of the humming and of the piano's two parts, of which one sounds at a time. */
export interface Mix {
  readonly hum: number;
  readonly harmonies: number;
  readonly piece: number;
}

/** What the piano plays: nothing, the harmonies, or the piece. */
export type PianoChoice = 'none' | 'harmonies' | 'piece';

/** What is heard: the humming or not, and which of the piano's parts, if any. */
export interface Parts {
  readonly voice: boolean;
  readonly piano: PianoChoice;
}

const unit = (x: number): number => Math.min(1, Math.max(0, x));

/** What the elaboration lets be heard: the humming always, the piano from the first step on. */
export function partsAt(elaboration: number): Parts {
  const e = unit(elaboration);
  return { voice: true, piano: e === 0 ? 'none' : e < PIECE_FROM ? 'harmonies' : 'piece' };
}

/** The gains for what is heard, the humming as loud as the elaboration has it. */
export function mixOf(elaboration: number, parts: Parts): Mix {
  const hum = parts.voice ? Math.pow(10, (HUM_FLOOR_DB * Math.sqrt(unit(elaboration))) / 20) : 0;
  return {
    hum,
    harmonies: parts.piano === 'harmonies' ? PIANO : 0,
    piece: parts.piano === 'piece' ? PIANO : 0,
  };
}

export const mix = (elaboration: number): Mix => mixOf(elaboration, partsAt(elaboration));

/** The elaboration the voice is rendered for: in steps, so that moving the fader renders anew only at each. */
const ELABORATION_STEPS = 20;
export const voiceElaboration = (elaboration: number): number =>
  Math.round(unit(elaboration) * ELABORATION_STEPS) / ELABORATION_STEPS;

/** What the fader shows: what the piano plays, or that the humming is alone. */
export function heard(elaboration: number): 'humming' | 'harmonies' | 'piece' {
  const { harmonies, piece } = mix(elaboration);
  return piece > 0 ? 'piece' : harmonies > 0 ? 'harmonies' : 'humming';
}
