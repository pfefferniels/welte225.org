// A take read against the roll. The body's movements say where one instruction ends and the next
// begins and what happens between the notes; the taps say where the beat falls where no note
// sounds, and on which note of a spread chord; the roll says everything else. What comes out are
// calls in MPM Desk's own form (its work.json), which its chain turns into MPM: the hum decides
// their ranges and the values between the notes, the fitting to the roll stays the desk's.
import {
  computeMillisecondsAt,
  fitTransitionCurve,
  getTempoAt,
  innerControlPointsXPositions,
  transitionValueAt,
} from 'espressivo';
import type { Seconds, Ticks } from '../shared/units.ts';
import { FRAME_RATE, frameOf } from './body.ts';
import type { Movements } from './movements.ts';
import { dateAt, SPREAD, TICKS_PER_QUARTER, timeAt, type Chord, type Roll, type Section } from './roll.ts';

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
  /** When the beat falls, as the placement has it: what the tempo is fitted to. */
  readonly beat: Seconds;
}

/** The dynamics at a place where no note sounds. */
export interface Between {
  readonly date: Ticks;
  /** On the roll's scale of velocities. */
  readonly velocity: number;
  /** What a straight line between the chords on either side would give there. */
  readonly line: number;
  /** Whether the voice sounded there and at both chords, and so had a say. */
  readonly voiced: boolean;
}

/** A fitted curve over one movement, sampled: the roll's time and the value (bpm, or velocity). */
export interface Fitted {
  readonly from: Ticks;
  readonly to: Ticks;
  readonly points: readonly { readonly time: Seconds; readonly value: number }[];
}

/** A tempo instruction as the MPM holds it, with where the next takes over. */
export interface TempoInstruction {
  readonly date: Ticks;
  readonly endDate: Ticks;
  readonly bpm: number;
  readonly transitionTo?: number;
  readonly meanTempoAt?: number;
  readonly beatLength: number;
}

/**
 * A rubato over one beat: what the notes within the beat do against the tempo curve. A note
 * written a part x of the way through the beat sounds where the curve has x to the power of
 * `intensity`: under 1 later than written, over 1 sooner.
 */
export interface Rubato {
  readonly date: Ticks;
  readonly length: Ticks;
  readonly intensity: number;
}

/**
 * The accents of one movement: what its chords do against the dynamics curve. Each chord's
 * velocity off the curve as a part of the largest (`scale`, in velocity steps), from -1 to 1.
 */
export interface Accents {
  readonly from: Ticks;
  readonly to: Ticks;
  readonly scale: number;
  readonly values: readonly { readonly date: Ticks; readonly value: number }[];
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
  readonly name:
    | 'InsertTempo'
    | 'InsertDynamicsInstructions'
    | 'InsertTemporalSpread'
    | 'InsertRubato'
    | 'InsertMetricalAccentuation';
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
   * steps a decibel of effort counts for (the two spreads against each other, between 0.3 and 3),
   * and how far the two go together (their correlation; the voice follows one line, the roll's
   * chords have several).
   */
  readonly velocity: { readonly scale: number; readonly r: number };
  /** The dynamics the voice gives where no note sounds; each is a phantom velocity of the calls it lies in. */
  readonly betweens: readonly Between[];
  /**
   * The roll's clock within the bars: when each chord's beat falls (a spread chord's where it was
   * placed) and each beat tapped where no note sounds. What the tempo is fitted to.
   */
  readonly clock: readonly { readonly date: Ticks; readonly time: Seconds }[];
  /**
   * The curves the calls come to: each movement's tempo as its instruction runs, and its dynamics
   * as the desk fits them through the chords and the values between them.
   */
  readonly fitted: { readonly tempo: readonly Fitted[]; readonly dynamics: readonly Fitted[] };
  /** The instructions themselves, as the take's MPM holds them (mpm.ts). */
  readonly instructions: {
    readonly tempo: readonly TempoInstruction[];
    readonly dynamics: readonly FittedDynamics[];
  };
  /** What the curves leave: the notes within a beat against the tempo, the chords against the dynamics. */
  readonly rubatos: readonly Rubato[];
  readonly accents: readonly Accents[];
  readonly calls: readonly Call[];
}

