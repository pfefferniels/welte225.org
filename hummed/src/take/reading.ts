// A take read against the roll. The body's movements say where one instruction ends and the next
// begins and what happens between the notes; the taps say where the beat falls where no note
// sounds, and on which note of a spread chord; the roll says everything else. What comes out are
// calls in MPM Desk's own form (its work.json), which its chain turns into MPM: the hum decides
// their ranges and the values between the notes, the fitting to the roll stays the desk's.
import { computeMillisecondsAt } from 'espressivo';
import type { Seconds, Ticks } from '../shared/units.ts';
import { frameOf } from './body.ts';
import type { Movements } from './movements.ts';
import { dateAt, TICKS_PER_QUARTER, timeAt, type Chord, type Roll, type Section } from './roll.ts';

/** What was recorded, beside the sound. */
export interface TakeTiming {
  readonly section: Section;
  /** The roll's time (seconds from its first note) at the take's first sample. */
  readonly start: Seconds;
  /** When the keys were tapped, in seconds of the take. */
  readonly taps: readonly Seconds[];
  /** The pulse tapped, in ticks (720: quarters). */
  readonly pulse: Ticks;
}

/** A beat of the tapped pulse. */
export interface Beat {
  readonly date: Ticks;
  /** When the roll is there: its chord's first note, or between its neighbours. */
  readonly expected: Seconds;
  /** The chord written there, if any. */
  readonly chord: Chord | null;
  /** The tap that fell nearest, in the roll's time, with the tapper's own lead taken off. */
  readonly tap: Seconds | null;
}

export type Placement = 'on-beat' | 'before-beat' | 'estimate';

/** A spread chord and where the tap fell in it. */
export interface Spread {
  readonly date: Ticks;
  readonly first: Seconds;
  readonly last: Seconds;
  /** Where between the first note (0) and the last (1) the beat was tapped; null: not tapped. */
  readonly position: number | null;
  readonly placement: Placement;
}

/** Where one movement ends and the next begins. */
export interface Boundary {
  readonly date: Ticks;
  /** When the voice turned, in the roll's time. */
  readonly at: Seconds;
  readonly kind: 'start' | 'breath' | 'peak' | 'trough' | 'end';
}

/** One movement of the voice over a stretch of the score. */
export interface Gesture {
  readonly from: Ticks;
  readonly to: Ticks;
  readonly kind: 'grow' | 'shrink' | 'hold';
}

/** A transformer call as MPM Desk's work file holds it. */
export interface Call {
  readonly id: string;
  readonly name: 'InsertTempo' | 'InsertDynamicsInstructions' | 'InsertTemporalSpread';
  readonly options: Readonly<Record<string, unknown>>;
  readonly range: { readonly from: Ticks; readonly to: Ticks | null };
}

export interface Reading {
  /** How far the voice's notes lie behind the roll's, median, in seconds (negative: ahead). */
  readonly lag: Seconds;
  readonly beats: readonly Beat[];
  /**
   * The tapper against the chords that are struck at once: how early (negative) or late, and how
   * widely. Where the take has too few such chords on its beats, the lead is the one an earlier
   * take gave (`ReadingOptions.tapLead`), or nothing.
   */
  readonly tapLead: Seconds;
  readonly tapLeadFrom: 'take' | 'earlier' | 'none';
  readonly tapScatter: Seconds;
  /** The taps on beats where no note sounds, as the desk's tempo data holds them. */
  readonly silentOnsets: readonly { readonly date: Ticks; readonly onset: Seconds }[];
  readonly spreads: readonly Spread[];
  readonly boundaries: readonly Boundary[];
  readonly gestures: readonly Gesture[];
  /**
   * The voice's effort against the roll's dynamics at the chords: how many of the roll's velocity
   * steps a decibel of effort counts for (the two spreads against each other), and how far the two
   * go together (their correlation; the voice follows one line, the roll's chords have several).
   */
  readonly velocity: { readonly scale: number; readonly r: number };
  readonly calls: readonly Call[];
}

export interface ReadingOptions {
  /** A chord whose notes sound further apart than this is spread. */
  readonly spread?: Seconds;
  /** What the voice does between two chords counts from this many velocity steps off a straight line. */
  readonly minBulge?: number;
  /** The tapper's lead as an earlier take found it, for a take that cannot tell. */
  readonly tapLead?: Seconds;
  /** Names a call; by default a random UUID. */
  readonly id?: () => string;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[sorted.length >> 1] : 0;
};

