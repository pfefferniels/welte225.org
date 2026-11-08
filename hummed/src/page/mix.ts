// One fader, abstractness, sets what is heard. At its top only the humming. Coming down, the
// harmonies (the piece reduced to its chords) come in under it and grow while it recedes. From the
// middle down the piano plays the piece itself instead, and the humming goes on, quieter still, as
// a pianist hums along while playing.

/** Where the piano passes from the harmonies to the piece (as a fraction of the fader). */
export const PIECE_BELOW = 0.5;
/** The piano's level: the piece's, and the harmonies' at the middle. */
const PIANO = Math.pow(10, -5 / 20);
/** The humming: 0 dB alone at the top, falling evenly in decibels to this at the bottom. */
const HUM_FLOOR_DB = -22;

/** The gains of the humming and of the piano's two parts, of which one sounds at a time. */
export interface Mix {
  readonly hum: number;
  readonly harmonies: number;
  readonly piece: number;
}

export function mix(abstractness: number): Mix {
  const a = Math.min(1, Math.max(0, abstractness));
  const hum = Math.pow(10, (HUM_FLOOR_DB * (1 - a)) / 20);
  if (a < PIECE_BELOW) return { hum, harmonies: 0, piece: PIANO };
  // from nothing at the top to the piano's level at the middle
  const rise = (1 - a) / (1 - PIECE_BELOW);
  return { hum, harmonies: PIANO * rise * rise, piece: 0 };
}

/** What the fader shows: what the piano plays, or that the humming is alone. */
export function heard(abstractness: number): 'humming' | 'harmonies' | 'piece' {
  const { harmonies, piece } = mix(abstractness);
  return piece > 0 ? 'piece' : harmonies > 0 ? 'harmonies' : 'humming';
}
