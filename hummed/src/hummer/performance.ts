import type { PerformanceData } from 'espressivo';
import { groupBy } from '../shared/math.ts';
import type { Midi, Ms, Seconds, Ticks } from '../shared/units.ts';

/** A performed note, as espressivo renders it; the hummer's own copy, which `repair` may correct. */
export interface Note {
  readonly id: string;
  readonly pitch: Midi;
  readonly date: Ticks;
  readonly duration: Ticks;
  readonly velocity: Midi;
  readonly ornamented: boolean;
  onMs: Ms;
  endMs: Ms;
}

export interface PedalPoint {
  readonly date: Ticks;
  readonly ms: Ms;
  readonly value: Midi;
}

/** The dynamics as a curve over performed time, from the MPM's sub-note dynamics. */
export interface DynamicsCurve {
  readonly times: readonly Seconds[];
  readonly values: readonly number[];
}

export interface Performance {
  readonly notes: readonly Note[];
  readonly sustain: readonly PedalPoint[];
  /** The soft pedal (una corda); empty where the performance has none. */
  readonly soft: readonly PedalPoint[];
}

export class PerformanceError extends Error {
  override name = 'PerformanceError';
}

/** The notes (every part) and the pedals of a performance. */
export function readPerformance(data: PerformanceData): Performance {
  const notes = data.parts.flatMap((part) =>
    part.notes.map((n): Note => ({
      id: n.id ?? '',
      pitch: n.pitch,
      date: n.date,
      duration: n.duration,
      velocity: n.velocity,
      ornamented: n.ornamented,
      onMs: n.milliseconds.date,
      endMs: n.milliseconds.end,
    })),
  );
  const pedal = (name: string): readonly PedalPoint[] | null =>
    data.parts[0]?.controlChanges
      .find((c) => c.controller === name)
      ?.points.map((p) => ({ date: p.date, ms: p.milliseconds, value: p.value })) ?? null;
  const sustain = pedal('sustain');
  if (!sustain) throw new PerformanceError('the performance has no sustain pedal');
  return { notes, sustain, soft: pedal('soft') ?? [] };
}

/**
 * The channel-volume curve of a performance rendered with sub-note dynamics, in seconds. Points
 * at the default volume (100) are dropped but the first, and of points at the same time the last.
 */
export function readDynamics(data: PerformanceData): DynamicsCurve {
  const volume = data.parts[0]?.controlChanges.find((c) => c.kind === 'channelVolume');
  if (!volume) throw new PerformanceError('the performance has no sub-note dynamics');
  const kept = volume.points
    .map((p): [Seconds, number] => [p.milliseconds / 1000, p.value])
    .filter(([t, v]) => v !== 100 || t === 0);
  const points = kept.filter(([t], i) => i === kept.length - 1 || t !== kept[i + 1][0]);
  return { times: points.map(([t]) => t), values: points.map(([, v]) => v) };
}

/** The middle of an MPM's dynamics: its 10th and 90th percentile (volume and transition.to). */
export interface DynamicsRange {
  readonly low: number;
  readonly high: number;
}

export function dynamicsRange(mpm: string): DynamicsRange {
  const values = [...mpm.matchAll(/<dynamics\b[^>]*>/g)]
    .flatMap((m) => [...m[0].matchAll(/\b(?:volume|transition\.to)="(-?[\d.]+)"/g)].map((v) => Number(v[1])))
    .sort((a, b) => a - b);
  if (values.length === 0) throw new PerformanceError('the MPM has no dynamics');
  const at = (q: number): number => values[Math.round(q * (values.length - 1))];
  return { low: at(0.1), high: at(0.9) };
}

/** Where the MPM's dynamics and its tempo turn back up after falling (score dates). */
export interface Turns {
  readonly dynamics: readonly Ticks[];
  readonly tempo: readonly Ticks[];
}

/** One instruction of a map: from its value to `transition.to` (or staying where it is). */
interface Step {
  readonly date: Ticks;
  readonly from: number;
  readonly to: number;
}

function steps(mpm: string, tag: string, value: string): Step[] {
  const number = (element: string, name: string): number | undefined => {
    const match = new RegExp(`\\b${name}="(-?[\\d.]+)"`).exec(element);
    return match ? Number(match[1]) : undefined;
  };
  return [...mpm.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].flatMap(([element]) => {
    const date = number(element, 'date');
    const from = number(element, value);
    if (date === undefined || from === undefined) return [];
    return [{ date, from, to: number(element, 'transition\\.to') ?? from }];
  });
}

/** The instructions that rise, or start higher, after one that fell: a map's valleys. */
const valleys = (map: readonly Step[]): Ticks[] =>
  map.slice(1).flatMap((step, i) => {
    const before = map[i];
    const fell = before.to < before.from;
    return fell && (step.from > before.to || step.to > step.from) ? [step.date] : [];
  });

/**
 * Where the MPM turns back up: where a diminuendo or a ritardando gives way to a phrase that grows
 * or moves on again. Exaggerating the MPM moves no instruction, so the reconstruction's own will do.
 */
export const turningPoints = (mpm: string): Turns => ({
  dynamics: valleys(steps(mpm, 'dynamics', 'volume')),
  tempo: valleys(steps(mpm, 'tempo', 'bpm')),
});

/** How long a note ends up when espressivo lets it end before it starts. */
const FALLBACK_LENGTH: Ms = 1793;

/**
 * espressivo 0.11, strongly exaggerated (from about ×1.8), leaves a few arpeggiated notes with
 * impossible times: an onset equal to the note's tick position, or tens of seconds past the end,
 * or an end before the onset. Such a note is put back at the head of its chord and given a length.
 * Returns how many notes were corrected.
 */
export function repair(notes: readonly Note[]): number {
  let fixed = 0;
  for (const chord of groupBy(notes, (n) => n.date).values()) {
    const onsets = chord.map((n) => n.onMs).sort((a, b) => a - b);
    const median = onsets[onsets.length >> 1];
    const stray = (n: Note): boolean => {
      const off = Math.abs(n.onMs - median);
      return off > 10000 || (off > 1000 && Math.abs(n.onMs - n.date) < 1e-6);
    };
    const sane = chord
      .filter((n) => !stray(n))
      .map((n) => n.onMs)
      .sort((a, b) => a - b);
    if (sane.length === chord.length || sane.length === 0) continue;
    const gap = sane.length > 1 ? Math.max(20, sane[1] - sane[0]) : 50;
    for (const n of chord.filter(stray)) {
      n.onMs = Math.max(0, sane[0] - gap);
      fixed++;
    }
  }
  for (const n of notes) {
    if (n.endMs <= n.onMs) {
      n.endMs = n.onMs + FALLBACK_LENGTH;
      fixed++;
    }
  }
  return fixed;
}
