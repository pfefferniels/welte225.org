// The harmonic reductions: in half notes, evenly; in quarters, the whole harmony on every quarter,
// each strike rolled as the piece rolls its chord where it stands there; and the line the voice
// sings over them.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { performMsmToData } from 'espressivo';
import { chordsOf } from '../src/worker/reductions.ts';
import { loadReduction, loadReductions } from '../tools/node-support.ts';

const QUARTER = 720;
const r = loadReductions();
const halves = chordsOf(r.halves.msm);
const quarters = chordsOf(r.quarters.msm);

describe('the harmonic reductions', () => {
  it('run evenly: the half notes on the half note, the quarters on every quarter they sound', () => {
    for (const c of halves) assert.equal((c.date - QUARTER) % (2 * QUARTER), 0, String(c.date));
    for (const c of quarters) assert.equal(c.date % QUARTER, 0, String(c.date));
    // every chord of the half notes is struck by the quarters, and again until the next
    for (const [i, c] of halves.entries()) {
      const next = halves.at(i + 1)?.date ?? c.date + 2 * QUARTER;
      for (let q = c.date; q < next; q += QUARTER)
        assert.ok(
          quarters.some((x) => x.date === q),
          String(q),
        );
    }
  });

  it('take the MPM’s tempo and dynamics alone', () => {
    for (const { mpm } of [r.halves, r.quarters]) {
      assert.match(mpm, /<tempoMap\b/);
      assert.match(mpm, /<dynamicsMap\b/);
      assert.doesNotMatch(mpm, /<(rubato|articulation|metricalAccentuation|movement)Map\b/);
    }
  });

  it('strike a chord in half notes and first in quarters alike, rolled alike', () => {
    const performed = (s: { msm: string; mpm: string }) =>
      performMsmToData(s, { expandOrnaments: false }).parts.flatMap((p) => p.notes);
    const quartered = new Map(performed(r.quarters).map((n) => [n.id, n.milliseconds.date]));
    const halved = performed(r.halves);
    const same = halved.filter((n) => Math.abs((quartered.get(n.id) ?? NaN) - n.milliseconds.date) < 0.01);
    // all but where a quarter strikes a held note with the chord, which rolls with it
    assert.ok(same.length > 0.9 * halved.length, `${same.length} of ${halved.length}`);
  });

  it('roll a chord struck again on the quarter again, longer where the tempo slows', () => {
    const notes = performMsmToData(r.quarters, { expandOrnaments: false }).parts.flatMap((p) => p.notes);
    const spread = (date: number): number => {
      const ms = notes.filter((n) => n.date === date).map((n) => n.milliseconds.date);
      return Math.max(...ms) - Math.min(...ms);
    };
    const rolled = quarters.filter((c) => c.notes.length > 1 && spread(c.date) > 5).length;
    assert.ok(rolled > 0.85 * quarters.length, `${rolled} of ${quarters.length}`);
    // bar 5: the F major held over the bar, rolled on every quarter, as long as its ticks take there
    const bar5 = [0, 1, 2, 3].map((k) => spread(QUARTER + 4 * 4 * QUARTER + k * QUARTER));
    assert.ok(bar5.every((s) => s > 100));
    assert.ok(new Set(bar5.map((s) => Math.round(s))).size > 1, bar5.join(' '));
  });

  it('give the voice one held note for each chord of the half notes, from the melodic reduction', () => {
    const line = r.line(loadReduction());
    const notes = line.events.filter((e) => e.kind === 'note');
    assert.ok(notes.length > 0.8 * halves.length && notes.length <= halves.length);
    // held from chord to chord, the voice never silent between
    notes.slice(1).forEach((n, i) => {
      assert.equal(n.start, notes[i].end, n.id);
    });
    const sung = new Set(loadReduction().events.flatMap((e) => (e.kind === 'note' ? [e.pitch] : [])));
    for (const n of notes) assert.ok(sung.has(n.pitch), n.id);
  });
});
