// The elaboration fader: the humming alone at the bare end, then the harmonies in half notes and in
// quarter notes, each a step, then the piece, the humming over them throughout; the values a table
// of points (shape.ts), smooth between points and held across a step.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { BORDERS, heard, mix, partsAt, performedOf, RENDERED, voiceElaboration } from '../src/page/mix.ts';
import {
  atTempo,
  DEFAULT_ELABORATION,
  ELABORATION,
  harmoniesStage,
  pianoDb,
  pianoLevel,
  pianoPlays,
  shapeAt,
  stepAt,
  tempoFactor,
  voiceDb,
  voiceFollows,
  voiceLevel,
} from '../src/worker/levels.ts';
import { ROOT } from '../tools/node-support.ts';

const positions = Array.from({ length: 101 }, (_, i) => i / 100);
const close = (a: number, b: number, what = ''): void => {
  assert.ok(Math.abs(a - b) < 1e-9, `${what} ${a} ≠ ${b}`);
};

describe('elaboration', () => {
  const { points, steps, piano, voice } = ELABORATION;

  it('plays and follows at each point what the table has there', () => {
    points.forEach((p, i) => {
      assert.equal(heard(p), piano.plays[i] === 'none' ? 'humming' : piano.plays[i], `heard at ${p}`);
      assert.equal(pianoPlays(p), piano.plays[i]);
      assert.equal(voiceFollows(p), voice.follows[i]);
      assert.equal(
        partsAt(p).piano,
        piano.plays[i] === 'none' ? 'none' : piano.plays[i] === 'piece' ? 'piece' : 'harmonies',
      );
    });
    // the harmonies the piano has to hand: those it plays, under the piece the quarters
    for (const e of positions) {
      const plays = pianoPlays(e);
      if (plays === 'halves' || plays === 'quarters') assert.equal(harmoniesStage(e), plays);
      if (plays === 'piece') assert.equal(harmoniesStage(e), 'quarters');
    }
    // a gap wherever what the piano plays changes
    assert.deepEqual(
      BORDERS,
      points.filter((_, i) => i > 0 && piano.plays[i] !== piano.plays[i - 1]),
    );
  });

  it('holds every value across a step, which is one setting', () => {
    points.forEach((from, k) => {
      if (!steps[k] || k === points.length - 1) return;
      const to = points[k + 1];
      for (const e of positions.filter((x) => x >= from && x < to - 1e-9)) {
        assert.equal(stepAt(e), from);
        assert.deepEqual(shapeAt(e), shapeAt(from));
        assert.deepEqual(mix(e), mix(from));
        assert.equal(voiceElaboration(e), from);
      }
    });
    for (const e of positions)
      if (stepAt(e) !== null) assert.ok(steps[(points as readonly number[]).indexOf(stepAt(e) ?? -1)]);
  });

  it('keeps to its points, and between two never goes beyond them', () => {
    points.forEach((p, i) => {
      const shape = shapeAt(p);
      close(shape.tempo, piano.tempo[i], `tempo at ${p}`);
      close(shape.inexactMs, piano.ms[i], `ms at ${p}`);
      close(pianoLevel(shape), piano.exaggeration[i], `piano at ${p}`);
      close(voiceLevel(shape), voice.exaggeration[i], `voice at ${p}`);
      close(shape.approximateness, voice.looseness[i], `looseness at ${p}`);
      close(voiceDb(p), voice.db[i], `voice dB at ${p}`);
      if (piano.plays[i] !== 'none') close(pianoDb(p), piano.db[i], `piano dB at ${p}`);
    });
    for (const e of positions) {
      const k = points.findLastIndex((p) => p <= e);
      if (k === points.length - 1) continue;
      for (const [value, ys] of [
        [tempoFactor(shapeAt(e)), piano.tempo],
        [pianoLevel(shapeAt(e)), piano.exaggeration],
        [voiceLevel(shapeAt(e)), voice.exaggeration],
        [voiceDb(e), voice.db],
      ] as const) {
        const lo = Math.min(ys[k], ys[k + 1]);
        const hi = Math.max(ys[k], ys[k + 1]);
        assert.ok(value >= lo - 1e-9 && value <= hi + 1e-9, `${value} at ${e}`);
      }
    }
  });

  it('plays Grünfeld’s performance as it is at the top, the humming under it or gone', () => {
    const top = shapeAt(1);
    assert.equal(tempoFactor(top), 1);
    assert.equal(top.inexactMs, 0);
    assert.equal(pianoLevel(top), 1);
    assert.equal(top.approximateness, 0);
    assert.ok(mix(1).hum < mix(0).hum);
    assert.ok(mix(1).hum < mix(1).piece / 5);
  });

  it('sounds one of the piano’s parts at a time', () => {
    for (const e of positions) assert.ok(mix(e).harmonies === 0 || mix(e).piece === 0);
  });

  it('renders each setting on the fader’s side of a border, and a step at its point', () => {
    assert.equal(voiceElaboration(-1), 0);
    assert.equal(voiceElaboration(2), 1);
    for (const e of positions) {
      assert.equal(pianoPlays(voiceElaboration(e)), pianoPlays(e), String(e));
      assert.equal(voiceFollows(voiceElaboration(e)), voiceFollows(e), String(e));
    }
    // every 0.05, but within a step only its point
    for (const e of RENDERED)
      assert.ok(stepAt(e) === e || Math.abs(Math.round(e * 20) - e * 20) < 1e-9, String(e));
    assert.deepEqual(
      RENDERED,
      [...new Set(positions.map(voiceElaboration))].sort((a, b) => a - b),
    );
  });

  it('sets a tempo faster where it starts and where it arrives, and nothing else', () => {
    const mpm =
      '<tempoMap><tempo date="0" bpm="60" transition.to="48.5" meanTempoAt="0.5" beatLength="0.25" />' +
      '<tempo date="720" bpm="andante" beatLength="0.25" /></tempoMap>' +
      '<dynamics date="0" volume="60" transition.to="48.5" />';
    assert.equal(
      atTempo(mpm, 1.5),
      '<tempoMap><tempo date="0" bpm="90" transition.to="72.75" meanTempoAt="0.5" beatLength="0.25" />' +
        '<tempo date="720" bpm="andante" beatLength="0.25" /></tempoMap>' +
        '<dynamics date="0" volume="60" transition.to="48.5" />',
    );
    assert.equal(atTempo(mpm, 1), mpm);
  });

  it('starts where the tools render the voice', () => {
    const page = readFileSync(join(ROOT, '../index.html'), 'utf8');
    const value = /id="elaboration"[^>]*value="(\d+)"/.exec(page)?.[1];
    assert.equal(Number(value) / 100, DEFAULT_ELABORATION);
    assert.equal(voiceElaboration(DEFAULT_ELABORATION), DEFAULT_ELABORATION);
  });
});

