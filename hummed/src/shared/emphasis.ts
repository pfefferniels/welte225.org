// Instructions of the MPM brought out: what they govern is played more than it is, and everything
// else is held back, so that what a remark says of a passage is heard in it. The worker makes the
// MPM that plays so (worker/emphasis.ts, with espressivo); this is what the page and the worker both
// need of an emphasis: its bounds, and what tells one from another.
import { clip } from './math.ts';

export interface Emphasis {
  /** The instructions brought out, by their xml:ids in the MPM. */
  readonly ids: readonly string[];
  /** How far what they govern is exaggerated: ×1 as it is. */
  readonly factor: number;
  /** How much is left of everything else: 1 as it is. */
  readonly attenuation: number;
}

/**
 * The bounds: what is brought out is never played less than it is, nor twice as much; and the rest
 * is held back to a twentieth at the most (espressivo takes no attenuation of nothing).
 */
export const EMPHASIS = { factor: [1, 1.9], attenuation: [0.05, 1] } as const;

const within = (x: number, [lo, hi]: readonly [number, number]): number =>
  Number.isFinite(x) ? clip(x, lo, hi) : 1;

/**
 * An emphasis as it is applied: within the bounds, each id once. None where it would change nothing:
 * no instruction named, or nothing exaggerated and nothing held back.
 */
export function emphasisOf(emphasis: Emphasis | undefined): Emphasis | undefined {
  if (!emphasis) return undefined;
  const ids = [...new Set(emphasis.ids)];
  const factor = within(emphasis.factor, EMPHASIS.factor);
  const attenuation = within(emphasis.attenuation, EMPHASIS.attenuation);
  if (ids.length === 0 || (factor === 1 && attenuation === 1)) return undefined;
  return { ids, factor, attenuation };
}

/** What tells emphases apart: the same key, the same MPM (the order of the ids makes no difference). */
export function emphasisKey(emphasis: Emphasis): string {
  const { ids, factor, attenuation } = emphasisOf(emphasis) ?? { ids: [], factor: 1, attenuation: 1 };
  return `${[...ids].sort().join(' ')}×${factor}÷${attenuation}`;
}
