// Where the voice is heard. A pianist humming along sings the whole line inwardly; outwardly the
// voice carries what the performance does. It is heard where one of the MPM's maps that govern it
// moves significantly (the dynamics rising or falling, the tempo and rubato quickening or slowing, a
// note accented against the dynamics) and sinks back towards silence where none of them moves.
import { clip, interp } from '../shared/math.ts';
import type { Ms, Seconds } from '../shared/units.ts';
import type { Clock } from './clock.ts';
import type { MelodyNote, VoiceNote } from './melody.ts';
import type { DynamicsCurve } from './performance.ts';

/** How much of each map's movement counts as 1. */
export const MOVING = {
  /** The dynamics changing by this many units a second, either way. */
  dynamics: 6,
  /** The tempo (score time per second, rubato and all) changing by this share of itself a second. */
  tempo: 0.4,
  /** A note this much above the dynamics curve in velocity: an accent of the articulation. */
  accent: 2,
  /** An accent counts for this long after its note begins, then fades with this time constant. */
  holdMs: 200,
  fadeMs: 450,
  /** Change is read over this long: the dynamics across it, the tempo between two such stretches. */
  spanS: 0.5,
} as const;

/** How the voice comes and goes with the movement. */
export const SURFACING = {
  /** Below this share of the threshold nothing is heard; from the threshold on, all of the voice. */
  from: 0.25,
  /** It begins to come this long before what calls for it. */
  leadMs: 200,
  /** It comes and goes through two lags of these time constants: in over 0.8 s, out over 1.1 s. */
  inMs: 240,
  outMs: 320,
  /** From here on the voice counts as heard (some 15 dB under its full level). */
  heard: 0.5,
} as const;

/**
 * How much the maps move, per 10 ms of the performance (without the rendering's padding), 0 where
 * nothing is sung: the most of the dynamics' change, the tempo's change, and an accent fading while
 * its note is held, each against what counts as 1 (`MOVING`).
 */
export function movement(
  melody: readonly MelodyNote[],
  voice: readonly VoiceNote[],
  dynamics: DynamicsCurve,
  clock: Clock,
  endMs: Ms,
): Float32Array {
  const D = (t: Seconds): number => interp(t, dynamics.times, dynamics.values);
  const first = clock.ms[0] ?? 0;
  const last = clock.ms[clock.ms.length - 1] ?? 0;
  // score time per second about a moment, within what the clock covers
  const speed = (t: Seconds): number => {
    const a = Math.max(first, (t - MOVING.spanS) * 1000);
    const b = Math.min(last, (t + MOVING.spanS) * 1000);
    return b - a < 100 ? 0 : (clock.toTicks(b) - clock.toTicks(a)) / (b - a);
  };
  const n = Math.ceil(endMs / 10) + 1;
  const moving = new Float32Array(n);
  melody.forEach((m, k) => {
    const accent = clip((m.velocity - D(m.onsetMs / 1000)) / MOVING.accent, 0, 1);
    const i0 = Math.max(0, Math.floor(voice[k].on * 100));
    const i1 = Math.min(n, Math.floor(voice[k].off * 100));
    for (let i = i0; i < i1; i++) {
      const t = i / 100;
      const held = i * 10 - m.onsetMs;
      const half = MOVING.spanS / 2;
      const before = speed(t - half);
      const after = speed(t + half);
      moving[i] = Math.max(
        Math.abs(D(t + half) - D(t - half)) / MOVING.spanS / MOVING.dynamics,
        before > 0 && after > 0 ? Math.abs(Math.log(after / before)) / MOVING.spanS / MOVING.tempo : 0,
        accent * (held <= MOVING.holdMs ? 1 : Math.exp(-(held - MOVING.holdMs) / MOVING.fadeMs)),
      );
    }
  });
  return moving;
}

/**
 * How much of the voice is heard, 0 (inward, silent) to 1 (the voice as it is), per 10 ms of the
 * performance: the movement against `threshold`, softly (nothing below a quarter of it, all from it
 * on), coming in and going out slowly. A threshold of 0 or less lets all of the voice be heard.
 */
export function presence(moving: Float32Array, threshold: number): Float32Array {
  const p = new Float32Array(moving.length);
  if (threshold <= 0) return p.fill(1);
  const { inMs, outMs } = SURFACING;
  const lead = Math.round(SURFACING.leadMs / 10);
  const from = SURFACING.from * threshold;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < p.length; i++) {
    const x = clip((moving[Math.min(p.length - 1, i + lead)] - from) / (threshold - from), 0, 1);
    const gate = x * x * (3 - 2 * x);
    y1 += ((gate - y1) * 10) / (gate > y1 ? inMs : outMs);
    y2 += ((y1 - y2) * 10) / (y1 > y2 ? inMs : outMs);
    p[i] = y2 < 0.01 ? 0 : y2;
  }
  return p;
}

/** Where the voice is heard: the spans (ms of the performance) with the presence above `heard`. */
export function surfacings(p: Float32Array): { readonly from: Ms; readonly to: Ms; readonly peak: number }[] {
  const spans: { from: Ms; to: Ms; peak: number }[] = [];
  let start = -1;
  let peak = 0;
  for (let i = 0; i <= p.length; i++) {
    const up = i < p.length && p[i] > SURFACING.heard;
    if (up) {
      if (start < 0) start = i;
      peak = Math.max(peak, p[i]);
    } else if (start >= 0) {
      spans.push({ from: start * 10, to: i * 10, peak });
      start = -1;
      peak = 0;
    }
  }
  return spans;
}

/** The presence at a time of the performance, between its 10 ms steps. */
export function presenceAt(p: Float32Array, ms: Ms): number {
  const x = clip(ms / 10, 0, p.length - 1);
  const i = Math.floor(x);
  return p[i] + (x - i) * (p[Math.min(p.length - 1, i + 1)] - p[i]);
}
