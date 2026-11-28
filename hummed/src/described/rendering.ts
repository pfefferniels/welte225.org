// What the MPM renders, laid on the recording's clock. espressivo performs the MPM on a clock of
// its own, which starts at nothing and knows no recording; the roll is on the recording's. The
// rendering is laid on it anew at every <tempo>, as MPM Desk's chain places a tempo: on the chord
// the tempo begins on, so that what one stretch gets wrong is not carried into the next.
import { computeMillisecondsAt, performMsmToData } from 'espressivo';
import type { Ms, Ticks } from '../shared/units.ts';

/** A note as it sounds: when it is struck and let go, and how loud. */
export interface Sounded {
  readonly ms: Ms;
  readonly msEnd: Ms;
  readonly velocity: number;
}

/** A note as espressivo performs it, on the rendering's own clock (as the audio side gives it). */
export interface Performed {
  readonly on: Ms;
  readonly off: Ms;
  readonly velocity: number;
}

export type PedalKind = 'sustain' | 'soft';

/** Where a pedal is from a moment on, 0 to 127. */
export interface PedalMove {
  readonly kind: PedalKind;
  readonly date: Ticks;
  readonly ms: Ms;
  readonly value: number;
}

export interface Performance {
  readonly notes: ReadonlyMap<string, Performed>;
  readonly pedals: readonly PedalMove[];
}

/**
 * Run something without what it writes to the console. espressivo reports every part of the score
 * the MPM has no part for, and the reconstruction's MPM is global: it has none for either hand.
 */
export function quietly<T>(work: () => T): T {
  const { log, warn, error } = console;
  console.log = console.warn = console.error = (): void => undefined;
  try {
    return work();
  } finally {
    Object.assign(console, { log, warn, error });
  }
}

/**
 * The MPM as espressivo performs the score, every note on its date: the grace notes, which the
 * MPM holds as ornaments of the notes they lead to, are not played out (the roll draws them as
 * they were recorded).
 */
export function perform(msm: string, mpm: string): Performance {
  const data = quietly(() => performMsmToData({ msm, mpm }, { expandOrnaments: false }));
  const notes = new Map<string, Performed>();
  // the renderer states a pedal's move in every part, and some of them several times
  const pedals = new Map<string, PedalMove>();
  for (const part of data.parts) {
    for (const note of part.notes) {
      if (note.id === null) continue;
      notes.set(note.id, { on: note.milliseconds.date, off: note.milliseconds.end, velocity: note.velocity });
    }
    for (const stream of part.controlChanges) {
      const kind = stream.controller;
      if (kind !== 'sustain' && kind !== 'soft') continue;
      for (const { date, milliseconds: ms, value } of stream.points)
        pedals.set(`${kind} ${ms} ${value}`, { kind, date, ms, value });
    }
  }
  return { notes, pedals: [...pedals.values()].sort((a, b) => a.ms - b.ms) };
}

/** A <tempo> of the MPM. */
export interface Tempo {
  readonly date: Ticks;
  readonly bpm: number;
  readonly beatLength: number;
  readonly transitionTo?: number;
  readonly meanTempoAt?: number;
}

/** The MPM's tempo instructions, in the order of the score. */
export function temposOf(mpm: string): Tempo[] {
  return [...mpm.matchAll(/<tempo\b[^>]*>/g)]
    .flatMap(([tag]) => {
      const number = (name: string): number | undefined => {
        const value = new RegExp(`\\s${name.replace('.', '\\.')}="([^"]*)"`).exec(tag)?.[1];
        return value === undefined || value === '' || !Number.isFinite(Number(value))
          ? undefined
          : Number(value);
      };
      const date = number('date');
      const bpm = number('bpm');
      if (date === undefined || bpm === undefined) return [];
      const transitionTo = number('transition.to');
      const meanTempoAt = number('meanTempoAt');
      return [
        {
          date,
          bpm,
          beatLength: number('beatLength') ?? 0.25,
          ...(transitionTo !== undefined && { transitionTo }),
          ...(meanTempoAt !== undefined && { meanTempoAt }),
        },
      ];
    })
    .sort((a, b) => a.date - b.date);
}

/** The stretch a tempo governs, and where it lies on both clocks. */
export interface TempoSpan {
  readonly tempo: Tempo;
  /** Where the next tempo begins; the end of the score for the last. */
  readonly until: Ticks;
  /** Where the tempo map by itself has the segment begin, in the rendering's time. */
  readonly rendered: Ms;
  /** What is added to the rendering's time to lay the segment on the recording's clock. */
  readonly lead: Ms;
}

/** A note as it was recorded: what the rendering is laid against. */
export interface Recorded {
  readonly id: string;
  readonly date: Ticks;
  readonly ms: Ms;
}

const mean = (values: readonly number[]): number => values.reduce((sum, x) => sum + x, 0) / values.length;

