// One fader, elaboration, sets what is heard: how much of the music is there. At 0 only the
// humming. Rising, the harmonies (the piece reduced to its chords) come in under it and grow while
// it recedes. From the middle up the piano plays the piece itself instead, and the humming goes
// on, quieter still, as a pianist hums along while playing.

/** Where the piano passes from the harmonies to the piece (as a fraction of the fader). */
export const PIECE_FROM = 0.5;
/** The piano's level: the piece's, and the harmonies' as they reach the middle. */
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
  if (e >= PIECE_FROM) return { hum, harmonies: 0, piece: PIANO };
  // from nothing at 0 to the piano's level at the middle, soon there: 7 dB under it a tenth of the
  // way up, 3 dB a quarter of the way
  return { hum, harmonies: PIANO * Math.sqrt(e / PIECE_FROM), piece: 0 };
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