export interface ReadingOptions {
  /** A chord whose notes sound further apart than this is spread. */
  readonly spread?: Seconds;
  /**
   * How much the voice counts between the notes: 1, a decibel of its effort as many of the roll's
   * velocity steps as the two spread against each other at the chords; 2, twice that; 0, not at all.
   */
  readonly between?: number;
  /** The tapper's lead as an earlier take found it, for a take that cannot tell. */
  readonly tapLead?: Seconds;
  /** A rubato is written from this far off 1 in intensity; an accent pattern from this many velocity steps. */
  readonly minRubato?: number;
  readonly minAccent?: number;
  /** Names a call; by default a random UUID. */
  readonly id?: () => string;
}

/** How far from a chord the voice may set in, or die away, and still be taken as the voice at that chord. */
const REACH: Seconds = 0.3;
/** The fewest and the most of the roll's velocity steps a decibel of effort is counted as. */
const SCALE = { least: 0.3, most: 3 } as const;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

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

/**
 * A tempo instruction fitted to (date, seconds) points from `from` to `to`. The stretch from the
 * first point to the last takes as long as it does on the roll, exactly: only how the tempo goes
 * within it is fitted (where it begins against where it ends, and where between the two it is half
 * way), so that one movement's misfit is not carried into the next.
 */
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
  const length = last.time - first.time;
  if (length <= 0) return null;
  const beat = beatLength * 4 * TICKS_PER_QUARTER;
  const mean = ((last.date - first.date) / beat / length) * 60;
  if (inside.length < 3) return { bpm: mean };

  // the instruction's own clock, as the renderer runs it: it stands at `from` and gives way at `to`
  const clockAt = (date: Ticks, bpm: number, transitionTo: number, meanTempoAt: number): number =>
    computeMillisecondsAt(
      date,
      { date: from, endDate: to, bpm, beatLength, transitionTo, meanTempoAt },
      TICKS_PER_QUARTER,
    ) / 1000;
  /** The tempo of a shape (end against beginning, and where half way) that takes the roll's time. */
  const scaled = (ratio: number, meanTempoAt: number): { bpm: number; transitionTo: number } => {
    const took =
      clockAt(last.date, mean, mean * ratio, meanTempoAt) -
      clockAt(first.date, mean, mean * ratio, meanTempoAt);
    const bpm = (mean * took) / length;
    return { bpm, transitionTo: bpm * ratio };
  };
  const error = (ratio: number, meanTempoAt: number): number => {
    const { bpm, transitionTo } = scaled(ratio, meanTempoAt);
    const origin = clockAt(first.date, bpm, transitionTo, meanTempoAt);
    let sum = 0;
    for (const p of inside) {
      const d = clockAt(p.date, bpm, transitionTo, meanTempoAt) - origin - (p.time - first.time);
      sum += d * d;
    }
    return sum;
  };
  // every shape on a grid, then the best of them refined; three points do not tell where half way is
  const shapes = inside.length > 3 ? [0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85] : [0.5];
  let best = { ratio: 1, meanTempoAt: 0.5, error: error(1, 0.5) };
  for (const meanTempoAt of shapes)
    for (let k = -12; k <= 12; k++) {
      const ratio = 2 ** (k / 8);
      const e = error(ratio, meanTempoAt);
      if (e < best.error) best = { ratio, meanTempoAt, error: e };
    }
  let [stepRatio, stepMean] = [2 ** (1 / 16), 0.05];
  for (let round = 0; round < 24; round++) {
    for (const [ratio, meanTempoAt] of [
      [best.ratio * stepRatio, best.meanTempoAt],
      [best.ratio / stepRatio, best.meanTempoAt],
      [best.ratio, best.meanTempoAt + stepMean],
      [best.ratio, best.meanTempoAt - stepMean],
    ]) {
      if (meanTempoAt < 0.05 || meanTempoAt > 0.95 || (inside.length <= 3 && meanTempoAt !== 0.5)) continue;
      const e = error(ratio, meanTempoAt);
      if (e < best.error) best = { ratio, meanTempoAt, error: e };
    }
    stepRatio = Math.sqrt(stepRatio);
    stepMean /= 2;
  }
  // a transition that changes the tempo by less than a hundredth is none
  if (Math.abs(best.ratio - 1) < 0.01) return { bpm: mean };
  return { ...scaled(best.ratio, best.meanTempoAt), meanTempoAt: best.meanTempoAt };
}

