// Wandering: the fader walks by itself through the settings of the table (shared/shape.ts), one at a
// time, each heard for a bar and a half of the music: from the far right (the piece as Grünfeld plays
// it) to the far left, a setting at a time, then back again, and so on while the music plays. A bar
// and a half is counted in the music from where a setting takes over, so that each is heard as long,
// however fast it goes.
import type { Seconds } from '../shared/units.ts';
import { ELABORATION } from '../shared/shape.ts';
import { voiceElaboration } from './mix.ts';

/** How long each setting is heard: in bars of the music. */
export const WANDER_BARS = 1.5;

/** Where the fader stops: at each setting of the table, where the voice is rendered for it. */
export const WANDER_STOPS: readonly number[] = ELABORATION.points.map((p) => voiceElaboration(p));

/** Where the wandering is: at which stop, going which way. */
export interface Wandering {
  readonly stop: number;
  readonly direction: 1 | -1;
}

/** Where it sets off: at the far right, going left. */
export const WANDER_START: Wandering = { stop: WANDER_STOPS.length - 1, direction: -1 };

/** The stop after this one: on the way it goes, turning at either end. */
export function nextStop({ stop, direction }: Wandering, stops = WANDER_STOPS.length): Wandering {
  const turned = stop + direction < 0 || stop + direction >= stops ? -direction : direction;
  return { stop: Math.min(stops - 1, Math.max(0, stop + turned)), direction: turned as 1 | -1 };
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
