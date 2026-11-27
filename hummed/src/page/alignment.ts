// Two renderings of the piece at once: where one is in the score, the other is at the same tick of it
// at a time of its own (each rendering's clock maps its performed time to score time). A crossfade
// from one into the other places the one coming in so that both are at the same tick at the
// crossfade's midpoint, to the sample. Played at different tempi, they drift apart on either side of
// it; the crossfade is made as long as they stay together, within a bound, wherever both are heard.
import { interp } from '../shared/math.ts';
import { PAD_MS, type Seconds, type Ticks } from '../shared/units.ts';

/** A rendering's clock: score time against performed ms, without the silence before the music. */
export interface Clock {
  readonly ticks: readonly Ticks[];
  readonly ms: readonly number[];
}

const last = (xs: readonly number[]): number => xs[xs.length - 1] ?? 0;

/**
 * The time of `to` at the score position where `from` is at time `t`. Within the stretch of the score
 * both clocks cover, through the ticks; before and after it (the silence before the music, the sound
 * dying away after it) time runs on as it does, from the nearest place both cover.
 */
export function counterpart(from: Clock, to: Clock, t: Seconds): Seconds {
  const ms = t * 1000 - PAD_MS;
  const lo = Math.max(from.ticks[0] ?? 0, to.ticks[0] ?? 0);
  const hi = Math.min(last(from.ticks), last(to.ticks));
  const msLo = interp(lo, from.ticks, from.ms);
  const msHi = interp(hi, from.ticks, from.ms);
  let out: number;
  if (ms <= msLo) out = interp(lo, to.ticks, to.ms) - (msLo - ms);
  else if (ms >= msHi) out = interp(hi, to.ticks, to.ms) + (ms - msHi);
  else out = interp(interp(ms, from.ms, from.ticks), to.ticks, to.ms);
  return (out + PAD_MS) / 1000;
}

/**
 * How far apart the two are heard at `delta` from the midpoint, where `from` is at `tFrom` and `to`
 * at `tTo`, both playing on at their own pace: how much later `to` plays the score position that
 * `from` plays then (negative where it plays it sooner).
 */
export const misalignment = (from: Clock, to: Clock, tFrom: Seconds, tTo: Seconds, delta: Seconds): Seconds =>
  counterpart(from, to, tFrom + delta) - (tTo + delta);

/**
 * The most the two are apart within `half` on either side of the midpoint. The misalignment is
 * piecewise linear in time, bending where either clock does, so the most is at one of those bends
 * or at either end.
 */
export function largestMisalignment(
  from: Clock,
  to: Clock,
  tFrom: Seconds,
  tTo: Seconds,
  half: Seconds,
): Seconds {
  const pad = PAD_MS / 1000;
  const deltas = [-half, half];
  // the bends of the clock going out within the window
  const msFrom = (tFrom - half - pad) * 1000;
  const msTo = (tFrom + half - pad) * 1000;
  for (let i = firstAtLeast(from.ms, msFrom); i < from.ms.length && from.ms[i] <= msTo; i++)
    deltas.push(from.ms[i] / 1000 + pad - tFrom);
  // a bend of the clock coming in, where `from` reaches its tick
  const tickFrom = interp(msFrom, from.ms, from.ticks);
  const tickTo = interp(msTo, from.ms, from.ticks);
  for (let i = firstAtLeast(to.ticks, tickFrom); i < to.ticks.length && to.ticks[i] <= tickTo; i++)
    deltas.push(interp(to.ticks[i], from.ticks, from.ms) / 1000 + pad - tFrom);
  let most = 0;
  for (const delta of deltas)
    if (Math.abs(delta) <= half) most = Math.max(most, Math.abs(misalignment(from, to, tFrom, tTo, delta)));
  return most;
}

/** The first index of a sorted list whose value is at least `x`. */
function firstAtLeast(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** How a crossfade's length is chosen. */
export interface CrossfadeRule {
  /** The most two settings may be apart where both are heard. */
  readonly bound: Seconds;
  /** Where both are heard: where each is at least this much of its full amplitude. */
  readonly weight: number;
  readonly shortest: Seconds;
  readonly longest: Seconds;
}

/**
 * The rule for a setting that is ready, while the fader moves: as long as 0.4 s, and ten
 * milliseconds apart at most where each is no more than 12 dB under its full level (an equal-power
 * crossfade's middle two thirds). Ten milliseconds is about where two notes struck together begin to
 * be heard as two; a sound 12 dB under another hardly makes one of them heard twice.
 */
export const SWITCH: CrossfadeRule = { bound: 0.01, weight: 0.25, shortest: 0.01, longest: 0.4 };

/** An equal-power crossfade's gains: the one going out, and the one coming in, at a phase from 0 to 1. */
export const fadeOutGain = (phase: number): number =>
  Math.cos((Math.PI / 2) * Math.min(1, Math.max(0, phase)));
export const fadeInGain = (phase: number): number =>
  Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, phase)));

