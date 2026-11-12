// What the roll gives: the recorded notes, each with the written note it plays, as MPM Desk's
// alignment has them (../mpm/transcription.mei, one <recording> per take of the roll) and the
// score positions of those notes (../mpm/score.msm). This is what a take is hummed along with and
// what its movements are fitted to: the performance's MPM is not read.
import { groupBy } from '../shared/math.ts';
import type { Midi, Seconds, Ticks } from '../shared/units.ts';

export interface RollNote {
  /** The written note's `xml:id` (the repeat's notes end in `-rend2`). */
  readonly id: string;
  readonly pitch: Midi;
  /** Where the note is written, and for how long, in ticks (720 a quarter). */
  readonly date: Ticks;
  readonly duration: Ticks;
  /** When the roll plays it, in seconds from its first note. */
  readonly onset: Seconds;
  readonly end: Seconds;
  readonly velocity: Midi;
}

/** A pedal held from `onset` to `end`. */
export interface Press {
  readonly kind: 'sustain' | 'soft';
  readonly onset: Seconds;
  readonly end: Seconds;
}

/** The notes written at one date, as the roll plays them, in the order they sound. */
export interface Chord {
  readonly date: Ticks;
  readonly notes: readonly RollNote[];
  /** The first and the last of its notes to sound. */
  readonly first: Seconds;
  readonly last: Seconds;
  readonly velocity: number;
}

export interface Bar {
  /** Counted from 1 through the piece as played, the repeat written out; an upbeat is bar 0. */
  readonly number: number;
  readonly date: Ticks;
  readonly length: Ticks;
}

export interface Roll {
  readonly notes: readonly RollNote[];
  readonly chords: readonly Chord[];
  readonly presses: readonly Press[];
  readonly bars: readonly Bar[];
  readonly end: Ticks;
}

export class RollError extends Error {
  override name = 'RollError';
}

export const TICKS_PER_QUARTER = 720;

const attribute = (tag: string, name: string): string | null =>
  new RegExp(`(?:^|\\s)${name.replace('.', '\\.')}="([^"]*)"`).exec(tag)?.[1] ?? null;
const numberOf = (tag: string, name: string): number => Number(attribute(tag, name) ?? NaN);

/**
 * The roll's take `source` (the one the reconstruction prefers; the first if none is named) against
 * the score.
 */
