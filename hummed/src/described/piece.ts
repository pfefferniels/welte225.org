// The piece as the roll shows it: the notes of the score that the roll plays, each as it is
// written (its staff and spelling, from ../mpm/score.msm) and as it was recorded
// (../mpm/transcription.mei, read by the site's own reader with the work file's corrections); the
// grace notes, which only the recording has; the pedals as they were pressed; the bars.
import { readRoll, withCorrections, type Correction, type Roll } from '../take/roll.ts';
import type { Ms, Ticks } from '../shared/units.ts';
import type { PedalKind, Sounded } from './rendering.ts';
import { isLetter, signatureOf, stepOf, type Signature, type Spelled, type StaffName } from './staff.ts';

/** A note of the score that the roll plays. Times are in ms from the roll's first note. */
export interface PieceNote extends Spelled {
  readonly id: string;
  readonly date: Ticks;
  readonly duration: Ticks;
  /** The hand: the part of the score it is in, 1 the right. */
  readonly part: number;
  /** The staff it is written on, and where on it (staff.ts). */
  readonly staff: StaffName;
  readonly step: number;
  /** As it was recorded, its velocity as the reconstruction corrects it. */
  readonly played: Sounded;
}

/** A grace note: the score gives it no date, the recording a time. */
export interface Grace extends Spelled {
  readonly id: string;
  readonly staff: StaffName;
  readonly step: number;
  readonly ms: Ms;
  readonly velocity: number;
}

export interface Press {
  readonly kind: PedalKind;
  readonly ms: Ms;
  readonly msEnd: Ms;
}

export interface Bar {
  /** Counted from 1 through the piece as played; an upbeat is bar 0. */
  readonly number: number;
  readonly from: Ticks;
  readonly to: Ticks;
  /** The length of its beat. */
  readonly beat: Ticks;
}

export interface Piece {
  readonly notes: readonly PieceNote[];
  readonly byId: ReadonlyMap<string, PieceNote>;
  readonly graces: readonly Grace[];
  readonly presses: readonly Press[];
  readonly bars: readonly Bar[];
  /** Every beat, and every date a note begins on, ascending. */
  readonly beats: readonly Ticks[];
  readonly dates: readonly Ticks[];
  readonly end: Ticks;
  /** The key signature, read off the notes. */
  readonly signature: Signature;
}

/** The work file, as far as the piece is read from it. */
export interface WorkFile {
  readonly provenance: readonly (Correction & {
    readonly id?: string;
    readonly options: { readonly prefer?: string };
  })[];
}

const attribute = (tag: string, name: string): string | null =>
  new RegExp(`(?:^|\\s)${name.replace('.', '\\.')}="([^"]*)"`).exec(tag)?.[1] ?? null;

const staffOf = (part: number): StaffName => (part === 1 ? 'treble' : 'bass');

/** How each note of the score is written: its letter and accidentals, and the part it is in. */
function writtenIn(msm: string): Map<string, { letter: string; alter: number; part: number }> {
  const written = new Map<string, { letter: string; alter: number; part: number }>();
  for (const [, head, body] of msm.matchAll(/<part\b([^>]*)>([\s\S]*?)<\/part>/g)) {
    const part = Number(attribute(head, 'number'));
    for (const [tag] of body.matchAll(/<note\b[^>]*>/g)) {
      const id = attribute(tag, 'xml:id');
      if (id === null) continue;
      written.set(id, {
        letter: attribute(tag, 'pitchname') ?? '',
        alter: Number(attribute(tag, 'accidentals') ?? 0),
        part,
      });
    }
  }
  return written;
}

/** The beat of each time signature: a quarter in 4/4. */
function beatsIn(msm: string): { date: Ticks; beat: Ticks }[] {
  const signatures = [...msm.matchAll(/<timeSignature\b[^>]*\/>/g)]
    .map(([tag]) => ({
      date: Number(attribute(tag, 'date')),
      beat: (4 * 720) / Number(attribute(tag, 'denominator')),
    }))
    .filter((signature) => signature.beat > 0 && Number.isFinite(signature.beat))
    .sort((a, b) => a.date - b.date);
  return signatures.length > 0 ? signatures : [{ date: 0, beat: 720 }];
}

const ALTERS: Readonly<Record<string, number>> = { s: 1, f: -1, n: 0, ss: 2, x: 2, ff: -2 };
const NATURALS: Readonly<Record<string, number>> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * The grace notes as the transcription writes them, by id: the staff, the letter, the accidental
 * (written, or only sounding as the key has it) and the key.
 */
function gracesIn(mei: string): Map<string, Spelled & { staff: StaffName }> {
  const graces = new Map<string, Spelled & { staff: StaffName }>();
  for (const group of mei.matchAll(/<graceGrp\b[^>]*>([\s\S]*?)<\/graceGrp>/g)) {
    // the staff the group stands in: the last one opened before it
    const staff = [...mei.slice(0, group.index).matchAll(/<staff\b[^>]*\sn="(\d+)"/g)].at(-1)?.[1];
    for (const note of group[1].matchAll(/<note\b([^>]*?)(?:\/>|>([\s\S]*?)<\/note>)/g)) {
      // a note written in one tag has no body
      const [tag, body] = [note[1], note.at(2) ?? ''];
      const id = attribute(tag, 'xml:id');
      const letter = attribute(tag, 'pname') ?? '';
      const octave = Number(attribute(tag, 'oct'));
      if (id === null || !isLetter(letter) || !Number.isFinite(octave)) continue;
      const accidental = /<accid\b([^>]*)>/.exec(body)?.[1] ?? '';
      const sign =
        attribute(tag, 'accid') ??
        attribute(tag, 'accid.ges') ??
        attribute(accidental, 'accid') ??
        attribute(accidental, 'accid.ges');
      const alter = ALTERS[sign ?? 'n'] ?? 0;
      const pitch = (octave + 1) * 12 + NATURALS[letter] + alter;
      graces.set(id, { letter, alter, pitch, staff: staffOf(Number(staff ?? 1)) });
    }
  }
  return graces;
}

