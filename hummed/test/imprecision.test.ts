// Flightiness strikes the notes less exactly: the same way every time, a chord together, legato
// legato, the harmonies with the piece and the voice with the piano, and not at all at the top.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { performMsmToData, type PerformanceData } from 'espressivo';
import { readPerformance, repaired } from '../src/hummer/performance.ts';
import { imprecise } from '../src/worker/imprecision.ts';
import { IMPRECISION, shapeAt } from '../src/worker/levels.ts';
import { performPiano, pianoMpm } from '../src/worker/piano.ts';
import { loadPianoScore } from '../tools/node-support.ts';

const score = loadPianoScore();
const performed = (e: number): PerformanceData =>
  performMsmToData({ msm: score.msm, mpm: pianoMpm(score.mpm, shapeAt(e)) });
const notes = (data: PerformanceData) => data.parts.flatMap((p) => p.notes);

describe('imprecision', () => {
  // the bare end, exaggerated so far that espressivo leaves strays, put right before the shift
  const raw = performed(0);
  const plain = repaired(raw);
  const struck = imprecise(raw, shapeAt(0));
  const pairs = notes(plain).map((n, i) => [n, notes(struck)[i]] as const);
  const shift = (i: number): number => pairs[i][1].milliseconds.date - pairs[i][0].milliseconds.date;

  it('leaves the performance as it is at the top', () => {
    const top = performed(1);
    assert.equal(imprecise(top, shapeAt(1)), top);
  });

  it('is the same every time', () => {
    assert.deepEqual(imprecise(raw, shapeAt(0)), struck);
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
    assert.ok(strays.length > 0, 'the bare end no longer leaves a stray to put right');
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

  it('strikes the harmonies where the piece is struck at the dates they share', () => {
    const { piece, harmonies } = performPiano(score, shapeAt(0));
    const onsets = new Set(piece.keys.map((k) => k.on.toFixed(6)));
    const shared = harmonies.keys.filter((k) => onsets.has(k.on.toFixed(6)));
    // most chords of the harmonies fall on an onset of the piece, struck off by the same amount
    assert.ok(shared.length > harmonies.keys.length / 2, `${shared.length} of ${harmonies.keys.length}`);
  });
});
