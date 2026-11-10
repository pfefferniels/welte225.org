// The inner voice and where it is heard. A pianist humming along sings the whole line inwardly and
// is short of breath: outwardly the voice surfaces only where what it sings crosses a threshold (the
// piece is loud there, growing louder, or a note carries: an accent, a bend of the tempo, a leap, a
// touch, a phrase beginning), swells in from nothing, and sinks back before long.
import { clip, interp } from '../shared/math.ts';
import type { Ms, Seconds, Ticks } from '../shared/units.ts';
import type { Clock } from './clock.ts';
import type { MelodyNote, VoiceNote } from './melody.ts';
import type { DynamicsCurve } from './performance.ts';

/** How intense the inner voice is: what the dynamics and each sung note add to it. */
export const INNER = {
  /** The dynamics, from the piece's quiet (10th percentile of the sung time, 0) to its loud (90th, 1). */
  level: 0.45,
  /** A crescendo under way: `slope` units a second count fully. A decrescendo takes away. */
  rise: 0.35,
  fall: 0.2,
  slope: 6,
  /** A note's own impulse (below), held `holdMs` after its onset, then fading with `fadeMs`. */
  impulse: 0.45,
  holdMs: 200,
  fadeMs: 450,
  /** Any new note. */
  note: 0.25,
  /** A note detached or repeated (the piano's touch, said with a consonant). */
  touch: 0.5,
  /** A leap of a fourth or more, and a phrase beginning after a breath. */
  leap: 0.6,
  phrase: 0.6,
  /** A note this much above the dynamics curve in velocity counts fully: an accent. */
  accent: 2,
  /** A beat this much longer or shorter (log) than the beats of ±4 beats about it counts fully. */
  bend: 0.2,
  /** Beats bent less than this are the reconstruction's ordinary rubato and count for nothing. */
  bendFrom: 0.08,
} as const;

/** How the voice surfaces: softly over the threshold, slowly, and not for long. */
export const SURFACING = {
  /** The voice is wholly there this far above the threshold; in between it is on its way. */
  width: 0.22,
  /** It begins to come this long before what calls for it. */
  leadMs: 200,
  /** It comes and goes through two lags of these time constants: in over 0.8 s, out over 1.1 s. */
  inMs: 240,
  outMs: 320,
  /** Short of breath: sounding, the voice tires within `breathS`, raising the threshold by `tiring`;
   * silent, it recovers within `recoverS`. */
  breathS: 2,
  recoverS: 1.2,
  tiring: 0.7,
  /** From here on the voice counts as heard (some 20 dB under its full level). */
  heard: 0.5,
} as const;

/** What a sung note adds of its own, 0 to 1: its touch, its accent, its place in the line. */
export function noteImpulse(melody: readonly MelodyNote[], dynamics: DynamicsCurve, clock: Clock): number[] {
  const D = (t: Seconds): number => interp(t, dynamics.times, dynamics.values);
  const beat = (d: Ticks): number => (clock.toMs(d + 360) - clock.toMs(d - 360)) / 720;
  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return melody.map((n, k) => {
    const t = n.onsetMs / 1000;
    const context: number[] = [];
    for (let d = n.date - 2880; d <= n.date + 2880; d += 180) context.push(beat(d));
    const bend = Math.abs(Math.log(beat(n.date) / median(context)));
    const prev = k > 0 && !n.breathBefore ? melody[k - 1] : undefined;
    return Math.max(
      INNER.note,
      clip((n.velocity - D(t)) / INNER.accent, 0, 1),
      clip((bend - INNER.bendFrom) / (INNER.bend - INNER.bendFrom), 0, 1),
      prev ? 0 : INNER.phrase,
      prev && (n.onsetMs - prev.keyOffMs > 15 || n.pitch === prev.pitch) ? INNER.touch : 0,
      prev && Math.abs(n.pitch - prev.pitch) >= 5 ? INNER.leap : 0,
    );
  });
}

/**
 * The inner voice's intensity, per 10 ms of the performance (without the rendering's padding), 0
 * where nothing is sung: the dynamics, their motion, and each note's impulse fading while it is held.
 */
export function innerVoice(
  melody: readonly MelodyNote[],
  voice: readonly VoiceNote[],
  impulse: readonly number[],
  dynamics: DynamicsCurve,
  endMs: Ms,
): Float32Array {
  const D = (t: Seconds): number => interp(t, dynamics.times, dynamics.values);
  const n = Math.ceil(endMs / 10) + 1;
  const sung = new Uint8Array(n);
  const own = new Float32Array(n);
  melody.forEach((m, k) => {
    const i0 = Math.max(0, Math.floor(voice[k].on * 100));
    const i1 = Math.min(n, Math.floor(voice[k].off * 100));
    for (let i = i0; i < i1; i++) {
      sung[i] = 1;
      const held = i * 10 - m.onsetMs;
      const w = held <= INNER.holdMs ? 1 : Math.exp(-(held - INNER.holdMs) / INNER.fadeMs);
      own[i] = Math.max(own[i], impulse[k] * w);
    }
  });
  const levels: number[] = [];
  for (let i = 0; i < n; i++) if (sung[i]) levels.push(D(i / 100));
  levels.sort((a, b) => a - b);
  const low = levels[Math.floor(0.1 * levels.length)] ?? 0;
  const high = Math.max(low + 1e-6, levels[Math.floor(0.9 * levels.length)] ?? 1);
  const inner = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!sung[i]) continue;
    const t = i / 100;
    const motion = clip((D(t + 0.25) - D(t - 0.25)) / 0.5 / INNER.slope, -1, 1);
    inner[i] =
      INNER.level * clip((D(t) - low) / (high - low), 0, 1.25) +
      (motion > 0 ? INNER.rise : INNER.fall) * motion +
      INNER.impulse * own[i];
  }
  return inner;
}

/**
 * How much of the voice is heard, 0 (inward, silent) to 1 (the voice as it is), per 10 ms of the
 * performance: the inner voice over `threshold`, softly, coming in and going out slowly, and tiring
 * while it sounds. A threshold of 0 or less lets all of it be heard.
 */
export function presence(inner: Float32Array, threshold: number): Float32Array {
  const p = new Float32Array(inner.length);
  if (threshold <= 0) return p.fill(1);
  const { width, inMs, outMs, breathS, recoverS, tiring, heard } = SURFACING;
  const lead = Math.round(SURFACING.leadMs / 10);
  let tired = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < p.length; i++) {
    const x = clip((inner[Math.min(p.length - 1, i + lead)] - threshold - tiring * tired) / width, 0, 1);
    const gate = x * x * (3 - 2 * x);
    y1 += ((gate - y1) * 10) / (gate > y1 ? inMs : outMs);
    y2 += ((y1 - y2) * 10) / (y1 > y2 ? inMs : outMs);
    p[i] = y2 < 0.02 ? 0 : y2;
    const sounding = y2 > heard;
    tired += (((sounding ? 1 : 0) - tired) * 0.01) / (sounding ? breathS : recoverS);
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
