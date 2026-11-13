// Flightiness strikes the notes less exactly: the same way every time, a chord together, legato
// legato, the voice with the piano, and not at all at the top.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { performMsmToData, type PerformanceData } from 'espressivo';
import { readPerformance, repaired } from '../src/hummer/performance.ts';
import { imprecise } from '../src/worker/imprecision.ts';
import { IMPRECISION, shapeAt, type Shape } from '../src/worker/levels.ts';
import { performPiano, pianoMpm } from '../src/worker/piano.ts';
import { loadPianoScore } from '../tools/node-support.ts';

const score = loadPianoScore();
/** As flighty and as exaggerated as anything gets: twice as fast, ×2, 100 ms off. */
const RAW: Shape = { flightiness: 1, exaggeration: 1, voiceExaggeration: 1, approximateness: 1 };
const performed = (shape: Shape): PerformanceData =>
  performMsmToData({ msm: score.msm, mpm: pianoMpm(score.mpm, shape) });
const notes = (data: PerformanceData) => data.parts.flatMap((p) => p.notes);

describe('imprecision', () => {
  // exaggerated so far that espressivo leaves strays, put right before the shift
  const raw = performed(RAW);
  const plain = repaired(raw);
  const struck = imprecise(raw, RAW);
  const pairs = notes(plain).map((n, i) => [n, notes(struck)[i]] as const);
  const shift = (i: number): number => pairs[i][1].milliseconds.date - pairs[i][0].milliseconds.date;

  it('leaves the performance as it is at the top', () => {
    const top = performed(shapeAt(1));
    assert.equal(imprecise(top, shapeAt(1)), top);
  });

  it('is the same every time', () => {
    assert.deepEqual(imprecise(raw, RAW), struck);
  });

  it('moves a date by about as much as it should, the same wherever it is struck or let go', () => {
    const byDate = new Map<number, number>();
    pairs.forEach(([before], i) => {
      const seen = byDate.get(before.date);
      if (seen === undefined) byDate.set(before.date, shift(i));
      else assert.ok(Math.abs(seen - shift(i)) < 1e-9);
    });
    const shifts = [...byDate.values()];
    const sd = Math.sqrt(shifts.reduce((sum, s) => sum + s * s, 0) / shifts.length);
    assert.ok(sd > 0.6 * IMPRECISION.timingMs && sd < 1.4 * IMPRECISION.timingMs, `${sd} ms`);
    // a key let go where another is struck moves with it, unless that would leave it less than half its length
    let checked = 0;
    for (const [before, after] of pairs) {
      const release = byDate.get(before.date + before.duration);
      if (release === undefined || before.milliseconds.date === 0) continue;
      const kept = after.milliseconds.date + 0.5 * (before.milliseconds.end - before.milliseconds.date);
      const end = after.milliseconds.end;
      assert.ok(Math.abs(end - (before.milliseconds.end + release)) < 1e-9 || Math.abs(end - kept) < 1e-9);
      checked++;
    }
    assert.ok(checked > pairs.length / 2, `${checked} of ${pairs.length}`);
  });

  it('keeps two notes legato legato', () => {
    const { notes: before } = readPerformance(plain);
    const { notes: after } = readPerformance(struck);
    const at = new Map(before.map((n, i) => [n.date, i]));
    let kept = 0;
    let legato = 0;
    before.forEach((n, i) => {
      const j = at.get(n.date + n.duration);
      if (j === undefined || n.endMs < before[j].onMs) return;
      legato++;
      if (after[i].endMs >= after[j].onMs) kept++;
    });
    assert.ok(legato > 100 && kept / legato > 0.95, `${kept} of ${legato}`);
  });

  it('puts espressivo’s strays right before it moves them', () => {
    // an onset at its tick, seconds off its chord; moved, repair() would no longer know it
    const before = readPerformance(raw).notes;
    const after = readPerformance(struck).notes;
    const strays = before.flatMap((n, i) => (n.date > 0 && Math.abs(n.onMs - n.date) < 1e-6 ? [i] : []));
    assert.ok(strays.length > 0, 'the MPM ×2 no longer leaves a stray to put right');
    for (const i of strays) {
      const others = after.filter((n, j) => j !== i && n.date === after[i].date).map((n) => n.onMs);
      assert.ok(
        after[i].onMs > Math.min(...others) - 1000 && after[i].onMs < Math.max(...others),
        after[i].id,
      );
    }
  });

  it('makes notes louder and softer, by about as much as it should', () => {
    // where the clamp at 1 does not reach: exaggerated twice, a few notes come out softer than nothing
    const ratios = pairs
      .filter(([before]) => before.velocity >= 5)
      .map(([before, after]) => after.velocity / before.velocity - 1);
    const sd = Math.sqrt(ratios.reduce((sum, r) => sum + r * r, 0) / ratios.length);
    assert.ok(sd > 0.6 * IMPRECISION.dynamics && sd < 1.4 * IMPRECISION.dynamics, String(sd));
  });

  it('strikes the harmonies in half notes and in quarters alike where they share a chord', () => {
    const halves = performPiano(loadPianoScore(0), shapeAt(0.2)).harmonies;
    const quarters = performPiano(loadPianoScore(0.3), shapeAt(0.2)).harmonies;
    const onsets = new Set(quarters.keys.map((k) => `${k.pitch}@${k.on.toFixed(6)}`));
    // a chord is struck where the quarters strike it first, but where they strike a held note with
    // it, which rolls with the rest
    const shared = halves.keys.filter((k) => onsets.has(`${k.pitch}@${k.on.toFixed(6)}`));
    assert.ok(shared.length > 0.9 * halves.keys.length, `${shared.length} of ${halves.keys.length}`);
  });
});
