import { interp } from '../shared/math.ts';
import type { Ms, Ticks } from '../shared/units.ts';
import type { Note, PedalPoint } from './performance.ts';

const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/**
 * Score time to performed time and back, through every unornamented onset and pedal change,
 * and through the end of the last chord, so that a note or air there keeps its length.
 */
export class Clock {
  /** Score positions, increasing. */
  readonly ticks: readonly Ticks[];
  /** Their performed times, increasing. */
  readonly ms: readonly Ms[];

  constructor(notes: readonly Note[], sustain: readonly PedalPoint[]) {
    const seen = new Set<string>();
    const points: [Ticks, Ms][] = [];
    const add = (tick: Ticks, ms: Ms): void => {
      const key = `${round4(tick)}:${round4(ms)}`;
      if (seen.has(key)) return;
      seen.add(key);
      points.push([round4(tick), round4(ms)]);
    };
    for (const n of notes) if (!n.ornamented) add(n.date, n.onMs);
    for (const p of sustain) add(p.date, p.ms);

    let last = -Infinity;
    let lastMs = 0;
    for (const n of notes) {
      const end = round4(n.date + n.duration);
      if (end > last) {
        last = end;
        lastMs = 0;
      }
      if (end === last) lastMs = Math.max(lastMs, n.endMs);
    }
    if (Number.isFinite(last)) points.push([last, round4(lastMs)]);

    // only points that go on from the last one kept, in both: struck inexactly (imprecision.ts),
    // a note can come after a pedal change at a later tick, which is not moved
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const ticks: Ticks[] = [];
    const ms: Ms[] = [];
    for (const [tick, t] of points) {
      const last = ticks.length - 1;
      if (last < 0 || (tick > ticks[last] && t > ms[last])) {
        ticks.push(tick);
        ms.push(t);
      }
    }
    this.ticks = ticks;
    this.ms = ms;
  }

  toMs(tick: Ticks): Ms {
    return interp(tick, this.ticks, this.ms);
  }

  toTicks(ms: Ms): Ticks {
    return interp(ms, this.ms, this.ticks);
  }
}
