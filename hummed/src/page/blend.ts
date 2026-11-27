// What each setting sounding at once weighs: a course of gains in context time, piecewise linear, as
// an AudioParam plays a series of linear ramps, so that the page knows what is heard without asking
// the audio thread, and draws each setting as strongly. A crossfade fades every setting that sounds
// from where it is, whether it was coming in or going out, while the new one comes in: their powers
// keep summing to one throughout, however many sound and however often the fader moves on.
//
// That holds for sounds that have nothing in common. Two settings placed at the same tick share
// much: the same notes struck together, alike or opposite in phase, and their sum is up to 3 dB
// louder in the middle of an equal-power crossfade, or as much quieter. Where the page has both
// sounds, it measures how alike they are over the crossfade and corrects both gains by as much as
// keeps the sum where two unrelated sounds would have it (`Correction`).
import { fadeInGain, fadeOutGain } from './alignment.ts';

/** A gain at a time: where a ramp ends, and the next one begins. */
export interface Point {
  readonly time: number;
  readonly value: number;
}

/** The longest stretch a ramp covers within a fade: the cosine is drawn straight between its points. */
export const FADE_STEP = 0.004;
/** The fewest ramps a fade has. */
const FEWEST = 8;

/** The times of a fade's points after its start: evenly over its length, no further apart than a step. */
function steps(start: number, length: number): number[] {
  const n = Math.max(FEWEST, Math.ceil(length / FADE_STEP));
  return Array.from({ length: n }, (_, i) => start + (length * (i + 1)) / n);
}

/** A gain both settings of a crossfade are taken by, at a phase of it from 0 to 1. */
export type Correction = (phase: number) => number;
const NONE: Correction = () => 1;

/** The most a correction lifts or lowers the two, in amplitude: 3 dB either way. */
const MOST = Math.SQRT2;

/**
 * How alike two sounds are over a crossfade: the power of each (the mean of its square) and of the
 * two together (the mean of their product), as measured from their samples.
 */
export interface Likeness {
  readonly going: number;
  readonly coming: number;
  readonly both: number;
}

/**
 * A setting's sound as it is heard: what it is made of (each some of a buffer's samples, the first at
 * `from` in the rendering's time, at their rate, and the gain it is heard at), placed in context time.
 */
export interface Heard {
  /** The context time of the rendering's time 0. */
  readonly origin: number;
  readonly parts: readonly {
    readonly samples: Float32Array;
    readonly from: number;
    readonly rate: number;
    readonly gain: number;
  }[];
}

/** How often a moment of the two is taken to measure them: far more often than the crossfade's course changes. */
const MEASURED = 22050;

/** How alike two sounds are from context time `from` to `to`, from their samples. */
export function likeness(going: Heard, coming: Heard, from: number, to: number): Likeness {
  const at = (heard: Heard, time: number): number => {
    let x = 0;
    for (const { samples, from: first, rate, gain } of heard.parts) {
      const i = Math.round((time - heard.origin - first) * rate);
      if (i >= 0 && i < samples.length) x += gain * samples[i];
    }
    return x;
  };
  let a = 0;
  let b = 0;
  let ab = 0;
  const n = Math.max(1, Math.round((to - from) * MEASURED));
  for (let k = 0; k < n; k++) {
    const time = from + ((k + 0.5) * (to - from)) / n;
    const x = at(going, time);
    const y = at(coming, time);
    a += x * x;
    b += y * y;
    ab += x * y;
  }
  return { going: a / n, coming: b / n, both: ab / n };
}

/**
 * The correction for two sounds this alike: an equal-power crossfade of them sums to
 * cos²·P₁ + sin²·P₂ + 2·cos·sin·C, where unrelated ones sum to cos²·P₁ + sin²·P₂; both gains are
 * taken by the square root of the one over the other, within 3 dB. Nothing to correct where either
 * is silent.
 */
