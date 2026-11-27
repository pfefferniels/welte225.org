// Wandering: the fader glides by itself over the settings of the table (shared/shape.ts), from the far
// right (the piece as Grünfeld plays it) to the far left, then back again, and so on while the music
// plays. It goes at an even pace counted in the music, two bars from one setting of the table to the
// next, so that each is heard as long, however fast it goes; and as it goes, the voice rendered for
// each step on the way (every 0.05) takes over from the one before, as when the fader is dragged.
import type { Seconds } from '../shared/units.ts';
import { ELABORATION } from '../shared/shape.ts';
import { voiceElaboration } from './mix.ts';

/** How long the fader takes from one setting of the table to the next: in bars of the music. */
export const WANDER_BARS = 2;

/** The settings of the table on the fader, where the voice is rendered for each: the glide's ends and its pace. */
export const WANDER_STOPS: readonly number[] = ELABORATION.points.map((p) => voiceElaboration(p));

/**
 * The most the music may go on between two looks at it to count as playing on, in bars: more is a
 * seek, and so is going back.
 */
export const WANDER_LEAP = 1;

/**
 * Where the fader is, `bars` into the wandering: from the far right towards the far left, `WANDER_BARS`
 * from each stop to the next, evenly between them; turning at either end, and so on.
 */
export function wanderAt(bars: number, stops: readonly number[] = WANDER_STOPS): number {
  const n = stops.length - 1;
  if (n <= 0) return stops.at(0) ?? 0;
  const span = n * WANDER_BARS;
  const phase = ((bars % (2 * span)) + 2 * span) % (2 * span);
  // how far from the far right, in stops
  const k = (phase <= span ? phase : 2 * span - phase) / WANDER_BARS;
  const i = Math.min(n - 1, Math.floor(k));
  const from = stops[n - i];
  const to = stops[n - i - 1];
  return from + (to - from) * (k - i);
}

/**
 * How far the music went on between two looks at it, in bars: nothing at the first look, nor where it
 * went back or leapt ahead (a seek).
 */
export function wentOn(before: number | null, now: number): number {
  if (before === null) return 0;
  const step = now - before;
  return step > 0 && step <= WANDER_LEAP ? step : 0;
}

/**
 * Where a time is in bars: whole bars at the downbeats (`bars`, as a rendering has them), fractions
 * between; before the first and after the last, at the length of the bar nearest.
 */
export function barsAt(bars: readonly (readonly [Seconds, string])[], t: Seconds): number {
  const n = bars.length;
  if (n === 0) return 0;
  if (n === 1) return t - bars[0][0];
  const at = (i: number): Seconds => bars[Math.min(n - 1, Math.max(0, i))][0];
  let i = 0;
  while (i + 1 < n && at(i + 1) <= t) i++;
  // before the first downbeat, the first bar's length; after the last, the last's
  const from = t < at(0) ? 0 : i;
  const length = from + 1 < n ? at(from + 1) - at(from) : at(n - 1) - at(n - 2);
  return from + (t - at(from)) / length;
}
