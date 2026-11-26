// What each setting sounding at once weighs: a course of gains in context time, piecewise linear, as
// an AudioParam plays a series of linear ramps, so that the page knows what is heard without asking
// the audio thread, and draws each setting as strongly. A crossfade fades every setting that sounds
// from where it is, whether it was coming in or going out, while the new one comes in: their powers
// keep summing to one throughout, however many sound and however often the fader moves on.
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

export class Weight {
  /** The course, in time order: held before the first point and after the last. */
  readonly #points: Point[];

  constructor(time: number, value: number) {
    this.#points = [{ time, value }];
  }

  /** A setting that comes in from nothing over `length` from `time`. */
  static fadingIn(time: number, length: number): Weight {
    const weight = new Weight(time, 0);
    for (const t of steps(time, length))
      weight.#points.push({ time: t, value: fadeInGain((t - time) / length) });
    return weight;
  }

  get points(): readonly Point[] {
    return this.#points;
  }

  /** When it has gone for good: the end of a fade out, or null while it still sounds on. */
  get end(): number | null {
    const tail = this.#points.at(-1);
    return tail?.value === 0 && this.#points.length > 1 ? tail.time : null;
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
   * along the course it was on.
   */
  fadeOut(time: number, length: number): readonly Point[] {
    const from = this.at(time);
    const kept = this.#points.filter((p) => p.time <= time);
    const added: Point[] = [];
    if (kept[kept.length - 1]?.time !== time) added.push({ time, value: from });
    for (const t of steps(time, length))
      added.push({ time: t, value: from * fadeOutGain((t - time) / length) });
    // the last at nothing exactly, so that it is known to be over
    added[added.length - 1] = { time: time + length, value: 0 };
    this.#points.length = 0;
    this.#points.push(...kept, ...added);
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