export function correction({ going, coming, both }: Likeness): Correction {
  if (!(going > 0 && coming > 0) || both === 0) return NONE;
  return (phase) => {
    const c = fadeOutGain(phase);
    const s = fadeInGain(phase);
    const unrelated = c * c * going + s * s * coming;
    const summed = unrelated + 2 * c * s * both;
    if (!(summed > 0)) return MOST;
    return Math.min(MOST, Math.max(1 / MOST, Math.sqrt(unrelated / summed)));
  };
}

export class Weight {
  /** The course, in time order: held before the first point and after the last. */
  readonly #points: Point[];
  /**
   * When it has faded out for good, once it has been faded out: kept apart from the course, which
   * forgets its points as the audio thread plays them.
   */
  #end: number | null = null;

  constructor(time: number, value: number) {
    this.#points = [{ time, value }];
  }

  /** A setting that comes in from nothing over `length` from `time`, its gain taken by `corrected`. */
  static fadingIn(time: number, length: number, corrected: Correction = NONE): Weight {
    const weight = new Weight(time, 0);
    for (const t of steps(time, length)) {
      const phase = (t - time) / length;
      weight.#points.push({ time: t, value: fadeInGain(phase) * corrected(phase) });
    }
    return weight;
  }

  get points(): readonly Point[] {
    return this.#points;
  }

  /** When it has gone for good: the end of a fade out, or null while it still sounds on. */
  get end(): number | null {
    return this.#end;
  }

  /** The gain at a time. */
  at(time: number): number {
    const points = this.#points;
    const first = points.at(0);
    if (!first || time <= first.time) return first?.value ?? 0;
    let lo = 0;
    let hi = points.length - 1;
    if (time >= points[hi].time) return points[hi].value;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].time <= time) lo = mid;
      else hi = mid;
    }
    const a = points[lo];
    const b = points[hi];
    return a.value + ((b.value - a.value) * (time - a.time)) / (b.time - a.time);
  }

  /**
   * Fade out from wherever it is at `time`, over `length`: the course is kept up to then and ends
   * there, at its gain then, and goes on from there to nothing. Returns the points that come after
   * `time`; the first of all is the point at `time` itself, which an AudioParam reaches by a ramp
   * along the course it was on. Its gain is taken by `corrected` as it goes.
   */
  fadeOut(time: number, length: number, corrected: Correction = NONE): readonly Point[] {
    const from = this.at(time);
    return this.follow(time, length, (t) => {
      const phase = (t - time) / length;
      return from * fadeOutGain(phase) * corrected(phase);
    });
  }

  /**
   * Go out from wherever it is at `time` along a course of gains (of context time), to nothing at
   * `time + length`: as `fadeOut`, the course another's fade gives it. Returns the points after `time`.
   */
  follow(time: number, length: number, course: (time: number) => number): readonly Point[] {
    const from = this.at(time);
    const kept = this.#points.filter((p) => p.time <= time);
    const added: Point[] = [];
    if (kept[kept.length - 1]?.time !== time) added.push({ time, value: from });
    for (const t of steps(time, length)) added.push({ time: t, value: course(t) });
    // the last at nothing exactly; one gone already by then stays gone from when it went
    added[added.length - 1] = { time: time + length, value: 0 };
    this.#points.length = 0;
    this.#points.push(...kept, ...added);
    const gone = this.#end;
    this.#end = from === 0 && gone !== null && gone <= time ? gone : time + length;
    return added;
  }

  /** Forget the course before `time`, as the audio thread has: only what is still to come is kept. */
  forget(time: number): void {
    const points = this.#points;
    let k = 0;
    while (k + 1 < points.length && points[k + 1].time <= time) k++;
    if (k > 0) points.splice(0, k);
  }
}

/** The sum of the powers of several weights at a time: one, wherever a crossfade has left them. */
export const power = (weights: readonly Weight[], time: number): number =>
  weights.reduce((sum, w) => sum + w.at(time) ** 2, 0);
