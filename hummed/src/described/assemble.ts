// The page's material, made from the texts the site publishes: the piece as the roll plays it, the
// MPM's rendering laid on the recording's clock, and the remarks, each with the notes it is about
// and what it wrote.
import type { Ms, Ticks } from '../shared/units.ts';
import { contextOf, withinReach } from './context.ts';
import { readPiece, type Piece, type WorkFile } from './piece.ts';
import {
  callsOf,
  elementNames,
  notesOf,
  readRemarks,
  writtenBy,
  type Remark,
  type Written,
} from './remarks.ts';
import { lay, perform, temposOf, type Laid } from './rendering.ts';
import type { Marked, RollData, RollNote } from './types.ts';

export interface Texts {
  /** ../mpm/score.msm, transcription.mei and performance.mpm. */
  readonly msm: string;
  readonly mei: string;
  readonly mpm: string;
  /** ../mpm/work.json, parsed. */
  readonly work: unknown;
  /** ../described/remarks.json, parsed: read where the work file has no remarks. */
  readonly remarks: unknown;
}

export interface Described {
  readonly piece: Piece;
  readonly laid: Laid;
  readonly roll: RollData;
  readonly marked: readonly Marked[];
  /** What each remark wrote, by the remark's id. */
  readonly written: ReadonlyMap<string, Written>;
  /** Whether the remarks are the stand-in's, not the work file's own. */
  readonly interim: boolean;
}

/**
 * The stretch of the score played for a remark, `to` exclusive: its passage with what it takes
 * around it, by what the remark wrote, and no further than is within reach in the roll's time.
 */
function heardFor(remark: Remark, written: Written, piece: Piece, laid: Laid): { from: Ticks; to: Ticks } {
  const { about } = remark;
  const scope = { kind: about.kind, from: about.from, to: about.to, ids: about.notes };
  const score = {
    dates: piece.dates,
    beats: piece.beats,
    bars: piece.bars.map((bar) => bar.from),
    notes: piece.notes,
  };
  const context = withinReach(
    piece.dates,
    scope,
    contextOf(score, scope, written.topics, written.touched),
    laid.msAt,
  );
  return { from: context.from, to: piece.dates.find((date) => date > context.to) ?? piece.end };
}

/**
 * A remark with the notes of the roll it is about, and those played around them. An arrow goes
 * from the first note it names to the last; where the roll does not play one of them (a note of
 * the score the take has not), from or to the passage's own first or last note.
 */
function mark(
  remark: Remark,
  notes: readonly RollNote[],
  byId: ReadonlyMap<string, RollNote>,
  heard: { from: Ticks; to: Ticks } | null,
): Marked {
  const own = notesOf(remark.about, notes);
  const mine = new Set(own);
  const around = heard
    ? notes.filter((note) => note.date >= heard.from && note.date < heard.to && !mine.has(note))
    : [];
  if (remark.about.kind !== 'arrow') return { remark, own, ends: null, heard, around };
  const named = remark.about.notes.map((id) => byId.get(id));
  const first = named.at(0) ?? own.at(0);
  const last = (named.length > 1 ? named.at(-1) : undefined) ?? own.at(-1);
  const ends = first && last && first.date < last.date ? ([first, last] as const) : null;
  return { remark, own, ends, heard, around };
}

export function assemble({ msm, mei, mpm, work, remarks }: Texts): Described {
  const piece = readPiece(msm, mei, work as WorkFile);
  const laid = lay(
    perform(msm, mpm),
    temposOf(mpm),
    piece.notes.map((note) => ({ id: note.id, date: note.date, ms: note.played.ms })),
    [...piece.dates, ...piece.beats],
    piece.end,
  );
  // a note the rendering lacks is drawn where it was played: it has no shadow
  const notes = piece.notes.map((note): RollNote => ({
    ...note,
    mpm: laid.notes.get(note.id) ?? note.played,
  }));
  const byId = new Map(notes.map((note) => [note.id, note]));
  const total: Ms = Math.max(
    laid.msAt(piece.end),
    ...notes.map((note) => Math.max(note.played.msEnd, note.mpm.msEnd)),
    ...piece.presses.map((press) => press.msEnd),
  );

  const own = readRemarks(work);
  const read = own.length > 0 ? own : readRemarks(remarks);
  const calls = callsOf(work);
  const names = elementNames(mpm);
  const written = new Map(read.map((remark) => [remark.id, writtenBy(remark, calls, names)]));
  const writtenOf = (remark: Remark): Written =>
    written.get(remark.id) ?? { ids: [], topics: new Set(), touched: [] };
  return {
    piece,
    laid,
    roll: {
      notes,
      graces: piece.graces,
      presses: piece.presses,
      moves: laid.pedals,
      bars: piece.bars,
      signature: piece.signature,
      msAt: laid.msAt,
      total,
    },
    marked: read.map((remark) =>
      mark(
        remark,
        notes,
        byId,
        remark.about.kind === 'piece' ? null : heardFor(remark, writtenOf(remark), piece, laid),
      ),
    ),
    written,
    interim: own.length === 0,
  };
}

/** How far the rendering's onsets lie from the recording's, in the middle: the median, in ms. */
export function onsetDifference(notes: readonly RollNote[]): Ms {
  const apart = notes.map((note) => Math.abs(note.played.ms - note.mpm.ms)).sort((a, b) => a - b);
  return apart.at(apart.length >> 1) ?? 0;
}
