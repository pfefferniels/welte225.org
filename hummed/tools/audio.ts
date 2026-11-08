// What `npm run pianoteq` measures in a rendering: where its sound lies against the messages it was
// rendered from (so that it can be moved to play with the voice to the millisecond), and how loud
// it is (so that all levels get one gain that matches the sampled grand).
import type { MidiEvent } from '../src/shared/piano.ts';

/**
 * How strongly a sound starts, per millisecond: the rise in energy of its first difference (its
 * highs, where a hammer's strike stands out from the strings ringing on under the pedal).
 */
export function onsetStrength(samples: Float32Array, rate: number): Float32Array {
  const frames = Math.floor((samples.length / rate) * 1000);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const a = Math.max(1, Math.floor((f * rate) / 1000));
    const b = Math.floor(((f + 1) * rate) / 1000);
    let sum = 0;
    for (let i = a; i < b; i++) {
      const d = samples[i] - samples[i - 1];
      sum += d * d;
    }
    energy[f] = Math.log10(1e-10 + sum / Math.max(1, b - a));
  }
  const strength = new Float32Array(frames);
  // against the most of the 5 ms before, so that a rise spread over a few frames counts once
  for (let f = 1; f < frames; f++) {
    let before = -Infinity;
    for (let k = Math.max(0, f - 5); k < f; k++) before = Math.max(before, energy[k]);
    strength[f] = Math.max(0, energy[f] - before);
  }
  return strength;
}

/** The onsets the messages ask for: each key's press (ms), weighted by its velocity. */
export function expectedOnsets(
  events: readonly MidiEvent[],
): { readonly ms: number; readonly weight: number }[] {
  return events
    .filter((e) => (e.data[0] & 0xf0) === 0x90 && e.data[2] > 0)
    .map((e) => ({ ms: e.at * 1000, weight: e.data[2] / 127 }));
}

/** How well a lag (ms) lines the onsets up with the sound: their weighted strength there. */
function score(
  strength: Float32Array,
  onsets: readonly { ms: number; weight: number }[],
  lag: number,
): number {
  let sum = 0;
  for (const { ms, weight } of onsets) {
    // between frames, and a frame either side at half weight: one peak, not a plateau
    const x = ms + lag;
    const f = Math.floor(x);
    const at = (k: number): number => (k >= 0 && k < strength.length ? strength[k] : 0);
    const s = (k: number): number => 0.5 * at(k - 1) + at(k) + 0.5 * at(k + 1);
    sum += weight * (s(f) + (x - f) * (s(f + 1) - s(f)));
  }
  return sum;
}

export interface Lag {
  /** How late the sound comes against the messages (ms; negative where it comes early). */
  readonly ms: number;
  /** How much better it lines up than the second-best lag at least 20 ms away (a ratio). */
  readonly clarity: number;
}

/**
 * The lag, within ±`range` ms of `around`, at which the sound's onsets line up with the messages':
 * the best whole millisecond, refined between its neighbours, to a tenth.
 */
export function findLag(
  strength: Float32Array,
  onsets: readonly { ms: number; weight: number }[],
  range = 3000,
  around = 0,
): Lag {
  const scores = new Map<number, number>();
  let best = around;
  for (let lag = around - range; lag <= around + range; lag++) {
    const s = score(strength, onsets, lag);
    scores.set(lag, s);
    if (s > (scores.get(best) ?? -1)) best = lag;
  }
  let second = 0;
  for (const [lag, s] of scores) if (Math.abs(lag - best) >= 20) second = Math.max(second, s);
  const [a, b, c] = [best - 0.5, best, best + 0.5].map((lag) => score(strength, onsets, lag));
  const curve = a - 2 * b + c;
  const refined = curve < 0 ? best + (0.25 * (a - c)) / curve : best;
  return { ms: Number(refined.toFixed(1)), clarity: (scores.get(best) ?? 0) / Math.max(1e-9, second) };
}

/** The lag at the beginning and at the end of the piece (its first and last thirds of keys). */
export function lagDrift(
  strength: Float32Array,
  onsets: readonly { ms: number; weight: number }[],
  lag: number,
): number {
  const third = Math.floor(onsets.length / 3);
  const first = findLag(strength, onsets.slice(0, third), 30, lag).ms;
  const last = findLag(strength, onsets.slice(-third), 30, lag).ms;
  return last - first;
}

/**
 * Loudness (dB): the mean power of 400 ms blocks, those 20 dB under the mean left out (pauses and
 * the end's ringing on), as broadcast loudness gates it, without its weighting of frequencies.
 */
export function loudness(samples: Float32Array, rate: number): number {
  const block = Math.round(0.4 * rate);
  const powers: number[] = [];
  for (let a = 0; a + block <= samples.length; a += Math.round(block / 4)) {
    let sum = 0;
    for (let i = a; i < a + block; i++) sum += samples[i] * samples[i];
    const p = sum / block;
    if (p > 1e-7) powers.push(p);
  }
  if (powers.length === 0) return -Infinity;
  const mean = powers.reduce((s, p) => s + p, 0) / powers.length;
  const gated = powers.filter((p) => p > mean / 100);
  return 10 * Math.log10(gated.reduce((s, p) => s + p, 0) / gated.length);
}

export function peak(samples: Float32Array): number {
  let max = 0;
  for (const x of samples) max = Math.max(max, Math.abs(x));
  return max;
}
