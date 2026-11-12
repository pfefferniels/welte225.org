// What the body does, read off its tracks as movements: where it breathes, where its effort grows,
// turns and shrinks, where the pitch moves on, where the lips part. These, not the sound, are what
// is brought together with the roll (gestures.ts).
import type { Seconds } from '../shared/units.ts';
import { FRAME_RATE, timeOf, type Tracks } from './body.ts';

/** A stretch the voice sounds through on one breath. */
export interface Phrase {
  readonly from: Seconds;
  readonly to: Seconds;
}

/** The silence between two phrases, in which the hummer breathes. */
export interface Breath {
  readonly from: Seconds;
  readonly to: Seconds;
  /** How loud the breath is against the voice's loudest moments, dB (a drawn breath is heard). */
  readonly level: number;
}

/** One way the effort goes: up, down, or neither. */
export interface Swell {
  readonly kind: 'grow' | 'shrink' | 'hold';
  readonly from: Seconds;
  readonly to: Seconds;
  /** The effort where it begins and ends, in dB against the take's loudest moments. */
  readonly fromDb: number;
  readonly toDb: number;
  /**
   * Where, between `from` (0) and `to` (1), half of the change is made: early (< 0.5) for a
   * movement that sets off and eases, late for one that gathers.
   */
  readonly halfAt: number;
}

/** A place where the effort turns: a peak it grew to, or a trough it sets off from. */
export interface Turn {
  readonly at: Seconds;
  readonly kind: 'peak' | 'trough';
  readonly db: number;
}

/** A stretch on one pitch. */
export interface VoiceNote {
  readonly from: Seconds;
  readonly to: Seconds;
  /** Semitones above 1 Hz, the stretch's median. */
  readonly semitones: number;
  /** How the voice came to it: from silence, by a slide from the note before, or with a new push. */
  readonly onset: 'breath' | 'slide' | 'pulse';
}

/** A stretch with the lips parted. */
export interface Opening {
  readonly from: Seconds;
  readonly to: Seconds;
  readonly peak: number;
  readonly peakAt: Seconds;
}

export interface Movements {
  readonly phrases: readonly Phrase[];
  readonly breaths: readonly Breath[];
  readonly swells: readonly Swell[];
  readonly turns: readonly Turn[];
  readonly notes: readonly VoiceNote[];
  readonly openings: readonly Opening[];
  /** The effort every frame: lung pressure in dB against its 90th percentile, smoothed; NaN in silence. */
  readonly effort: Float32Array;
}

export interface MovementOptions {
  /** A silence at least this long is a breath; a shorter one a stop within the phrase. */
  readonly breathGap?: Seconds;
  /**
   * A dip of the pressure shorter than this is how a note is begun (a new push, a stop), not a
   * change of effort: the effort runs over it.
   */
  readonly dip?: Seconds;
  /** The effort is smoothed over this long before its turns are looked for. */
  readonly smoothing?: Seconds;
  /** A turn counts if the effort moves at least this far (dB) on both sides of it. */
  readonly prominence?: number;
  /** The pitch has moved on when it is this far (semitones) from the note before. */
  readonly pitchStep?: number;
}

const DEFAULTS: Required<MovementOptions> = {
  breathGap: 0.18,
  dip: 0.3,
  smoothing: 0.6,
  prominence: 2,
  pitchStep: 1.2,
};

/** The curve over its dips: the highest value within `width` frames, then the lowest of those. */
function overDips(values: Float32Array, width: number): Float32Array {
  const half = width >> 1;
  const extreme = (x: Float32Array, pick: (a: number, b: number) => number): Float32Array =>
    x.map((_, i) => {
      let best = x[i];
      for (let k = Math.max(0, i - half); k <= Math.min(x.length - 1, i + half); k++) best = pick(best, x[k]);
      return best;
    });
  return extreme(extreme(values, Math.max), Math.min);
}

/** A running mean over `width` frames within [a, b), applied twice (a triangle). */
function smoothed(values: Float32Array, a: number, b: number, width: number): Float32Array {
  const once = (x: Float32Array): Float32Array =>
    x.map((_, i) => {
      const lo = Math.max(0, i - (width >> 1));
      const hi = Math.min(x.length - 1, i + (width >> 1));
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += x[k];
      return sum / (hi - lo + 1);
    });
  return once(once(values.slice(a, b)));
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted.length > 0 ? sorted[sorted.length >> 1] : 0;
};

