import type { Reduction } from '../reduction/types.ts';
import type { Midi, Ms, Seconds, Ticks } from '../shared/units.ts';
import type { Clock } from './clock.ts';
import type { Note } from './performance.ts';

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
}

export class MelodyError extends Error {
  override name = 'MelodyError';
}

/**
 * The hummed line: each sung note starts with its piano note. It ends with the piano's own
 * release where it is the whole written note; otherwise (a pedal note, or one cut for a breath
 * or by the next choice) where it is written, performed. A breath comes before the first note,
 * after a breath rest and after air.
 */
export function melodyOf(reduction: Reduction, notes: readonly Note[], clock: Clock): MelodyNote[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const melody: MelodyNote[] = [];
  reduction.events.forEach((e, i) => {
    if (e.kind !== 'note') return;
    const note = byId.get(e.ref);
    if (!note) throw new MelodyError(`the reduction's ${e.id} follows ${e.ref}, which the performance lacks`);
    const prev = i > 0 ? reduction.events[i - 1] : undefined;
    const whole = !e.pedal && Math.abs(note.date + note.duration - e.end) < 1;
    const off = Math.max(note.onMs + 40, whole ? note.endMs : clock.toMs(e.end));
    melody.push({
      id: e.id,
      note,
      pitch: e.pitch,
      date: note.date,
      onsetMs: note.onMs,
      keyOffMs: off,
      velocity: note.velocity,
      ornamented: note.ornamented,
      breathBefore: !prev || (prev.kind === 'rest' && prev.breath) || prev.kind === 'air',
    });
  });
  return melody;
}

/** A sung note as the voice holds it, in seconds. */
export interface VoiceNote {
  readonly pitch: Midi;
  readonly on: Seconds;
  off: Seconds;
  readonly keyOff: Seconds;
  readonly breathBefore: boolean;
}

/** Legato from note to note, except before a breath: there the note before ends 120 ms early. */
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
    prev.off = n.breathBefore ? Math.min(prev.off, prev.keyOff, n.on - 0.12) : n.on;
  }
  return voice;
}
