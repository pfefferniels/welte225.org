import type { Note, PedalPoint } from '../hummer/performance.ts';
import type { PianoNote } from '../shared/protocol.ts';
import { PAD_MS, type Seconds } from '../shared/units.ts';

/** Every note of the roll, held by the sustain pedal as on the roll, at least 0.3 s long. */
export function pianoNotes(notes: readonly Note[], sustain: readonly PedalPoint[]): PianoNote[] {
  const pedal: [Seconds, number][] = sustain.map((p) => [p.ms / 1000, p.value]);
  const lastEnd = Math.max(...notes.map((n) => n.endMs)) / 1000;
  return notes
    .map((n): PianoNote => {
      const on = n.onMs / 1000;
      let off = Math.max(n.endMs / 1000, on + 0.3);
      let i = -1;
      while (i + 1 < pedal.length && pedal[i + 1][0] <= off) i++;
      if (i >= 0 && pedal[i][1] >= 64) {
        let j = i;
        while (j < pedal.length && pedal[j][1] >= 64) j++;
        off = j < pedal.length ? pedal[j][0] : lastEnd + 0.6;
      }
      return { on: on + PAD_MS / 1000, duration: off - on, pitch: n.pitch, velocity: n.velocity };
    })
    .sort((a, b) => a.on - b.on);
}
