// Flightiness (levels.ts) strikes the notes less exactly, too: each date of the score a little early
// or late, each note a little louder or softer, the more the barer the music. espressivo performs the
// MPM's own imprecision maps, but not reproducibly where notes share a date (its PARITY.md, §4), and
// the piano, its harmonies and the voice have to be off by the same amounts, in every worker and at
// every render, or the voice would leave the piano. So it is done here, to the performance, from the
// score: a date is off by the same wherever it is struck (a chord stays together, and the harmonies
// with the piece), a note by the same in every part that plays it.
import type { Midi7Bit, Milliseconds, PerformanceData } from 'espressivo';
import { seededRandom } from '../shared/math.ts';
import { flightiness, IMPRECISION } from './levels.ts';

/** A standard normal number for a key: the same every time. */
const normal = (...key: number[]): number =>
  seededRandom(key.reduce((h, k) => Math.imul(h ^ k, 0x9e3779b1) >>> 0, 0x2545f491)).normal(0, 1);

/** Where the key keeps timing apart from loudness. */
const TIMING = 1;
const LOUDNESS = 2;

/** The performance at an elaboration, struck as inexactly as it is flighty; as it is at 1. */
export function imprecise(data: PerformanceData, elaboration: number): PerformanceData {
  const f = flightiness(elaboration);
  if (f === 0) return data;
  const timing = IMPRECISION.timingMs * f;
  const dynamics = IMPRECISION.dynamics * f;
  return {
    ...data,
    parts: data.parts.map((part) => ({
      ...part,
      notes: part.notes.map((n) => {
        const shift = Math.max(0 - n.milliseconds.date, timing * normal(TIMING, n.date));
        const velocity = n.velocity * (1 + dynamics * normal(LOUDNESS, n.date, n.pitch));
        return {
          ...n,
          // espressivo's units are branded numbers it gives no constructors for
          velocity: Math.min(127, Math.max(1, velocity)) as Midi7Bit,
          milliseconds: {
            date: (n.milliseconds.date + shift) as Milliseconds,
            end: (n.milliseconds.end + shift) as Milliseconds,
          },
        };
      }),
    })),
  };
}
