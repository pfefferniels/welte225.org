// One fader, elaboration, sets what is heard: how much of the music is there. At 0 only the
// humming. Above it the piano plays under the humming, at once as loud as it will be: for the first
// third the harmonies (the piece reduced to its chords), from there on the piece itself. The humming
// recedes as the fader rises and goes on, quieter still, as a pianist hums along while playing.

/** Where the piano passes from the harmonies to the piece (as a fraction of the fader). */
export const PIECE_FROM = 1 / 3;
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

export function mix(elaboration: number): Mix {
  const e = Math.min(1, Math.max(0, elaboration));
  const hum = Math.pow(10, (HUM_FLOOR_DB * Math.sqrt(e)) / 20);
  if (e === 0) return { hum, harmonies: 0, piece: 0 };
  return e < PIECE_FROM ? { hum, harmonies: PIANO, piece: 0 } : { hum, harmonies: 0, piece: PIANO };
}

/** The elaboration the voice is rendered for: in steps, so that moving the fader renders anew only at each. */
const ELABORATION_STEPS = 20;
export const voiceElaboration = (elaboration: number): number =>
  Math.round(Math.min(1, Math.max(0, elaboration)) * ELABORATION_STEPS) / ELABORATION_STEPS;

/** What the fader shows: what the piano plays, or that the humming is alone. */
export function heard(elaboration: number): 'humming' | 'harmonies' | 'piece' {
  const { harmonies, piece } = mix(elaboration);
  return piece > 0 ? 'piece' : harmonies > 0 ? 'harmonies' : 'humming';
}