export function readRoll(mei: string, msm: string, source?: string): Roll {
  const written = new Map<string, { pitch: Midi; date: Ticks; duration: Ticks }>();
  for (const [tag] of msm.matchAll(/<note\b[^>]*>/g)) {
    const id = attribute(tag, 'xml:id');
    if (id)
      written.set(id, {
        pitch: numberOf(tag, 'midi.pitch'),
        date: numberOf(tag, 'date'),
        duration: numberOf(tag, 'duration'),
      });
  }
  if (written.size === 0) throw new RollError('the score has no notes');

  const recordings = [...mei.matchAll(/<recording\b([^>]*)>([\s\S]*?)<\/recording>/g)];
  const recording = recordings.find((r) => attribute(r[1], 'source') === source) ?? recordings.at(0);
  if (!recording) throw new RollError('the transcription has no recording');
  const sounded: { id: string | null; kind: string | null; at: number; ms: number; velocity: number }[] = [];
  for (const [, tag, body] of recording[2].matchAll(/<when\b([^>]*)>([\s\S]*?)<\/when>/g)) {
    const ext = (type: string): number =>
      parseFloat(new RegExp(`<extData type="${type}">([^<]*)<`).exec(body)?.[1] ?? 'NaN');
    sounded.push({
      id: attribute(tag, 'data')?.replace(/^#/, '') ?? null,
      kind: attribute(tag, 'type'),
      at: parseFloat(attribute(tag, 'absolute') ?? 'NaN'),
      ms: ext('duration'),
      velocity: ext('velocity'),
    });
  }
  const first = Math.min(...sounded.filter((s) => s.id !== null).map((s) => s.at));
  const notes: RollNote[] = [];
  const presses: Press[] = [];
  for (const s of sounded) {
    const onset = (s.at - first) / 1000;
    const end = onset + s.ms / 1000;
    if (s.id === null) {
      if (s.kind === 'sustain' || s.kind === 'soft') presses.push({ kind: s.kind, onset, end });
      continue;
    }
    const note = written.get(s.id);
    if (!note || !Number.isFinite(onset) || !Number.isFinite(end)) continue;
    notes.push({ id: s.id, ...note, onset, end, velocity: s.velocity });
  }
  if (notes.length === 0) throw new RollError('no recorded note is aligned with the score');
  notes.sort((a, b) => a.onset - b.onset);

  const chords = [...groupBy(notes, (n) => n.date)]
    .map(([date, members]): Chord => ({
      date,
      notes: members,
      first: members[0].onset,
      last: members[members.length - 1].onset,
      velocity: members.reduce((sum, n) => sum + n.velocity, 0) / members.length,
    }))
    .sort((a, b) => a.date - b.date);

  // bars: by the time signatures; a first bar shorter than the next is the upbeat, bar 0
  const signatures = [...msm.matchAll(/<timeSignature\b[^>]*\/>/g)]
    .map(([tag]) => ({
      date: numberOf(tag, 'date'),
      length: (numberOf(tag, 'numerator') * 4 * TICKS_PER_QUARTER) / numberOf(tag, 'denominator'),
    }))
    .filter((t) => t.length > 0)
    .sort((x, y) => x.date - y.date);
  if (signatures.length === 0) signatures.push({ date: 0, length: 4 * TICKS_PER_QUARTER });
  const end = Math.max(...[...written.values()].map((n) => n.date + n.duration));
  const bars: Bar[] = [];
  const upbeat = signatures.length > 1 && signatures[1].date - signatures[0].date < signatures[1].length;
  for (let date = signatures[0].date; date < end;) {
    const signature = signatures.findLast((t) => t.date <= date) ?? signatures[0];
    const next = signatures.find((t) => t.date > date);
    const length = Math.min(signature.length, (next?.date ?? Infinity) - date);
    bars.push({ number: bars.length + (upbeat ? 0 : 1), date, length });
    date += length;
  }
  return { notes, chords, presses, bars, end };
}

/**
 * When the roll is at a score position: the chords' first notes, and a straight line between them
 * (and beyond the ends, at the pace of the nearest two).
 */
export function timeAt(roll: Roll, date: Ticks): Seconds {
  const c = roll.chords;
  let i = 0;
  while (i + 2 < c.length && c[i + 1].date <= date) i++;
  const a = c[i];
  const b = c[i + 1];
  return a.first + ((date - a.date) / (b.date - a.date)) * (b.first - a.first);
}

/** The score position the roll is at, at a time: the inverse of `timeAt`. */
export function dateAt(roll: Roll, time: Seconds): Ticks {
  const c = roll.chords;
  let i = 0;
  while (i + 2 < c.length && c[i + 1].first <= time) i++;
  const a = c[i];
  const b = c[i + 1];
  if (b.first === a.first) return a.date;
  return a.date + ((time - a.first) / (b.first - a.first)) * (b.date - a.date);
}

/** A stretch of the piece to hum along with: whole bars, the first bar and the last, counted from 1. */
export interface Section {
  readonly firstBar: number;
  readonly lastBar: number;
  readonly from: Ticks;
  readonly to: Ticks;
}

export function sectionOf(roll: Roll, firstBar: number, lastBar: number): Section {
  const first = roll.bars.find((b) => b.number === firstBar);
  const last = roll.bars.find((b) => b.number === lastBar);
  if (!first || !last || lastBar < firstBar) throw new RollError(`no bars ${firstBar} to ${lastBar}`);
  // an upbeat belongs to the first bar
  const upbeat = roll.bars.find((b) => b.number === 0);
  return {
    firstBar,
    lastBar,
    from: firstBar === 1 && upbeat ? upbeat.date : first.date,
    to: last.date + last.length,
  };
}