/** A dynamics instruction as MPM Desk fits one (its `approximateDynamics`). */
export interface FittedDynamics {
  readonly date: Ticks;
  readonly endDate: Ticks;
  readonly volume: number;
  readonly transitionTo?: number;
  readonly curvature?: number;
  readonly protraction?: number;
}

/** The desk's generator of the fit's draws, seeded from the points: mulberry32 over an FNV-1a hash. */
function seeded(text: string): () => number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The dynamics instruction through a movement's points (its chords and the values between them),
 * as MPM Desk's `InsertDynamicsInstructions` fits it: the first and the last point are its ends;
 * one point is a constant, two a straight ramp; more bend it, by espressivo's search, as far as
 * five velocity steps in all are left unexplained, with the desk's own seed.
 */
export function fitDynamics(
  points: readonly { readonly date: Ticks; readonly velocity: number }[],
): FittedDynamics | null {
  const first = points.at(0);
  const last = points.at(-1);
  if (!first || !last) return null;
  if (points.length === 1) return { date: first.date, endDate: first.date, volume: first.velocity };
  const equal = first.velocity === last.velocity;
  const straight = { curvature: 0.5, protraction: 0 };
  const ends = { date: first.date, endDate: last.date, volume: first.velocity };
  if (points.length === 2 || equal)
    return { ...ends, ...(equal ? {} : { transitionTo: last.velocity }), ...straight };
  const { curvature, protraction } = fitTransitionCurve(
    { startDate: first.date, endDate: last.date, from: first.velocity, to: last.velocity },
    points.map((p) => ({ date: p.date, value: p.velocity })),
    {
      initial: straight,
      random: seeded(JSON.stringify(points.map((p) => ({ date: p.date, velocity: p.velocity })))),
      maxIterations: 5000,
      tolerance: 5,
    },
  );
  return { ...ends, transitionTo: last.velocity, curvature, protraction };
}