/**
 * Over how much of an equal-power crossfade both are at least `weight` of their full amplitude, on
 * either side of the midpoint, as a share of its length: sin and cos both reach it between the phases
 * asin(weight) and acos(weight).
 */
export const weightedHalf = (length: Seconds, weight: number): Seconds =>
  (length / 2) * Math.max(0, 1 - (4 * Math.asin(Math.min(1, Math.max(0, weight)))) / Math.PI);

/** A crossfade as it is to be played. */
export interface Crossfade {
  /** How long it takes. */
  readonly length: Seconds;
  /** Where each of the two is at its midpoint: the same tick of the score. */
  readonly from: Seconds;
  readonly to: Seconds;
  /** The most they are apart where both are heard. */
  readonly apart: Seconds;
}

/**
 * The crossfade from `from` into `to` beginning where `from` is at `start`: as long as the rule lets
 * it be with the two no further apart than its bound where both are heard, from the longest down by
 * a sixth at a time; never shorter than its shortest, however far apart they are then. At the
 * midpoint both are at the same tick.
 */
export function crossfadeFrom(from: Clock, to: Clock, start: Seconds, rule: CrossfadeRule): Crossfade {
  let length = rule.longest;
  for (;;) {
    const tFrom = start + length / 2;
    const tTo = counterpart(from, to, tFrom);
    const apart = largestMisalignment(from, to, tFrom, tTo, weightedHalf(length, rule.weight));
    if (apart <= rule.bound || length <= rule.shortest) return { length, from: tFrom, to: tTo, apart };
    length = Math.max(rule.shortest, (length * 5) / 6);
  }
}

/** A crossfade placed in context time: when it begins, its midpoint, and where the one coming in starts. */
export interface Placed extends Crossfade {
  readonly at: number;
  readonly mid: number;
  /** The context time of the time 0 of the one coming in: it plays on from there at the clock's pace. */
  readonly origin: number;
}

/**
 * The crossfade from a rendering playing with its time 0 at context time `fromOrigin` into another,
 * beginning at context time `at`: the one coming in placed so that at the midpoint it is at the tick
 * the one going out is at then.
 */
export function placeCrossfade(
  from: Clock,
  fromOrigin: number,
  to: Clock,
  at: number,
  rule: CrossfadeRule,
): Placed {
  const fade = crossfadeFrom(from, to, at - fromOrigin, rule);
  const mid = at + fade.length / 2;
  return { ...fade, at, mid, origin: mid - fade.to };
}

/** The crossfade centred on a context time `mid`, `length` long: where each is there, how far apart they get. */
function centred(
  from: Clock,
  fromOrigin: number,
  to: Clock,
  mid: number,
  length: Seconds,
  rule: CrossfadeRule,
): Placed {
  const tFrom = mid - fromOrigin;
  const tTo = counterpart(from, to, tFrom);
  const apart = largestMisalignment(from, to, tFrom, tTo, weightedHalf(length, rule.weight));
  return { length, from: tFrom, to: tTo, apart, at: mid - length / 2, mid, origin: mid - tTo };
}

/** Where to look for a better place for a crossfade than the first. */
export interface Search {
  /** How much later at most a crossfade may begin, to be centred on a note struck in both. */
  readonly snap: Seconds;
  /** How much later at most it may begin, to find a place where the two keep together. */
  readonly ahead: Seconds;
  /** The shortest crossfade worth a later start, and the steps in which later starts are tried. */
  readonly decent: Seconds;
  readonly step: Seconds;
}

/**
 * A crossfade begins as soon as it can, unless a note struck in both lies within reach of its
 * midpoint (a crossfade beginning no more than 50 ms later, at least half as long as the first and
 * 60 ms, can be centred on it, so that the two strike it together), or unless the two keep together
 * there only for a crossfade shorter than 60 ms, or not at all (where one goes through a grace
 * note's figure in half a second and the other in a few milliseconds): then where they do, up to
 * half a second later.
 */
export const SEARCH: Search = { snap: 0.05, ahead: 0.5, decent: 0.06, step: 0.01 };

/**
 * Where to crossfade from a rendering playing with its time 0 at context time `fromOrigin` into
 * another, beginning at context time `earliest` or a little later: centred on a strike within reach
 * (the clock's bends are the onsets that no roll moves); else at once, where the two keep together
 * over a crossfade of a decent length; else at the first place within `ahead` where they do; else
 * wherever within that they are least apart.
 */
