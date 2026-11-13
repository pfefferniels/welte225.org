import type { Reduction } from '../reduction/types.ts';
import { clip } from '../shared/math.ts';
import type { Midi, Ms, Seconds, Ticks } from '../shared/units.ts';
import type { Clock } from './clock.ts';
import type { Note, PedalPoint, Turns } from './performance.ts';

/** A sung note, timed and voiced by the piano note it follows. */
export interface MelodyNote {
  /** Its `xml:id` in the reduction. */
  readonly id: string;
  /** The piano note it follows. */
  readonly note: Note;
  readonly pitch: Midi;
  readonly date: Ticks;
  readonly onsetMs: Ms;
  readonly keyOffMs: Ms;
  readonly velocity: Midi;
  readonly ornamented: boolean;
  readonly breathBefore: boolean;
  /** A breath the voice takes in its line, where `findBreaths` finds one, not at a rest. */
  readonly breathTaken: boolean;
}

export class MelodyError extends Error {
  override name = 'MelodyError';
}

/**
 * The least a sung note lasts before the next starts. A chord rolled wide (at the bare end, where
 * its spread is exaggerated twice over against beats gone through twice as fast) can strike the
 * note the voice takes from it hardly after the note before, or even before it; the voice keeps its
 * line in order and takes such a note up this long after the one before.
 */
export const SUNG_AT_LEAST: Ms = 90;

/**
 * The hummed line: each sung note starts with its piano note, unless that comes less than
 * `SUNG_AT_LEAST` after the note before. It ends with the piano's own release where it is the
 * whole written note; otherwise (a pedal note, or one cut for a breath or by the next choice) where
 * it is written, performed. A breath comes before the first note, after a rest and after air;
 * `findBreaths` finds the others.
 */
export function melodyOf(reduction: Reduction, notes: readonly Note[], clock: Clock): MelodyNote[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const melody: MelodyNote[] = [];
  let last = -Infinity;
  reduction.events.forEach((e, i) => {
    if (e.kind !== 'note') return;
    const struck = byId.get(e.ref);
    if (!struck)
      throw new MelodyError(`the reduction's ${e.id} follows ${e.ref}, which the performance lacks`);
    const prev = i > 0 ? reduction.events[i - 1] : undefined;
    const onset = Math.max(struck.onMs, last + SUNG_AT_LEAST);
    last = onset;
    // the voice's own copy of the note, where it takes it up later than it is struck
    const note = onset === struck.onMs ? struck : { ...struck, onMs: onset };
    const whole = !e.pedal && Math.abs(note.date + note.duration - e.end) < 1;
    const off = Math.max(onset + 40, whole ? note.endMs : clock.toMs(e.end));
    melody.push({
      id: e.id,
      note,
      pitch: e.pitch,
      date: note.date,
      onsetMs: onset,
      keyOffMs: off,
      velocity: note.velocity,
      ornamented: note.ornamented,
      breathBefore: !prev || prev.kind === 'rest' || prev.kind === 'air',
      breathTaken: false,
    });
  });
  return melody;
}

/** What makes a moment of the line a place to breathe. */
export interface BreathCues {
  readonly sustain: readonly PedalPoint[];
  /** Where the MPM turns back up (`turningPoints`). */
  readonly turns: Turns;
  /** How far the voice is inward anyway at a moment of the performance, 0 (heard) to 1. */
  readonly quiet: (ms: Ms) => number;
}

/**
 * How a pianist humming along breathes in the line, as an amateur does: no sooner than `everyS`
 * after the last breath and, where it can, no later than `withinS`. A breath costs `cost`, and up
 * to `soon` more the sooner it comes after the last (nothing more at `withinS`). What speaks for
 * one weighs against that: the dynamics or the tempo turning back up within `turnTicks` before the
 * note, the voice inward anyway, the performance leaving room (a gap of `gapMs` before the key, or
 * the pedal lifted at the end of a note held `heldS` or more).
 */
export const BREATHING = {
  everyS: 2.5,
  withinS: 8,
  cost: 0.5,
  soon: 0.8,
  /** What each second of a stretch beyond `withinS` costs. */
  overrun: 10,
  turnTicks: 720,
  gapMs: 140,
  heldS: 1,
  weights: { dynamics: 0.6, tempo: 0.4, quiet: 0.6, room: 0.4 },
} as const;