/**
 * The turns of a curve: its local extremes that stand out by `prominence` on both sides, peaks
 * and troughs in turn (frames within the curve).
 */
export function turnsOf(curve: Float32Array, prominence: number): { at: number; kind: 'peak' | 'trough' }[] {
  const out: { at: number; kind: 'peak' | 'trough' }[] = [];
  // the highest and lowest point since the last turn, and what lay on the other side of each when
  // it was reached: before the first turn, a point stands out only if the curve came to it that far
  let high = 0;
  let low = 0;
  let belowHigh = curve[0];
  let aboveLow = curve[0];
  let looking: 'peak' | 'trough' | null = null;
  for (let i = 1; i < curve.length; i++) {
    if (looking !== 'trough' && curve[i] > curve[high]) {
      high = i;
      belowHigh = curve[low];
    }
    if (looking !== 'peak' && curve[i] < curve[low]) {
      low = i;
      aboveLow = curve[high];
    }
    if (looking !== 'trough' && curve[high] - curve[i] >= prominence) {
      if (looking === 'peak' || curve[high] - belowHigh >= prominence) out.push({ at: high, kind: 'peak' });
      looking = 'trough';
      low = i;
    } else if (looking !== 'peak' && curve[i] - curve[low] >= prominence) {
      if (looking === 'trough' || aboveLow - curve[low] >= prominence) out.push({ at: low, kind: 'trough' });
      looking = 'peak';
      high = i;
    }
  }
  return out;
}

/** Where between its ends a monotone stretch of the curve has made half of its change, 0 to 1. */
function halfway(curve: Float32Array, a: number, b: number): number {
  const half = (curve[a] + curve[b]) / 2;
  const rising = curve[b] > curve[a];
  for (let i = a; i < b; i++) {
    const here = curve[i];
    const next = curve[i + 1];
    if (rising ? here <= half && next >= half : here >= half && next <= half) {
      const f = next === here ? 0 : (half - here) / (next - here);
      return (i + f - a) / (b - a);
    }
  }
  return 0.5;
}

/**
 * The movements of the tracks. `voiced` marks the frames in which the voice sounds; `level` is
 * the recording's level, for the breaths.
 */
