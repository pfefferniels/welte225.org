// Flightiness (levels.ts) strikes the notes less exactly, too: each date of the score a little early
// or late, each note a little louder or softer, the more the barer the music. espressivo performs the
// MPM's own imprecision maps, but not reproducibly where notes share a date (its PARITY.md, §4), and
// the piano, its harmonies and the voice have to be off by the same amounts, in every worker and at
// every render, or the voice would leave the piano. So it is done here, to the performance, from the
// score: a date is off by the same wherever a key is struck or let go there (a chord stays together,
// the harmonies with the piece, and two notes legato stay legato), a note by the same in every part
// that plays it.
import type { Midi7Bit, Milliseconds, PerformanceData } from 'espressivo';
import { repaired } from '../hummer/performance.ts';
import { seededRandom } from '../shared/math.ts';
import { IMPRECISION, type Shape } from './levels.ts';

/** A standard normal number for a key: the same every time. */
const normal = (...key: number[]): number =>
  seededRandom(key.reduce((h, k) => Math.imul(h ^ k, 0x9e3779b1) >>> 0, 0x2545f491)).normal(0, 1);

/** Where the key keeps timing apart from loudness. */
const TIMING = 1;
const LOUDNESS = 2;
/** The least of its length a note keeps when its key is let go early and struck late. */
const LEAST_LENGTH = 0.5;

/** The performance struck as inexactly as it is flighty; as it is where it is not. */
export function imprecise(data: PerformanceData, shape: Pick<Shape, 'flightiness'>): PerformanceData {
  const f = shape.flightiness;
  if (f === 0) return data;
  const timing = IMPRECISION.timingMs * f;
  const dynamics = IMPRECISION.dynamics * f;
  // espressivo's strays first: moved off its tick, such an onset is no longer known for one
  const exact = repaired(data);
  return {
    ...exact,
    parts: exact.parts.map((part) => ({
      ...part,
      notes: part.notes.map((n) => {
        const on = n.milliseconds.date;
        const end = n.milliseconds.end;
        const shift = Math.max(0 - on, timing * normal(TIMING, n.date));
        // let go as inexactly as the date it is let go at, where the next note may be struck
        const release = timing * normal(TIMING, n.date + n.duration);
        const velocity = n.velocity * (1 + dynamics * normal(LOUDNESS, n.date, n.pitch));
        return {
          ...n,
          // espressivo's units are branded numbers it gives no constructors for
          velocity: Math.min(127, Math.max(1, velocity)) as Midi7Bit,
          milliseconds: {
            date: (on + shift) as Milliseconds,
            end: Math.max(end + release, on + shift + LEAST_LENGTH * (end - on)) as Milliseconds,
          },
        };
      }),
    })),
  };
}
