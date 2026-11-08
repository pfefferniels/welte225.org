// The harmonies (reduction/harmonies.mei): converted to a score with their grace notes put back, and
// performed with the MPM as the piece is.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { performMsmToData } from 'espressivo';
import { readPerformance, type Note } from '../src/hummer/performance.ts';
import { readGraces, type XmlElement } from '../src/reduction/mei.ts';
import { harmoniesScore } from '../src/worker/harmonies.ts';
import { loadScore, ROOT } from '../tools/node-support.ts';

describe('the harmonies', () => {
  const mei = readFileSync(join(ROOT, 'reduction/harmonies.mei'), 'utf8');
  const { msm, mpm } = loadScore();
  const harmonies = readPerformance(performMsmToData({ msm: harmoniesScore(mei), mpm })).notes;
  const piece = readPerformance(performMsmToData({ msm, mpm })).notes;
  const byId = new Map(harmonies.map((n) => [n.id, n]));
  const graces = readGraces(
    new DOMParser().parseFromString(mei, 'application/xml').documentElement as unknown as XmlElement,
  );

  it('finds the grace notes, each with the note it leads to', () => {
    assert.deepEqual(graces, [
      { id: 'n1dxnc7z', pitch: 75, before: 'ngd8ef1' },
      { id: 'n1bwwaa4', pitch: 82, before: 'n14haee1' },
      { id: 'n1vtja1p', pitch: 81, before: 'n4qnv65' },
    ]);
  });

  it('plays every note, the grace notes a thirty-second before the notes they lead to', () => {
    assert.equal(harmonies.length, 219);
    for (const grace of graces) {
      const note = byId.get(grace.id);
      const target = byId.get(grace.before);
      assert.ok(note && target);
      assert.equal(note.pitch, grace.pitch);
      assert.equal(note.date + note.duration, target.date);
      assert.equal(note.duration, 90);
      assert.ok(note.onMs < target.onMs && target.onMs - note.onMs < 250);
    }
  });

  it('spans the piece, upbeat aside', () => {
    assert.equal(Math.min(...harmonies.map((n) => n.date)), 720);
    assert.equal(Math.max(...harmonies.map((n) => n.date + n.duration)), 92880);
  });

  it('keeps the piece’s time: notes no arpeggio moves sound when the piece’s do', () => {
    const plain = (notes: readonly Note[]): Map<number, number> =>
      new Map(notes.filter((n) => !n.ornamented).map((n) => [n.date, n.onMs]));
    const ours = plain(harmonies);
    const theirs = plain(piece);
    const shared = [...ours.keys()].filter((date) => theirs.has(date));
    assert.ok(shared.length >= 10);
    for (const date of shared) assert.ok(Math.abs((ours.get(date) ?? 0) - (theirs.get(date) ?? 0)) < 1e-6);
    const end = (notes: readonly Note[]): number => Math.max(...notes.map((n) => n.endMs));
    assert.ok(Math.abs(end(harmonies) - end(piece)) < 1e-6);
  });

  it('is pedalled as the piece is', () => {
    const pedal = (data: string): number =>
      readPerformance(performMsmToData({ msm: data, mpm })).sustain.length;
    assert.equal(pedal(harmoniesScore(mei)), pedal(msm));
  });
});
