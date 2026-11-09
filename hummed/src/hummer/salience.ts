// Where the voice has something to convey: the voice sounds where the MPM is doing something (a
// hairpin under way, a peak, a bend of the tempo, an accent, a touch, a leap, a phrase beginning)
// and falls silent where it is not, as a pianist humming along catches some notes and lets others go.
import { clip, interp } from '../shared/math.ts';
import type { Ms, Seconds, Ticks } from '../shared/units.ts';
import type { Clock } from './clock.ts';
import type { MelodyNote, VoiceNote } from './melody.ts';
import type { DynamicsCurve } from './performance.ts';

/** How strongly a note's onset carries, and how its weight fades while it is held. */
export const SALIENCE = {
  /** A dynamics change of this many units per second counts fully. */
  slope: 6,
  /** A note this far above the dynamics of the 3 s about it (median) counts fully: a peak. */
  peak: 2.5,
  /** A beat this much longer or shorter (log) than the beats of ±4 beats about it counts fully. */
  bend: 0.2,
  /** Beats bent less than this are the reconstruction's ordinary rubato and count for nothing. */
  bendFrom: 0.08,
  /** A note this much above the dynamics curve in velocity counts fully: an accent. */
  accent: 2,
  /** A note detached or repeated (the piano's touch, said with a consonant). */
  touch: 0.7,
  /** A leap of a fourth or more. */
  leap: 0.6,
  /** A note's weight holds this long after its onset, then fades with this time constant. */
  holdMs: 250,
  fadeMs: 600,
} as const;

/** What the MPM does at a sung note, 0 (nothing) to 1. */
export function noteSalience(melody: readonly MelodyNote[], dynamics: DynamicsCurve, clock: Clock): number[] {
  const D = (t: Seconds): number => interp(t, dynamics.times, dynamics.values);
  const beat = (d: Ticks): number => (clock.toMs(d + 360) - clock.toMs(d - 360)) / 720;
  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return melody.map((n, k) => {
    if (n.breathBefore || k === 0) return 1;
    const prev = melody[k - 1];
    const t = n.onsetMs / 1000;
    const around: number[] = [];
    for (let s = t - 3; s <= t + 3; s += 0.1) around.push(D(s));
    const context: number[] = [];
    for (let d = n.date - 2880; d <= n.date + 2880; d += 180) context.push(beat(d));
    const bend = Math.abs(Math.log(beat(n.date) / median(context)));
    const gap = n.onsetMs - prev.keyOffMs;
    return Math.max(
      clip(Math.abs(D(t + 0.5) - D(t - 0.2)) / 0.7 / SALIENCE.slope, 0, 1),
      clip((D(t + 0.1) - median(around)) / SALIENCE.peak, 0, 1),
      clip((bend - SALIENCE.bendFrom) / (SALIENCE.bend - SALIENCE.bendFrom), 0, 1),
      clip((n.velocity - D(t)) / SALIENCE.accent, 0, 1),
      gap > 15 || n.pitch === prev.pitch ? SALIENCE.touch : 0,
      Math.abs(n.pitch - prev.pitch) >= 5 ? SALIENCE.leap : 0,
    );
  });
}

/**
 * What there is to convey, per 10 ms of the performance (without the rendering's padding): each
 * note's salience, held and then fading while the note is held, or the dynamics in motion there.
 */
export function activity(
  melody: readonly MelodyNote[],
  voice: readonly VoiceNote[],
  salience: readonly number[],
  dynamics: DynamicsCurve,
  endMs: Ms,
): Float32Array {
  const D = (t: Seconds): number => interp(t, dynamics.times, dynamics.values);
  const a = new Float32Array(Math.ceil(endMs / 10) + 1);
  for (let i = 0; i < a.length; i++) {
    const t = i / 100;
    a[i] = clip(Math.abs(D(t + 0.25) - D(t - 0.25)) / 0.5 / SALIENCE.slope, 0, 1);
  }
  melody.forEach((n, k) => {
    const on = n.onsetMs;
    const off = voice[k].off * 1000;
    for (let i = Math.max(0, Math.floor(on / 10)); i < Math.min(a.length, Math.ceil(off / 10)); i++) {
      const held = i * 10 - on;
      const w = held <= SALIENCE.holdMs ? 1 : Math.exp(-(held - SALIENCE.holdMs) / SALIENCE.fadeMs);
      a[i] = Math.max(a[i], salience[k] * w);
    }
  });
  return a;
}

/**
 * Where the voice falls silent: the spans (ms of the performance) where the activity stays below
 * `threshold` for at least `minMs`, each beginning in a held note, never at a note's onset.
 */
export function quietSpans(
  a: Float32Array,
  voice: readonly VoiceNote[],
  threshold: number,
  minMs: Ms = 500,
): [Ms, Ms][] {
  // the stretches the voice sounds without a break: legato notes join, breaths part them
  const voiced: [Ms, Ms][] = [];
  for (const v of voice) {
    const last = voiced.at(-1);
    if (last && v.on * 1000 - last[1] < 5) last[1] = v.off * 1000;
    else voiced.push([v.on * 1000, v.off * 1000]);
  }
  const spans: [Ms, Ms][] = [];
  let start = -1;
  for (let i = 0; i <= a.length; i++) {
    const low = i < a.length && a[i] < threshold;
    if (low && start < 0) start = i;
    if (!low && start >= 0) {
      for (const [v0, v1] of voiced) {
        const s0 = Math.max(start * 10, v0);
        const s1 = Math.min(i * 10, v1);
        if (s1 - s0 >= minMs) spans.push([s0, s1]);
      }
      start = -1;
    }
  }
  return spans.sort((x, y) => x[0] - y[0]);
}
