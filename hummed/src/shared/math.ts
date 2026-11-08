/** Linear interpolation in a table sorted by `xs`, held constant beyond both ends (numpy.interp). */
export function interp(x: number, xs: ArrayLike<number>, ys: ArrayLike<number>): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / (xs[hi] - xs[lo]);
}

export const clip = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** The number `toFixed` prints: the decisions keep the precision they would have in an MPM. */
export const fixed = (x: number, digits: number): number => Number(x.toFixed(digits));

/** A seeded random source (mulberry32), so that a level renders the same every time. */
export interface Random {
  uniform(lo: number, hi: number): number;
  normal(mean: number, sd: number): number;
}

export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    normal: (mean, sd) => mean + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
  };
}

/** Group values by a key, keeping their order within each group. */
export function groupBy<T, K>(items: Iterable<T>, key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
