// How things move on the roll: the words out of the way of their notes, the notes into sight, the
// roll to another zoom. All of it takes the same time and is eased the same way; for a reader who
// asks for less motion the time is nothing, and everything is where it goes at once.
import type { Ms } from '../shared/units.ts';

/** How long anything takes to get where it is going. */
export const GLIDE: Ms = 280;

/** Slowly out of where it was and slowly into where it goes, from 0 to 1. */
export function ease(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/** A number on its way to another. Aimed anew before it is there, it goes on from where it is. */
export class Eased {
  #from: number;
  #to: number;
  #start = 0;
  #duration: Ms = 0;

  constructor(value: number) {
    this.#from = value;
    this.#to = value;
  }

  get target(): number {
    return this.#to;
  }

  at(now: number): number {
    if (this.#duration <= 0 || now - this.#start >= this.#duration) return this.#to;
    return this.#from + (this.#to - this.#from) * ease((now - this.#start) / this.#duration);
  }

  moving(now: number): boolean {
    return this.#from !== this.#to && this.#duration > 0 && now - this.#start < this.#duration;
  }

  /** Go to `target` from wherever it is at `now`, in `duration`; in no time, it is there at once. */
  aim(target: number, now: number, duration: Ms): void {
    if (target === this.#to) return;
    this.#from = this.at(now);
    this.#to = target;
    this.#start = now;
    this.#duration = duration;
  }

  /** Be `by` further on at once, where it is and where it goes. */
  shift(by: number): void {
    this.#from += by;
    this.#to += by;
  }
}