/** What the take recorded of notes the score does not have: when, and how loud. */
function unwritten(
  mei: string,
  source: string | undefined,
  roll: Roll,
): { id: string; ms: Ms; velocity: number }[] {
  const recordings = [...mei.matchAll(/<recording\b([^>]*)>([\s\S]*?)<\/recording>/g)];
  const recording = recordings.find((r) => attribute(r[1], 'source') === source) ?? recordings.at(0);
  if (!recording) return [];
  const whens = [...recording[2].matchAll(/<when\b([^>]*)>([\s\S]*?)<\/when>/g)].flatMap(([, tag, body]) => {
    const id = attribute(tag, 'data')?.replace(/^#/, '');
    const at = parseFloat(attribute(tag, 'absolute') ?? 'NaN');
    const velocity = parseFloat(/<extData type="velocity">([^<]*)</.exec(body)?.[1] ?? 'NaN');
    return id !== undefined && Number.isFinite(at) ? [{ id, at, velocity }] : [];
  });
  // the roll's clock begins with the first of all its notes
  const zero = Math.min(...whens.map((when) => when.at));
  const known = new Set(roll.notes.map((note) => note.id));
  return whens
    .filter((when) => !known.has(when.id))
    .map(({ id, at, velocity }) => ({ id, ms: at - zero, velocity }));
}

/** The piece, from the texts of the reconstruction as the site publishes them. */
export function readPiece(msm: string, mei: string, work: WorkFile): Piece {
  const prefer = work.provenance.find((call) => call.name === 'MakeChoice')?.options.prefer;
  const roll = withCorrections(readRoll(mei, msm, prefer), work.provenance);
  const written = writtenIn(msm);

  const notes = roll.notes
    .flatMap((note): PieceNote[] => {
      const spelled = written.get(note.id);
      if (!spelled || !isLetter(spelled.letter)) return [];
      const spelling: Spelled = { letter: spelled.letter, alter: spelled.alter, pitch: note.pitch };
      return [
        {
          id: note.id,
          date: note.date,
          duration: note.duration,
          part: spelled.part,
          staff: staffOf(spelled.part),
          ...spelling,
          step: stepOf(spelling),
          played: { ms: note.onset * 1000, msEnd: note.end * 1000, velocity: note.velocity },
        },
      ];
    })
    .sort((a, b) => a.date - b.date || a.pitch - b.pitch);
  const signature = signatureOf(notes);

  const spellings = gracesIn(mei);
  const graces = unwritten(mei, prefer, roll).flatMap(({ id, ms, velocity }): Grace[] => {
    // the repeat's notes are the first time's, written once
    const spelled = spellings.get(id.replace(/-rend2$/, ''));
    if (!spelled) return [];
    return [{ id, ...spelled, step: stepOf(spelled), ms, velocity }];
  });

  const signatures = beatsIn(msm);
  const bars = roll.bars.map((bar): Bar => ({
    number: bar.number,
    from: bar.date,
    to: bar.date + bar.length,
    beat: (signatures.findLast((signature) => signature.date <= bar.date) ?? signatures[0]).beat,
  }));
  const beats = bars.flatMap((bar) => {
    const within: Ticks[] = [];
    for (let date = bar.from; date < bar.to - 1e-6; date += bar.beat) within.push(date);
    return within;
  });

  return {
    notes,
    byId: new Map(notes.map((note) => [note.id, note])),
    graces,
    presses: roll.presses
      .map((press) => ({ kind: press.kind, ms: press.onset * 1000, msEnd: press.end * 1000 }))
      .sort((a, b) => a.ms - b.ms),
    bars,
    beats,
    dates: [...new Set(notes.map((note) => note.date))].sort((a, b) => a - b),
    end: roll.end,
    signature,
  };
}

/** The bar a score position is in. */
export function barAt(bars: readonly Bar[], tick: Ticks): Bar | undefined {
  return bars.findLast((bar) => tick >= bar.from - 1e-6) ?? bars.at(0);
}

/** The beat a score position is on in its bar, as it is said: "2", "2.5". */
function beatIn(bar: Bar, tick: Ticks): string {
  const beat = Math.round((1 + (tick - bar.from) / bar.beat) * 100) / 100;
  return Number.isInteger(beat) ? String(beat) : beat.toFixed(2).replace(/0+$/, '');
}

/** Where a score position is, as it is said: "bar 3", "bar 3, beat 2.5". */
export function where(bars: readonly Bar[], tick: Ticks): string {
  const bar = barAt(bars, tick);
  if (!bar) return '';
  const beat = beatIn(bar, tick);
  return beat === '1' ? `bar ${bar.number}` : `bar ${bar.number}, beat ${beat}`;
}

/** A stretch of the score as it is said, up to where it ends; `to` is exclusive. */
export function stretch(bars: readonly Bar[], from: Ticks, to: Ticks): string {
  const first = barAt(bars, from);
  const last = barAt(bars, Math.max(from, to - 1));
  if (!first || !last) return '';
  if (from === first.from && to === last.to)
    return first.number === last.number ? `bar ${first.number}` : `bars ${first.number}–${last.number}`;
  // within one bar, the bar is said once
  if (first === last && to < last.to)
    return `bar ${first.number}, beat ${beatIn(first, from)} to ${beatIn(first, to)}`;
  return `${where(bars, from)} to ${where(bars, to)}`;
}