/** How many points a fitted curve is sampled at. */
const SAMPLES = 24;

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
  const {
    spread: spreadAt = SPREAD,
    between: voiceCounts = 1,
    minRubato = 0.03,
    minAccent = 0.5,
    id = () => crypto.randomUUID(),
  } = options;
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
      const beat =
        placement === 'on-beat'
          ? c.first
          : placement === 'before-beat'
            ? c.last
            : tap !== null && tap >= c.first && tap <= c.last
              ? tap
              : (c.first + c.last) / 2;
      return { date: c.date, first: c.first, last: c.last, position, placement, beat };
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

  // which way the effort goes over each stretch
  const gestures = boundaries.slice(0, -1).map((b, i): Gesture => {
    const next = boundaries[i + 1];
    const middle = (timeAt(roll, b.date) + timeAt(roll, next.date)) / 2 - start + lag;
    const swell = movements.swells.find((s) => s.from <= middle && middle < s.to);
    return { from: b.date, to: next.date, kind: swell?.kind ?? 'hold' };
  });

  // the voice's effort against the roll's dynamics, where both are there: at the chords
  const fineAt = (time: Seconds): number => {
    const frame = frameOf(time - start + lag);
    return frame >= 0 && frame < movements.fine.length ? movements.fine[frame] : NaN;
  };
  /** The effort at `time`, or the nearest there is on the way towards `towards`, within `REACH`. */
  const nearAt = (time: Seconds, towards: Seconds): number => {
    const step = Math.sign(towards - time) / FRAME_RATE;
    const limit = Math.min(REACH, Math.abs(towards - time));
    for (let t = time; Math.abs(t - time) <= limit; t += step) {
      const e = fineAt(t);
      if (Number.isFinite(e) || step === 0) return e;
    }
    return NaN;
  };
  const pairs = chords
    .map((c) => [fineAt(c.first), c.velocity] as const)
    .filter(([e, v]) => Number.isFinite(e) && Number.isFinite(v));
  let scale = 1;
  let r = 0;
  if (pairs.length >= 3) {
    const meanE = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
    const meanV = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
    const see = pairs.reduce((s, p) => s + (p[0] - meanE) ** 2, 0);
    const svv = pairs.reduce((s, p) => s + (p[1] - meanV) ** 2, 0);
    const sev = pairs.reduce((s, p) => s + (p[0] - meanE) * (p[1] - meanV), 0);
    if (see > 0 && svv > 0) {
      scale = clamp(Math.sqrt(svv / see), SCALE.least, SCALE.most);
      r = sev / Math.sqrt(see * svv);
    }
  }
  /**
   * The dynamics at a place where no note sounds. The roll says nothing there, so it is the voice's
   * to say: the roll's own dynamics, a straight line between the chords on either side, and on top
   * of it what the voice does between those two chords beyond a straight line of its own (a swell
   * through a held note, a sinking away), a decibel of effort counted as `scale` of the roll's
   * velocity steps. Where the voice is silent there or at either chord, the straight line alone.
   */
  const between = (date: Ticks): Between | null => {
    const before = roll.chords.findLast((c) => c.date < date);
    const after = roll.chords.find((c) => c.date > date);
    if (!before || !after) return null;
    const part = (date - before.date) / (after.date - before.date);
    const line = before.velocity + part * (after.velocity - before.velocity);
    const at = timeAt(roll, date);
    // the voice at each chord, or where it sets in just after the one and dies away just before
    // the other: a voice begins with a note, not ahead of it
    const [e0, e1, e] = [nearAt(before.first, at), nearAt(after.first, at), fineAt(at)];
    const voiced = Number.isFinite(e0) && Number.isFinite(e1) && Number.isFinite(e);
    const beyond = voiced ? voiceCounts * scale * (e - (e0 + part * (e1 - e0))) : 0;
    return { date, velocity: Math.max(1, Math.round(line + beyond)), line, voiced };
  };
  // everywhere between the chords that something can begin, and wherever a movement begins or ends
  const betweens = [...new Set([...sites, ...boundaries.map((b) => b.date)])]
    .filter((date) => !roll.chords.some((c) => c.date === date))
    .sort((a, b) => a - b)
    .flatMap((date) => {
      const value = between(date);
      // a movement needs a value where it begins and ends; elsewhere only the voice gives one
      return value && (value.voiced || boundaries.some((b) => b.date === date)) ? [value] : [];
    });

  // the calls: each gesture a tempo and a dynamics instruction over the same stretch
  const beatLength = timing.pulse / (4 * TICKS_PER_QUARTER);
  const beatTime = (c: Chord): Seconds => spreads.find((x) => x.date === c.date)?.beat ?? c.first;
  const origin = roll.bars.find((b) => b.number === 1)?.date ?? 0;
  const onPulse = (date: Ticks): boolean => (date - origin) % timing.pulse === 0;
  const clock = [
    ...roll.chords.map((c) => ({ date: c.date, time: beatTime(c) })),
    ...silentOnsets.map((s) => ({ date: s.date, time: s.onset })),
  ].sort((a, b) => a.date - b.date);
  /** When the clock is at a score position: between its points, a straight line. */
  const clockTime = (date: Ticks): Seconds => {
    let i = 0;
    while (i + 2 < clock.length && clock[i + 1].date <= date) i++;
    const [a, b] = [clock[i], clock[i + 1]];
    return a.time + ((date - a.date) / (b.date - a.date)) * (b.time - a.time);
  };
  const sampled = (from: Ticks, to: Ticks, value: (date: Ticks) => number): Fitted => ({
    from,
    to,
    points: Array.from({ length: SAMPLES + 1 }, (_, k) => {
      const date = from + (k / SAMPLES) * (to - from);
      return { time: clockTime(date), value: value(date) };
    }),
  });
  const fittedTempo: Fitted[] = [];
  const fittedDynamics: Fitted[] = [];
  const calls: Call[] = [];
  const tempos: TempoInstruction[] = [];
  const dynamics: FittedDynamics[] = [];
  const accents: Accents[] = [];
  for (const g of gestures) {
    // the tempo is the beats': the chords on the tapped pulse, the beats tapped where no note
    // sounds, and the movement's own ends; what the notes within a beat do is the rubato's
    const beatwise = clock.filter((p) => onPulse(p.date) || p.date === g.from || p.date === g.to);
    const tempo = fitTempo(beatwise, g.from, g.to, beatLength);
    if (tempo) {
      const instruction: TempoInstruction = { date: g.from, endDate: g.to, beatLength, ...tempo };
      tempos.push(instruction);
      fittedTempo.push(sampled(g.from, g.to, (date) => getTempoAt(date, instruction)));
      calls.push({
        id: id(),
        name: 'InsertTempo',
        options: { from: g.from, to: g.to, ...tempo, beatLength, scope: 'global' },
        range: { from: g.from, to: g.to },
      });
    }
  }
  for (const g of gestures) {
    const phantoms = betweens
      .filter((v) => v.date >= g.from && v.date <= g.to)
      .map((v): [Ticks, number] => [v.date, v.velocity]);
    // the curve the desk fits through the movement's chords and the values between them
    const fit = fitDynamics(
      [
        ...roll.chords
          .filter((c) => c.date >= g.from && c.date <= g.to)
          .map((c) => ({ date: c.date, velocity: c.velocity })),
        ...phantoms.map(([date, velocity]) => ({ date, velocity })),
      ].sort((a, b) => a.date - b.date),
    );
    if (fit) dynamics.push(fit);
    if (fit && fit.endDate > fit.date) {
      const [x1, x2] = innerControlPointsXPositions(fit.curvature ?? 0.5, fit.protraction ?? 0);
      const target = fit.transitionTo ?? fit.volume;
      const curve = (date: Ticks): number =>
        transitionValueAt(x1, x2, fit.date, fit.endDate, fit.volume, target, date);
      fittedDynamics.push(sampled(fit.date, fit.endDate, curve));
      // what the chords do against the curve: the movement's accents
      const off = chords
        .filter((c) => c.date >= g.from && c.date < g.to && c.date >= fit.date && c.date <= fit.endDate)
        .map((c) => ({ date: c.date, value: c.velocity - curve(c.date) }));
      const largest = Math.max(0, ...off.map((v) => Math.abs(v.value)));
      if (largest >= minAccent)
        accents.push({
          from: g.from,
          to: g.to,
          scale: largest,
          values: off.map((v) => ({ date: v.date, value: v.value / largest })),
        });
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
  // what the notes within each beat do against the tempo curve: a rubato over the beat
  const rubatos: Rubato[] = [];
  for (const beat of beats) {
    const end = beat.date + timing.pulse;
    const tempo = tempos.find((t) => t.date <= beat.date && end <= t.endDate);
    const inner = chords.filter((c) => c.date > beat.date && c.date < end);
    if (!tempo || inner.length === 0) continue;
    const curve = (date: Ticks): Seconds => computeMillisecondsAt(date, tempo, TICKS_PER_QUARTER) / 1000;
    const [t0, t1] = [clockTime(beat.date), clockTime(end)];
    if (t1 <= t0) continue;
    // the roll's proportions within the beat, on the curve's own time for it
    const stretch = (curve(end) - curve(beat.date)) / (t1 - t0);
    let xy = 0;
    let xx = 0;
    for (const c of inner) {
      const target = curve(beat.date) + (beatTime(c) - t0) * stretch;
      // the date at which the curve is at that time
      let [lo, hi] = [beat.date, end];
      for (let k = 0; k < 30; k++) {
        const middle = (lo + hi) / 2;
        if (curve(middle) < target) lo = middle;
        else hi = middle;
      }
      const x = Math.log((c.date - beat.date) / timing.pulse);
      const y = Math.log(clamp(((lo + hi) / 2 - beat.date) / timing.pulse, 1e-3, 1 - 1e-3));
      xy += x * y;
      xx += x * x;
    }
    const intensity = clamp(xy / xx, 0.2, 5);
    if (Math.abs(intensity - 1) >= minRubato)
      rubatos.push({ date: beat.date, length: timing.pulse, intensity });
  }
  for (const r of rubatos)
    calls.push({
      id: id(),
      name: 'InsertRubato',
      options: { scope: 'global', date: r.date, length: r.length },
      range: { from: r.date, to: r.date + r.length },
    });
  for (const a of accents)
    calls.push({
      id: id(),
      name: 'InsertMetricalAccentuation',
      options: {
        from: a.from,
        to: a.to,
        beatLength: beatLength / 2,
        name: `pattern-${a.from}`,
        scaleTolerance: 1.5,
        neutralEnd: true,
        scope: 'global',
      },
      range: { from: a.from, to: a.to },
    });
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
    betweens,
    clock: clock.filter((p) => p.date >= section.from && p.date <= section.to),
    fitted: { tempo: fittedTempo, dynamics: fittedDynamics },
    instructions: { tempo: tempos, dynamics },
    rubatos,
    accents,
    calls,
  };
}

/** The roll's position at a moment of the take, for drawing the take over the score. */
export const scoreDateAt = (roll: Roll, timing: TakeTiming, t: Seconds): Ticks =>
  dateAt(roll, t + timing.start);