/** The beats of the pulse over the section, counted from the first full bar. */
function beatsOf(roll: Roll, timing: TakeTiming): { date: Ticks; expected: Seconds; chord: Chord | null }[] {
  const origin = roll.bars.find((b) => b.number === 1)?.date ?? 0;
  const { from, to } = timing.section;
  const out: { date: Ticks; expected: Seconds; chord: Chord | null }[] = [];
  const first = origin + Math.ceil((from - origin) / timing.pulse) * timing.pulse;
  for (let date = first; date < to; date += timing.pulse) {
    const chord = roll.chords.find((c) => c.date === date) ?? null;
    out.push({ date, expected: chord ? (chord.first + chord.last) / 2 : timeAt(roll, date), chord });
  }
  return out;
}

/** A tempo instruction fitted to (date, seconds) points from `from` to `to`. */
export function fitTempo(
  points: readonly { readonly date: Ticks; readonly time: Seconds }[],
  from: Ticks,
  to: Ticks,
  beatLength: number,
): { bpm: number; transitionTo?: number; meanTempoAt?: number } | null {
  const inside = points.filter((p) => p.date >= from && p.date <= to).sort((a, b) => a.date - b.date);
  if (inside.length < 2) return null;
  const first = inside[0];
  const last = inside[inside.length - 1];
  if (last.time <= first.time) return null;
  const beat = beatLength * 4 * TICKS_PER_QUARTER;
  const pace = (a: (typeof inside)[number], b: (typeof inside)[number]): number =>
    ((b.date - a.date) / beat / (b.time - a.time)) * 60;
  const mean = pace(first, last);
  if (inside.length < 3) return { bpm: mean };

  // the squared distance of the points from the instruction's own clock, as the renderer runs it
  const error = (bpm: number, transitionTo: number, meanTempoAt: number): number => {
    let sum = 0;
    for (const p of inside) {
      const ms = computeMillisecondsAt(
        p.date,
        { date: first.date, endDate: last.date, bpm, beatLength, transitionTo, meanTempoAt },
        TICKS_PER_QUARTER,
      );
      const d = ms / 1000 - (p.time - first.time);
      sum += d * d;
    }
    return sum;
  };
  // from the paces at the two ends, each parameter in turn by ever smaller steps
  let best = [pace(first, inside[1]), pace(inside[inside.length - 2], last), 0.5];
  const shapes = inside.length > 3;
  let bestError = error(best[0], best[1], best[2]);
  const steps = [0.2 * mean, 0.2 * mean, 0.15];
  for (let round = 0; round < 40; round++) {
    for (let k = 0; k < (shapes ? 3 : 2); k++)
      for (const sign of [-1, 1]) {
        const trial = [...best];
        trial[k] += sign * steps[k];
        if (trial[0] < 5 || trial[1] < 5 || trial[2] < 0.05 || trial[2] > 0.95) continue;
        const e = error(trial[0], trial[1], trial[2]);
        if (e < bestError) {
          best = trial;
          bestError = e;
        }
      }
    for (let k = 0; k < 3; k++) steps[k] *= 0.75;
  }
  // a transition that changes the tempo by less than a hundredth is none
  if (Math.abs(best[1] - best[0]) < 0.01 * mean) return { bpm: mean };
  return { bpm: best[0], transitionTo: best[1], meanTempoAt: best[2] };
}

/**
 * The take read against the roll: `movements` in the take's own time, `effort` the voice's effort
 * per frame (movements.ts).
 */
