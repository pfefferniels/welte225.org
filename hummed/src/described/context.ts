// How much of the music around a passage has to be played for what is said of it to be heard. A
// passage is never played bare: the time a note takes is only heard when the next one comes, a
// pulse only against the beat before, a touch only against the neighbours in the same hand.
import type { Ms, Ticks } from '../shared/units.ts';

/** What a remark wrote, in the terms the rules are stated in. */
export type Topic = 'tempo' | 'rubato' | 'dynamics' | 'roll' | 'touch' | 'accent' | 'pedal';

/** What the rules read of the score. A chord is every note on one date. */
export interface ContextScore {
  /** Every date a note begins on, ascending. */
  readonly dates: readonly Ticks[];
  /** Every beat, ascending. */
  readonly beats: readonly Ticks[];
  /** Every bar's first tick, ascending. */
  readonly bars: readonly Ticks[];
  readonly notes: readonly { readonly id: string; readonly date: Ticks; readonly part: number }[];
}

/** What a remark is about, as the rules need it; `to` is exclusive. */
export interface ContextScope {
  readonly kind: string;
  readonly from: Ticks;
  readonly to: Ticks;
  /** The notes it names, where it names any. */
  readonly ids?: readonly string[];
}

/** Never more context than this to either side, in beats. */
const MOST_BEATS = 2;
/** Nor further than this from the passage in time, however slow the music; the nearest chord is kept all the same. */
export const REACH: Ms = 2600;

/**
 * The stretch of the score to play for a passage, with what is needed around it to hear what a
 * remark says of it. Both ends are inclusive: the first and the last date to play.
 *
 * - Always the chord before, to measure against, and the chord after.
 * - A pulse (tempo, rubato, a rolled chord against its beat) needs an interval before it began and
 *   one after it ended: back to the beat before the passage's first, on through a second chord.
 * - Touch (legato, detached, held over) and anything said of single notes is between a note and
 *   its neighbours in the same hand: the note before and the note after in that hand.
 * - An accent pattern is heard over its whole bar; the pedal over the beat either side.
 *
 * `touched` are the notes whose touch the remark is about, where it names them.
 */
export function contextOf(
  { dates, beats, bars, notes }: ContextScore,
  scope: ContextScope,
  about: ReadonlySet<Topic>,
  touched: readonly string[] = [],
): { from: Ticks; to: Ticks } {
  const inside = dates.filter((date) => date >= scope.from && date < scope.to);
  const first = inside.at(0) ?? scope.from;
  const last = inside.at(-1) ?? scope.from;
  const start = dates.at(0) ?? scope.from;
  const end = dates.at(-1) ?? scope.from;
  const chordBefore = (date: Ticks, count = 1): Ticks =>
    dates.filter((other) => other < date).at(-count) ?? start;
  const chordAfter = (date: Ticks, count = 1): Ticks =>
    dates.filter((other) => other > date).at(count - 1) ?? end;
  const atOrBefore = (grid: readonly Ticks[], date: Ticks): Ticks =>
    grid.filter((mark) => mark <= date).at(-1) ?? grid.at(0) ?? date;
  const after = (grid: readonly Ticks[], date: Ticks): Ticks =>
    grid.find((mark) => mark > date) ?? grid.at(-1) ?? date;
  const beat = (beats.at(1) ?? 720) - (beats.at(0) ?? 0);

  let from = chordBefore(first);
  let to = chordAfter(last);

  if (about.has('tempo') || about.has('rubato') || about.has('roll')) {
    from = Math.min(from, atOrBefore(beats, atOrBefore(beats, first) - 1), chordBefore(first, 2));
    to = Math.max(to, Math.min(chordAfter(last, 2), to + 1.5 * beat));
  }
  const named = scope.kind === 'notes' || scope.kind === 'box';
  const own = new Set(touched.length > 0 ? touched : named ? (scope.ids ?? []) : []);
  if (own.size > 0 || about.has('touch')) {
    const mine = notes.filter((note) =>
      own.size > 0 ? own.has(note.id) : note.date >= scope.from && note.date < scope.to,
    );
    for (const part of new Set(mine.map((note) => note.part))) {
      const line = notes.filter((note) => note.part === part).map((note) => note.date);
      const reach = mine.filter((note) => note.part === part).map((note) => note.date);
      from = Math.min(from, line.filter((date) => date < Math.min(...reach)).at(-1) ?? from);
      to = Math.max(to, line.find((date) => date > Math.max(...reach)) ?? to);
    }
  }
  if (about.has('accent')) {
    from = Math.min(from, atOrBefore(bars, first));
    to = Math.max(to, after(bars, last));
  }
  if (about.has('pedal')) {
    from = Math.min(from, atOrBefore(beats, first - 1));
    to = Math.max(to, after(beats, last));
  }
  return {
    from: Math.max(from, first - MOST_BEATS * beat, start),
    to: Math.min(to, last + MOST_BEATS * beat, end),
  };
}

/**
 * The same stretch, kept within reach in time as well: in slow music two beats are a long while,
 * so of the context only what sounds within `REACH` of the passage is kept, and the nearest chord
 * either side whatever it takes. `msAt` is when a date sounds.
 */
export function withinReach(
  dates: readonly Ticks[],
  scope: ContextScope,
  context: { readonly from: Ticks; readonly to: Ticks },
  msAt: (date: Ticks) => Ms,
): { from: Ticks; to: Ticks } {
  const inside = dates.filter((date) => date >= scope.from && date < scope.to);
  const first = inside.at(0);
  const last = inside.at(-1);
  if (first === undefined || last === undefined) return { ...context };
  const before = dates.filter((date) => date < first && date >= context.from);
  const after = dates.filter((date) => date > last && date <= context.to);
  const from = before.find((date) => msAt(date) >= msAt(first) - REACH) ?? before.at(-1) ?? first;
  const to = after.findLast((date) => msAt(date) <= msAt(last) + REACH) ?? after.at(0) ?? last;
  return { from, to };
}
