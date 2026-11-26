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
  for (const ms of from.ms) deltas.push(ms / 1000 + pad - tFrom);
  // a bend of the clock coming in, where `from` reaches its tick
  for (const tick of to.ticks) deltas.push(interp(tick, from.ticks, from.ms) / 1000 + pad - tFrom);
  let most = 0;
  for (const delta of deltas)
    if (Math.abs(delta) <= half) most = Math.max(most, Math.abs(misalignment(from, to, tFrom, tTo, delta)));
  return most;
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
