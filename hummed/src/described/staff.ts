// Spelling and staff positions, for drawing pitches on a grand staff: where a spelled pitch sits,
// the ledger lines it needs, the key signature read off the notes.
import type { Midi } from '../shared/units.ts';

export type Letter = 'c' | 'd' | 'e' | 'f' | 'g' | 'a' | 'b';
export type StaffName = 'treble' | 'bass';

/** A pitch as it is written: its letter, how far it is altered (−1 a flat, 1 a sharp), its key. */
export interface Spelled {
  readonly letter: Letter;
  readonly alter: number;
  readonly pitch: Midi;
}

export const LETTERS: readonly Letter[] = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const NATURAL: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

export const isLetter = (name: string): name is Letter => (LETTERS as readonly string[]).includes(name);

/** Staff positions (see `stepOf`) of the five lines of each staff, bottom line first. */
export const BASS: readonly number[] = [18, 20, 22, 24, 26];
export const TREBLE: readonly number[] = [30, 32, 34, 36, 38];
export const linesOf = (staff: StaffName): readonly number[] => (staff === 'treble' ? TREBLE : BASS);

/** Where the accidentals of a key signature sit on the treble staff, in the order they are added. */
const FLATS = {
  letters: ['b', 'e', 'a', 'd', 'g', 'c', 'f'],
  treble: [34, 37, 33, 36, 32, 35, 31],
} as const;
const SHARPS = {
  letters: ['f', 'c', 'g', 'd', 'a', 'e', 'b'],
  treble: [38, 35, 39, 36, 33, 37, 34],
} as const;

/**
 * Staff position of a spelled pitch, in diatonic steps: middle C is 28, and every line of the
 * grand staff, ledger lines included, is an even number.
 */
export const stepOf = ({ letter, alter, pitch }: Spelled): number =>
  (Math.floor((pitch - alter) / 12) - 1) * 7 + LETTERS.indexOf(letter);

/** The ledger lines a note at `step` needs on a staff, given the staff's five lines. */
export function ledgersOf(step: number, staff: readonly number[]): number[] {
  const lines: number[] = [];
  for (let line = staff[4] + 2; line <= step; line += 2) lines.push(line);
  for (let line = staff[0] - 2; line >= step; line -= 2) lines.push(line);
  return lines;
}

/** A key signature: for each altered letter, its alteration. */
export type Signature = ReadonlyMap<Letter, number>;

/** The key signature, read off the notes: for each letter, the accidental most of its notes carry. */
export function signatureOf(spelled: readonly Pick<Spelled, 'letter' | 'alter'>[]): Signature {
  const signature = new Map<Letter, number>();
  for (const letter of LETTERS) {
    const alters = spelled.filter((note) => note.letter === letter).map((note) => note.alter);
    const altered = alters.filter((alter) => alter !== 0);
    if (altered.length > alters.length * 0.6) signature.set(letter, Math.sign(altered[0]));
  }
  return signature;
}

/** The signature's accidentals as they are written on a staff, left to right: which, and where. */
export function signatureMarks(
  signature: Signature,
  staff: StaffName,
): { readonly alter: number; readonly step: number }[] {
  const flats = [...signature.values()].some((alter) => alter < 0);
  const { letters, treble } = flats ? FLATS : SHARPS;
  const marks: { alter: number; step: number }[] = [];
  for (const [index, letter] of letters.entries()) {
    if (!signature.has(letter)) break;
    marks.push({ alter: flats ? -1 : 1, step: treble[index] - (staff === 'bass' ? 14 : 0) });
  }
  return marks;
}

/** A spelling for a pitch that has none: a black key as a flat in a flat key, a sharp in a sharp one. */
export function spell(pitch: Midi, signature: Signature): Spelled {
  const sharps = [...signature.values()].some((alter) => alter > 0);
  const pitchClass = ((pitch % 12) + 12) % 12;
  const natural = NATURAL.indexOf(pitchClass);
  if (natural !== -1) return { letter: LETTERS[natural], alter: 0, pitch };
  const alter = sharps ? 1 : -1;
  return { letter: LETTERS[NATURAL.indexOf(pitchClass - alter)], alter, pitch };
}

/** A pitch's name as it is said: its letter, its accidentals, its octave (middle C is C4). */
export function nameOf({ letter, alter, pitch }: Spelled): string {
  const accidental = alter > 0 ? '♯'.repeat(alter) : '♭'.repeat(-alter);
  return `${letter.toUpperCase()}${accidental}${Math.floor((pitch - alter) / 12) - 1}`;
}
