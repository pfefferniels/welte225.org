// Flightiness strikes the notes less exactly: the same way every time, a chord together, the
// harmonies with the piece and the voice with the piano, and not at all at the top.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { performMsmToData, type PerformanceData } from 'espressivo';
import { imprecise } from '../src/worker/imprecision.ts';
import { IMPRECISION } from '../src/worker/levels.ts';
import { performPiano, pianoMpm } from '../src/worker/piano.ts';
import { loadPianoScore } from '../tools/node-support.ts';

const score = loadPianoScore();
const performed = (e: number): PerformanceData =>
  performMsmToData({ msm: score.msm, mpm: pianoMpm(score.mpm, e) });
const notes = (data: PerformanceData) => data.parts.flatMap((p) => p.notes);

describe('imprecision', () => {
  const plain = performed(0);
  const struck = imprecise(plain, 0);
  const pairs = notes(plain).map((n, i) => [n, notes(struck)[i]] as const);
  const shift = (i: number): number => pairs[i][1].milliseconds.date - pairs[i][0].milliseconds.date;

  it('leaves the performance as it is at the top', () => {
    const top = performed(1);
    assert.equal(imprecise(top, 1), top);
  });

  it('is the same every time', () => {
    assert.deepEqual(imprecise(plain, 0), struck);
  });

  it('moves a note whole, by about as much as it should, and keeps a chord together', () => {
    const byDate = new Map<number, number>();
    pairs.forEach(([before, after], i) => {
      assert.ok(
        Math.abs(
          after.milliseconds.end -
            before.milliseconds.end -
            (after.milliseconds.date - before.milliseconds.date),
        ) < 1e-9,
      );
      const seen = byDate.get(before.date);
      if (seen === undefined) byDate.set(before.date, shift(i));
      else assert.ok(Math.abs(seen - shift(i)) < 1e-9);
    });
    const shifts = [...byDate.values()];
    const sd = Math.sqrt(shifts.reduce((sum, s) => sum + s * s, 0) / shifts.length);
    assert.ok(sd > 0.6 * IMPRECISION.timingMs && sd < 1.4 * IMPRECISION.timingMs, `${sd} ms`);
  });

  it('makes notes louder and softer, by about as much as it should', () => {
    const ratios = pairs.map(([before, after]) => after.velocity / before.velocity - 1);
    const sd = Math.sqrt(ratios.reduce((sum, r) => sum + r * r, 0) / ratios.length);
    assert.ok(sd > 0.6 * IMPRECISION.dynamics && sd < 1.4 * IMPRECISION.dynamics, String(sd));
  });

  it('strikes the harmonies where the piece is struck at the dates they share', () => {
    const { piece, harmonies } = performPiano(score, 0);
    const onsets = new Set(piece.keys.map((k) => k.on.toFixed(6)));
    const shared = harmonies.keys.filter((k) => onsets.has(k.on.toFixed(6)));
    // most chords of the harmonies fall on an onset of the piece, struck off by the same amount
    assert.ok(shared.length > harmonies.keys.length / 2, `${shared.length} of ${harmonies.keys.length}`);
  });
});
