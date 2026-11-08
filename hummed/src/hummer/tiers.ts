import type { Ms } from '../shared/units.ts';

/** One gesture on a tier: a target held (or, for f0, sloped) from `start` to `end`. */
export interface Segment<V extends string | number> {
  start: Ms;
  end: Ms;
  readonly value: V;
  readonly slope: number;
}

export type Tier<V extends string | number> = Segment<V>[];

/** The gestural tiers of the voice; the vowel tier comes twice, lips closed and lips open. */
export interface Tiers {
  vowelClosed: Tier<string>;
  vowelOpen: Tier<string>;
  lip: Tier<string>;
  tongueTip: Tier<string>;
  velic: Tier<number>;
  glottal: Tier<string>;
  f0: Tier<number>;
  pressure: Tier<number>;
}

export const segment = <V extends string | number>(start: Ms, end: Ms, value: V, slope = 0): Segment<V> => ({
  start,
  end,
  value,
  slope,
});

/** The tier with `value` from `start` to `end`, cutting what it covers. */
export function splice<V extends string | number>(tier: Tier<V>, start: Ms, end: Ms, value: V): Tier<V> {
  const out: Tier<V> = [];
  for (const g of tier) {
    if (g.end <= start || g.start >= end) {
      out.push(g);
      continue;
    }
    if (g.start < start) out.push(segment(g.start, start, g.value, g.slope));
    if (g.end > end) out.push(segment(end, g.end, g.value, g.slope));
  }
  out.push(segment(start, end, value));
  return out.sort((x, y) => x.start - y.start);
}

/** Runs of equal values on a grid of times, as segments; the last runs to `end`. */
export function runs<V extends string | number>(
  times: readonly Ms[],
  values: readonly V[],
  end: Ms,
): Tier<V> {
  const out: Tier<V> = [];
  let s0 = 0;
  for (let i = 1; i <= values.length; i++) {
    if (i === values.length || values[i] !== values[s0]) {
      out.push(segment(times[s0], i < values.length ? times[i] : end, values[s0]));
      s0 = i;
    }
  }
  return out;
}