export function movementsOf(
  tracks: Tracks,
  voiced: Uint8Array,
  level: Float32Array,
  options: MovementOptions = {},
): Movements {
  const o = { ...DEFAULTS, ...options };
  const n = tracks.count;
  const gap = Math.round(o.breathGap * FRAME_RATE);

  // phrases: runs of voiced frames, joined over silences shorter than a breath
  const runs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (!voiced[i]) continue;
    let j = i;
    while (j < n && voiced[j]) j++;
    const last = runs.at(-1);
    if (last && i - last[1] < gap) last[1] = j;
    else runs.push([i, j]);
    i = j;
  }
  // a blip of voice shorter than a note is none: a click of the lips, air caught by the folds
  const shortest = Math.round(0.12 * FRAME_RATE);
  for (let k = runs.length - 1; k >= 0; k--) if (runs[k][1] - runs[k][0] < shortest) runs.splice(k, 1);
  const sounding = new Uint8Array(n);
  for (const [a, b] of runs) sounding.fill(1, a, b);
  const phrases = runs.map(([a, b]) => ({ from: timeOf(a), to: timeOf(b) }));

  const loud = [...level].sort((x, y) => x - y)[Math.round(0.98 * Math.max(0, n - 1))] ?? 0;
  const breaths = runs.slice(1).map(([a], k): Breath => {
    const start = runs[k][1];
    const inside = [...level.subarray(start, a)];
    return { from: timeOf(start), to: timeOf(a), level: median(inside) - loud };
  });

  // the effort: lung pressure in dB against the take's loudest moments
  const pushed = [...tracks.pressure].filter((p, i) => voiced[i] && p > 0).sort((x, y) => x - y);
  const reference = pushed[Math.round(0.9 * Math.max(0, pushed.length - 1))] ?? 1;
  const raw = tracks.pressure.map((p) => 20 * Math.log10(Math.max(p, 1) / reference));
  const effort = new Float32Array(n).fill(NaN);
  const width = Math.max(1, Math.round((o.smoothing * FRAME_RATE) / 2));
  const dip = Math.max(1, Math.round(o.dip * FRAME_RATE));
  const swells: Swell[] = [];
  const turns: Turn[] = [];
  for (const [a, b] of runs) {
    // the voice comes and goes over a few frames at a phrase's ends: not part of its effort
    const edge = Math.min(6, (b - a) >> 2);
    const from = a + edge;
    const to = b - edge;
    if (to - from < 3) continue;
    // within the phrase a stop leaves the pressure at nothing: carried across
    const filled = raw.slice();
    for (let i = from + 1; i < to; i++) if (!voiced[i]) filled[i] = filled[i - 1];
    const curve = smoothed(overDips(filled.slice(from, to), dip), 0, to - from, width);
    effort.set(curve, from);
    const inner = turnsOf(curve, o.prominence);
    for (const t of inner) turns.push({ at: timeOf(from + t.at), kind: t.kind, db: curve[t.at] });
    const marks = [0, ...inner.map((t) => t.at), curve.length - 1];
    for (let k = 0; k + 1 < marks.length; k++) {
      const [p, q] = [marks[k], marks[k + 1]];
      if (q <= p) continue;
      const change = curve[q] - curve[p];
      swells.push({
        kind: Math.abs(change) < o.prominence ? 'hold' : change > 0 ? 'grow' : 'shrink',
        from: timeOf(from + p),
        to: timeOf(from + q),
        fromDb: curve[p],
        toDb: curve[q],
        halfAt: halfway(curve, p, q),
      });
    }
  }

  // notes: the pitch moves on when it has left the note's median by a step and stays away
  const notes: VoiceNote[] = [];
  const st = tracks.f0.map((hz) => 12 * Math.log2(Math.max(hz, 1)));
  const settle = Math.round(0.06 * FRAME_RATE);
  for (const [a, b] of runs) {
    let start = a;
    let onset: VoiceNote['onset'] = 'breath';
    const close = (end: number): void => {
      if (end - start < settle) return;
      const pitches: number[] = [];
      for (let i = start; i < end; i++) if (voiced[i]) pitches.push(st[i]);
      if (pitches.length === 0) return;
      notes.push({ from: timeOf(start), to: timeOf(end), semitones: median(pitches), onset });
    };
    let reference: number[] = [];
    for (let i = a; i < b; i++) {
      if (!voiced[i]) {
        // a stop inside the phrase: the next note begins with a new push
        if (i > a && voiced[i - 1]) close(i);
        if (i + 1 < b && voiced[i + 1]) {
          start = i + 1;
          onset = 'pulse';
          reference = [];
        }
        continue;
      }
      reference.push(st[i]);
      const centre = median(reference.slice(0, 40));
      const away = (k: number): boolean => Math.abs(st[k] - centre) >= o.pitchStep;
      if (reference.length > settle && away(i)) {
        let stays = true;
        for (let k = i; k < Math.min(b, i + settle); k++) if (voiced[k] && !away(k)) stays = false;
        if (stays) {
          close(i);
          start = i;
          onset = 'slide';
          reference = [st[i]];
        }
      }
    }
    close(b);
  }

  const openings: Opening[] = [];
  const parted = (i: number): boolean => sounding[i] === 1 && voiced[i] === 1 && tracks.opening[i] >= 0.08;
  for (let i = 0; i < n; i++) {
    if (!parted(i)) continue;
    let j = i;
    let peak = i;
    while (j < n && parted(j)) {
      if (tracks.opening[j] > tracks.opening[peak]) peak = j;
      j++;
    }
    if (j - i >= Math.round(0.15 * FRAME_RATE))
      openings.push({ from: timeOf(i), to: timeOf(j), peak: tracks.opening[peak], peakAt: timeOf(peak) });
    i = j;
  }

  return { phrases, breaths, swells, turns, notes, openings, effort };
}