export function findCrossfade(
  from: Clock,
  fromOrigin: number,
  to: Clock,
  earliest: number,
  rule: CrossfadeRule,
  search: Search = SEARCH,
): Placed {
  const first = placeCrossfade(from, fromOrigin, to, earliest, rule);
  const decent = Math.min(search.decent, rule.longest);
  const good = (p: Placed): boolean => p.apart <= rule.bound && p.length >= decent - 1e-9;
  const pad = PAD_MS / 1000;
  // the onsets of the one going out, in context time, within reach of a midpoint
  const reach = (time: number): number => (time - fromOrigin - pad) * 1000;
  const lo = firstAtLeast(from.ms, reach(earliest + decent / 2));
  const hiMs = reach(earliest + search.snap + rule.longest / 2);
  for (let k = 0; k * search.step <= search.snap + 1e-9; k++) {
    const start = earliest + k * search.step;
    // as long as the rule lets it be from here: an onset-centred one is to be at least half of that
    const own = k === 0 ? first : placeCrossfade(from, fromOrigin, to, start, rule);
    let best: Placed | null = null;
    for (let i = lo; i < from.ms.length && from.ms[i] <= hiMs; i++) {
      const mid = fromOrigin + from.ms[i] / 1000 + pad;
      const length = 2 * (mid - start);
      if (length < decent - 1e-9 || length > rule.longest + 1e-9) continue;
      const p = centred(from, fromOrigin, to, mid, length, rule);
      if (p.apart <= rule.bound && (!best || p.length > best.length)) best = p;
    }
    if (best && best.length >= Math.max(decent, own.length / 2) - 1e-9) return best;
  }
  if (good(first)) return first;
  let best = first;
  for (let k = 1; k * search.step <= search.ahead + 1e-9; k++) {
    const p = placeCrossfade(from, fromOrigin, to, earliest + k * search.step, rule);
    if (good(p)) return p;
    if (p.apart < best.apart - 1e-6 || (Math.abs(p.apart - best.apart) <= 1e-6 && p.length > best.length))
      best = p;
  }
  // nowhere a decent one: at once where the two keep together however briefly (their tempi too
  // far apart for longer)
  if (first.apart <= rule.bound) return first;
  // nor anywhere they keep together at all: on a little further for one where they do, as far
  // again; else where they are least apart
  for (let k = 1; best.apart > rule.bound && k * search.step <= search.ahead + 1e-9; k++) {
    const p = placeCrossfade(from, fromOrigin, to, earliest + search.ahead + k * search.step, rule);
    if (p.apart <= rule.bound) return p;
    if (p.apart < best.apart - 1e-6) best = p;
  }
  return best;
}

/** A rendering placed in context time: its clock, and the context time of its time 0. */
export interface Placing {
  readonly clock: Clock;
  readonly origin: number;
}

/**
 * How far apart two placed renderings are heard at a context time: how much later `b` plays the
 * score position that `a` plays then (negative where sooner).
 */
export const apartAt = (a: Placing, b: Placing, time: number): Seconds =>
  b.origin + counterpart(a.clock, b.clock, time - a.origin) - time;

/**
 * The first context time in [from, to] at which two placed renderings are further apart than
 * `bound`: looked for by the millisecond, then to the microsecond between the last within it and
 * the first beyond.
 */
export function firstApart(a: Placing, b: Placing, from: number, to: number, bound: Seconds): number | null {
  const beyond = (time: number): boolean => Math.abs(apartAt(a, b, time)) > bound;
  if (beyond(from)) return from;
  for (let time = from + 0.001; time <= to + 1e-9; time += 0.001)
    if (beyond(time)) {
      let lo = time - 0.001;
      let hi = time;
      while (hi - lo > 1e-6) {
        const mid = (lo + hi) / 2;
        if (beyond(mid)) hi = mid;
        else lo = mid;
      }
      return lo;
    }
  return null;
}

/**
 * Where the fader moves on while settings still blend: the crossfade is placed against the setting
 * that came in last (`target`), and each older one still heard has to be out of hearing (under a
 * quarter of its level) before it is further apart than the bound from any it is heard with: the
 * one coming in (once that is at a quarter), the target, the other older ones. Each fades out
 * from where it is in a cosine as long as gets it there by then, never longer than the crossfade,
 * never shorter than the rule's shortest. Returns their lengths, in their order; one that is under a
 * quarter already fades with the crossfade.
 */
export function olderFades(
  older: readonly (Placing & { readonly weight: number })[],
  target: Placing,
  incoming: Placing,
  placed: Pick<Placed, 'at' | 'length'>,
  rule: CrossfadeRule,
): Seconds[] {
  const { at, length } = placed;
  const end = at + length;
  // the one coming in is at a quarter of its level from here
  const heardIn = at + (length * 2 * Math.asin(rule.weight)) / Math.PI;
  return older.map((lane, k) => {
    if (lane.weight <= rule.weight) return length;
    const deadlines = [
      firstApart(lane, incoming, heardIn, end, rule.bound),
      firstApart(lane, target, at, end, rule.bound),
      ...older
        .filter((other, j) => j !== k && other.weight > rule.weight)
        .map((other) => firstApart(lane, other, at, end, rule.bound)),
    ].filter((time): time is number => time !== null);
    if (deadlines.length === 0) return length;
    // with a little to spare: 2 ms before, and under nine tenths of a quarter (the cosine is drawn
    // straight between points a few ms apart)
    const deadline = Math.max(at, Math.min(...deadlines) - 0.002);
    const share = (2 / Math.PI) * Math.acos(Math.min(1, (0.9 * rule.weight) / lane.weight));
    return Math.min(length, Math.max(rule.shortest, (deadline - at) / share));
  });
}