export function read(
  roll: Roll,
  timing: TakeTiming,
  movements: Movements,
  options: ReadingOptions = {},
): Reading {
  const { spread: spreadAt = 0.03, minBulge = 1, id = () => crypto.randomUUID() } = options;
  const { section, start } = timing;
  const inSection = (date: Ticks): boolean => date >= section.from && date < section.to;
  const chords = roll.chords.filter((c) => inSection(c.date));

  // the voice against the roll: each sung note's beginning against the nearest note of the roll
  const onsets = roll.notes.map((n) => n.onset);
  const offsets = movements.notes
    .map((note) => {
      const t = note.from + start;
      const nearest = onsets.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), Infinity);
      return t - nearest;
    })
    .filter((d) => Math.abs(d) < 0.2);
  const lag = offsets.length >= 3 ? median(offsets) : 0;
  /** A moment of the take in the roll's time, the voice's lag taken off. */
  const voiceTime = (t: Seconds): Seconds => t + start - lag;

  // the taps, each to the beat it falls nearest
  const grid = beatsOf(roll, timing);
  const taps = timing.taps.map((t) => t + start);
  const nearestTap = grid.map((beat, i) => {
    const reach = Math.min(
      i > 0 ? beat.expected - grid[i - 1].expected : Infinity,
      i + 1 < grid.length ? grid[i + 1].expected - beat.expected : Infinity,
    );
    const tap = taps.reduce(
      (a, b) => (Math.abs(b - beat.expected) < Math.abs(a - beat.expected) ? b : a),
      Infinity,
    );
    return Math.abs(tap - beat.expected) < reach / 2 ? tap : null;
  });
  // how the tapper taps where there is no doubt about the beat: chords struck at once
  const sure = grid.flatMap((beat, i) => {
    const tap = nearestTap[i];
    return beat.chord && beat.chord.last - beat.chord.first < spreadAt && tap !== null
      ? [tap - beat.chord.first]
      : [];
  });
  const tapLeadFrom = sure.length >= 3 ? 'take' : options.tapLead !== undefined ? 'earlier' : 'none';
  const tapLead = sure.length >= 3 ? median(sure) : (options.tapLead ?? 0);
  const tapScatter = sure.length >= 3 ? 1.4826 * median(sure.map((d) => Math.abs(d - tapLead))) : NaN;
  const beats = grid.map((beat, i): Beat => {
    const tap = nearestTap[i];
    return { ...beat, tap: tap === null ? null : tap - tapLead };
  });
  const silentOnsets = beats.flatMap((b) =>
    b.chord === null && b.tap !== null ? [{ date: b.date, onset: b.tap }] : [],
  );

  const spreads = chords
    .filter((c) => c.last - c.first >= spreadAt)
    .map((c): Spread => {
      const tap = beats.find((b) => b.date === c.date)?.tap ?? null;
      const position = tap === null ? null : (tap - c.first) / (c.last - c.first);
      const placement: Placement =
        position === null
          ? 'estimate'
          : position < 0.35
            ? 'on-beat'
            : position > 0.65
              ? 'before-beat'
              : 'estimate';
      return { date: c.date, first: c.first, last: c.last, position, placement };
    });

  // where the movements turn, each at the nearest place something can begin: a chord, or a
  // subdivision of the tapped pulse
  const half = timing.pulse / 2;
  const sites = [
    ...new Set([
      ...chords.map((c) => c.date),
      ...Array.from(
        { length: Math.ceil((section.to - section.from) / half) + 1 },
        (_, k) => section.from + k * half,
      ),
    ]),
  ]
    .filter((d) => d >= section.from && d <= section.to)
    .sort((a, b) => a - b);
  const siteTimes = sites.map((d) => timeAt(roll, d));
  const snap = (time: Seconds): Ticks => {
    let best = 0;
    for (let i = 1; i < sites.length; i++)
      if (Math.abs(siteTimes[i] - time) < Math.abs(siteTimes[best] - time)) best = i;
    return sites[best];
  };
  const marks: Boundary[] = [];
  movements.phrases.forEach((phrase, i) => {
    if (i > 0) marks.push({ date: snap(voiceTime(phrase.from)), at: voiceTime(phrase.from), kind: 'breath' });
  });
  for (const turn of movements.turns)
    marks.push({ date: snap(voiceTime(turn.at)), at: voiceTime(turn.at), kind: turn.kind });
  // a movement lasts a beat of the tapped pulse at least: of turns closer than that the one that
  // says more stays, a breath before a trough before a peak
  const weight = { breath: 3, trough: 2, peak: 1, start: 4, end: 4 } as const;
  const inner: Boundary[] = [];
  for (const mark of marks
    .filter((m) => m.date >= section.from + timing.pulse && m.date <= section.to - timing.pulse)
    .sort((a, b) => a.date - b.date || a.at - b.at)) {
    const before = inner.at(-1);
    if (!before || mark.date - before.date >= timing.pulse) inner.push(mark);
    else if (weight[mark.kind] > weight[before.kind]) inner[inner.length - 1] = mark;
  }
  const boundaries: Boundary[] = [
    { date: section.from, at: timeAt(roll, section.from), kind: 'start' },
    ...inner,
    { date: section.to, at: timeAt(roll, section.to), kind: 'end' },
  ];

  // the effort at a moment of the roll, and which way it goes over a stretch
  const effortAt = (time: Seconds): number => {
    const frame = frameOf(time - start + lag);
    return frame >= 0 && frame < movements.effort.length ? movements.effort[frame] : NaN;
  };
  const gestures = boundaries.slice(0, -1).map((b, i): Gesture => {
    const next = boundaries[i + 1];
    const middle = (timeAt(roll, b.date) + timeAt(roll, next.date)) / 2 - start + lag;
    const swell = movements.swells.find((s) => s.from <= middle && middle < s.to);
    return { from: b.date, to: next.date, kind: swell?.kind ?? 'hold' };
  });

  // the voice's effort against the roll's dynamics, where both are there: at the chords
  const pairs = chords
    .map((c) => [effortAt(c.first), c.velocity] as const)
    .filter(([e, v]) => Number.isFinite(e) && Number.isFinite(v));
  let scale = 0;
  let r = 0;
  if (pairs.length >= 3) {
    const meanE = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
    const meanV = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
    const see = pairs.reduce((s, p) => s + (p[0] - meanE) ** 2, 0);
    const svv = pairs.reduce((s, p) => s + (p[1] - meanV) ** 2, 0);
    const sev = pairs.reduce((s, p) => s + (p[0] - meanE) * (p[1] - meanV), 0);
    if (see > 0 && svv > 0) {
      scale = Math.sqrt(svv / see);
      r = sev / Math.sqrt(see * svv);
    }
  }
  /**
   * What the voice says of a place where no note sounds: the roll's own dynamics there, a straight
   * line between the chords on either side, and on top of it what the voice does between those two
   * chords beyond a straight line of its own, a decibel of effort counted as the roll's velocities
   * spread against the voice's. Null where the voice says nothing: it is silent there, or does
   * nothing a straight line would not.
   */
  const between = (date: Ticks): number | null => {
    const before = chords.findLast((c) => c.date < date);
    const after = chords.find((c) => c.date > date);
    if (!before || !after) return null;
    const part = (date - before.date) / (after.date - before.date);
    const [e0, e1, e] = [effortAt(before.first), effortAt(after.first), effortAt(timeAt(roll, date))];
    if (!Number.isFinite(e0) || !Number.isFinite(e1) || !Number.isFinite(e)) return null;
    const bulge = scale * (e - (e0 + part * (e1 - e0)));
    if (Math.abs(bulge) < minBulge) return null;
    return Math.round(before.velocity + part * (after.velocity - before.velocity) + bulge);
  };

  // the calls: each gesture a tempo and a dynamics instruction over the same stretch
  const beatLength = timing.pulse / (4 * TICKS_PER_QUARTER);
  const beatTime = (c: Chord): Seconds => {
    const s = spreads.find((x) => x.date === c.date);
    if (!s) return c.first;
    if (s.placement === 'on-beat') return c.first;
    if (s.placement === 'before-beat') return c.last;
    const tap = beats.find((b) => b.date === c.date)?.tap ?? null;
    return tap !== null && tap >= c.first && tap <= c.last ? tap : (c.first + c.last) / 2;
  };
  const clock = [
    ...roll.chords.map((c) => ({ date: c.date, time: beatTime(c) })),
    ...silentOnsets.map((s) => ({ date: s.date, time: s.onset })),
  ];
  const calls: Call[] = [];
  for (const g of gestures) {
    const tempo = fitTempo(clock, g.from, g.to, beatLength);
    if (tempo)
      calls.push({
        id: id(),
        name: 'InsertTempo',
        options: { from: g.from, to: g.to, ...tempo, beatLength, scope: 'global' },
        range: { from: g.from, to: g.to },
      });
  }
  for (const g of gestures) {
    const phantoms: [Ticks, number][] = [];
    for (const date of sites) {
      if (date < g.from || date > g.to || chords.some((c) => c.date === date)) continue;
      const velocity = between(date);
      if (velocity !== null) phantoms.push([date, velocity]);
    }
    calls.push({
      id: id(),
      name: 'InsertDynamicsInstructions',
      options: {
        from: g.from,
        to: g.to,
        phantomVelocities: { dataType: 'Map', value: phantoms },
        scope: 'global',
      },
      range: { from: g.from, to: g.to },
    });
  }
  for (const s of spreads)
    calls.push({
      id: id(),
      name: 'InsertTemporalSpread',
      options: { scope: 'global', placement: s.placement, noteOffShiftTolerance: 2, date: s.date },
      range: { from: s.date, to: null },
    });

  return {
    lag,
    beats,
    tapLead,
    tapLeadFrom,
    tapScatter,
    silentOnsets: silentOnsets.map((s) => ({ date: s.date, onset: s.onset })),
    spreads,
    boundaries,
    gestures,
    velocity: { scale, r },
    calls,
  };
}

/** The roll's position at a moment of the take, for drawing the take over the score. */
export const scoreDateAt = (roll: Roll, timing: TakeTiming, t: Seconds): Ticks =>
  dateAt(roll, t + timing.start);