/**
 * The tempo map cut into the stretches its instructions govern, each laid on the recording's
 * clock where it begins: by how much later the chord on the tempo's own date was recorded than it
 * is rendered (its notes one by one, so that a rolled chord is laid on its roll). A tempo that
 * begins on no chord goes on from the one before, as it does in the chain; before any chord, the
 * rendering is laid on the first note recorded.
 */
export function placeTempos(
  tempos: readonly Tempo[],
  end: Ticks,
  performed: ReadonlyMap<string, Performed>,
  recorded: readonly Recorded[],
): TempoSpan[] {
  const late = (notes: readonly Recorded[]): number[] =>
    notes.flatMap((note) => {
      const rendered = performed.get(note.id);
      return rendered ? [note.ms - rendered.on] : [];
    });
  const chords = new Map<Ticks, Recorded[]>();
  for (const note of recorded) chords.set(note.date, [...(chords.get(note.date) ?? []), note]);
  const opening = Math.min(...recorded.map((note) => note.date));
  let lead = mean(late(chords.get(opening) ?? [])) || 0;
  let rendered = 0;
  return tempos.map((tempo, i) => {
    const until = tempos.at(i + 1)?.date ?? end;
    const chord = late(chords.get(tempo.date) ?? []);
    if (chord.length > 0) lead = mean(chord);
    const segment = { tempo, until, rendered, lead };
    rendered += computeMillisecondsAt(until, { ...tempo, endDate: until }, 720);
    return segment;
  });
}

/** The segment that governs a date: the last to begin at or before it, and before any, the first. */
export const governing = (segments: readonly TempoSpan[], date: Ticks): TempoSpan | undefined =>
  segments.findLast((segment) => segment.tempo.date <= date) ?? segments.at(0);

/** The rendering on the recording's clock. */
export interface Laid {
  readonly segments: readonly TempoSpan[];
  /** Every note the rendering has, by its id. */
  readonly notes: ReadonlyMap<string, Sounded>;
  readonly pedals: readonly { readonly kind: PedalKind; readonly ms: Ms; readonly value: number }[];
  /** When the tempo map has a score position, on the recording's clock: where the bar lines stand. */
  readonly msAt: (date: Ticks) => Ms;
  /** The score position the tempo map has at a time of the recording's clock: the inverse of `msAt`. */
  readonly dateAt: (ms: Ms) => Ticks;
}

/**
 * Lay a performance on the recording's clock: every note and every move of a pedal by the lead of
 * the tempo that governs its date. `dates` are the score positions the clock is asked for most
 * (the chords and the beats); between two of them it goes straight.
 */
export function lay(
  performance: Performance,
  tempos: readonly Tempo[],
  recorded: readonly Recorded[],
  dates: readonly Ticks[],
  end: Ticks,
): Laid {
  const segments = placeTempos(tempos, end, performance.notes, recorded);
  const leadAt = (date: Ticks): Ms => governing(segments, date)?.lead ?? 0;
  const dateOf = new Map(recorded.map((note) => [note.id, note.date]));
  const notes = new Map<string, Sounded>();
  for (const [id, { on, off, velocity }] of performance.notes) {
    const date = dateOf.get(id);
    if (date === undefined) continue;
    const lead = leadAt(date);
    notes.set(id, { ms: on + lead, msEnd: off + lead, velocity });
  }
  const pedals = performance.pedals
    .map(({ kind, date, ms, value }) => ({ kind, ms: ms + leadAt(date), value }))
    .sort((a, b) => a.ms - b.ms);

  const exact = (date: Ticks): Ms => {
    const segment = governing(segments, date);
    if (!segment) return date;
    const { tempo, until, rendered, lead } = segment;
    return lead + rendered + computeMillisecondsAt(date, { ...tempo, endDate: until }, 720);
  };
  // A table of the clock, for the way back: where a tempo is laid anew the clock leaps, and the
  // way back keeps to what goes on (a time in a leap is at the tempo's own date).
  const grid = [...new Set([0, ...dates, ...tempos.map((tempo) => tempo.date), end])].sort((a, b) => a - b);
  const table: { date: Ticks; ms: Ms }[] = [];
  for (const date of grid) {
    const ms = exact(date);
    const last = table.at(-1);
    if (!last || ms > last.ms) table.push({ date, ms });
  }
  const dateAt = (ms: Ms): Ticks => {
    const first = table.at(0);
    const last = table.at(-1);
    if (!first || !last) return ms;
    if (table.length === 1) return first.date;
    let lo = 0;
    let hi = table.length - 1;
    if (ms <= first.ms) hi = 1;
    else if (ms >= last.ms) lo = hi - 1;
    else
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (table[mid].ms <= ms) lo = mid;
        else hi = mid;
      }
    const a = table[lo];
    const b = table[hi];
    return a.date + ((ms - a.ms) / (b.ms - a.ms)) * (b.date - a.date);
  };
  return { segments, notes, pedals, msAt: exact, dateAt };
}