/** How much speaks for a breath before note `k`, in `BREATHING.weights`. */
export function breathReasons(melody: readonly MelodyNote[], k: number, cues: BreathCues): number {
  const { weights, turnTicks, gapMs, heldS } = BREATHING;
  const prev = melody[k - 1];
  const n = melody[k];
  const turned = (dates: readonly Ticks[]): boolean =>
    dates.some((d) => d > prev.date && d <= n.date && n.date - d <= turnTicks);
  const lifted = cues.sustain.some((p) => p.ms >= n.onsetMs - 250 && p.ms <= n.onsetMs + 150 && p.value < 64);
  const room =
    n.onsetMs - prev.keyOffMs >= gapMs || ((prev.keyOffMs - prev.onsetMs) / 1000 >= heldS && lifted);
  return (
    (turned(cues.turns.dynamics) ? weights.dynamics : 0) +
    (turned(cues.turns.tempo) ? weights.tempo : 0) +
    weights.quiet * cues.quiet(n.onsetMs - 100) +
    (room ? weights.room : 0)
  );
}

/**
 * The breaths in the line, beyond those it has (before the first note, after rests and air): the
 * choice that gains most, by dynamic programming over where the last breath before each note was.
 */
export function findBreaths(melody: readonly MelodyNote[], cues: BreathCues): MelodyNote[] {
  if (melody.length === 0) return [];
  const { everyS, withinS, cost, soon, overrun } = BREATHING;
  const at = melody.map((m) => m.onsetMs / 1000);
  const end = Math.max(...melody.map((m) => m.keyOffMs)) / 1000;
  const given = melody.map((m, k) => k === 0 || m.breathBefore);
  const reasons = melody.map((_, k) => (given[k] ? 0 : breathReasons(melody, k, cues)));
  const beyond = (s: Seconds): number => Math.max(0, s - withinS) * overrun;
  const price = (s: Seconds): number => cost + soon * clip((withinS - s) / (withinS - everyS), 0, 1);
  const best = melody.map(() => -Infinity);
  const from = melody.map(() => -1);
  best[0] = 0;
  let lastGiven = 0;
  for (let k = 1; k < melody.length; k++) {
    for (let j = lastGiven; j < k; j++) {
      const sung = at[k] - at[j];
      if (!(given[j] && given[k]) && sung < everyS) continue;
      const value = best[j] + (given[k] ? 0 : reasons[k] - price(sung)) - beyond(sung);
      if (value > best[k]) {
        best[k] = value;
        from[k] = j;
      }
    }
    if (given[k]) lastGiven = k;
  }
  const candidates = best.map((b, j) => (j >= lastGiven ? b - beyond(end - at[j]) : -Infinity));
  const breaths = new Set<number>();
  for (let k = candidates.indexOf(Math.max(...candidates)); k >= 0; k = from[k]) breaths.add(k);
  return melody.map((m, k) =>
    breaths.has(k) && !given[k] ? { ...m, breathBefore: true, breathTaken: true } : m,
  );
}

/** A sung note as the voice holds it, in seconds. */
export interface VoiceNote {
  readonly pitch: Midi;
  readonly on: Seconds;
  off: Seconds;
  readonly keyOff: Seconds;
  readonly breathBefore: boolean;
}

/**
 * Legato from note to note, except before a breath: after a rest the note before ends 120 ms early
 * at least, and before a breath in the line a quarter of its length early, 0.15 to 0.35 s; never
 * in less than half of the time it has before the next.
 */
export function voiceNotes(melody: readonly MelodyNote[]): VoiceNote[] {
  const voice = melody.map((n, k): VoiceNote => ({
    pitch: n.pitch,
    on: n.onsetMs / 1000,
    off: n.keyOffMs / 1000,
    keyOff: n.keyOffMs / 1000,
    breathBefore: k === 0 || n.breathBefore,
  }));
  for (let k = 1; k < voice.length; k++) {
    const prev = voice[k - 1];
    const n = voice[k];
    const room = Math.min(
      0.5 * (n.on - prev.on),
      melody[k].breathTaken ? Math.min(0.35, Math.max(0.15, 0.25 * (prev.off - prev.on))) : 0.12,
    );
    prev.off = n.breathBefore ? Math.min(prev.off, prev.keyOff, n.on - room) : n.on;
  }
  return voice;
}