describe('whose instructions are heard', () => {
  it('are the piece’s where the voice or the piano has it, the reductions’ elsewhere', () => {
    for (const e of positions)
      assert.equal(
        performedOf(partsAt(e), voiceFollows(e)),
        pianoPlays(e) === 'piece' || voiceFollows(e) === 'piece' ? 'piece' : 'reductions',
        String(e),
      );
  });
  it('are the piece’s where the piano plays it, or the voice follows it', () => {
    assert.equal(performedOf({ voice: true, piano: 'piece' }, 'halves'), 'piece');
    assert.equal(performedOf({ voice: false, piano: 'piece' }, 'quarters'), 'piece');
    assert.equal(performedOf({ voice: true, piano: 'harmonies' }, 'piece'), 'piece');
    assert.equal(performedOf({ voice: true, piano: 'none' }, 'piece'), 'piece');
  });
  it('are the reductions’ where neither is heard of the piece', () => {
    assert.equal(performedOf({ voice: false, piano: 'harmonies' }, 'piece'), 'reductions');
    assert.equal(performedOf({ voice: true, piano: 'none' }, 'quarters'), 'reductions');
    assert.equal(performedOf({ voice: false, piano: 'none' }, 'halves'), 'reductions');
    assert.equal(performedOf({ voice: false, piano: 'none' }, 'piece'), 'piece');
  });
});
