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
  it('hums alone at the bare end, then plays the harmonies in half and quarter notes, then the piece', () => {
    assert.deepEqual(mix(0), { hum: 1, harmonies: 0, piece: 0 });
    for (const [e, what] of [
      [0, 'humming'],
      [0.14, 'humming'],
      [0.15, 'halves'],
      [0.24, 'halves'],
      [0.25, 'quarters'],
      [0.39, 'quarters'],
      [0.4, 'piece'],
      [1, 'piece'],
    ] as const)
      assert.equal(heard(e), what, String(e));
    assert.equal(partsAt(0.2).piano, 'harmonies');
    assert.equal(partsAt(0.5).piano, 'piece');
    // the voice alone hums the piece's line; over the harmonies, the line over them
    assert.equal(voiceFollows(0), 'piece');
    assert.equal(voiceFollows(0.2), 'halves');
    assert.equal(voiceFollows(0.3), 'quarters');
    // the harmonies the piano has to hand: those it plays, those under the piece, at first the halves
    assert.equal(harmoniesStage(0), 'halves');
    assert.equal(harmoniesStage(0.3), 'quarters');
    assert.equal(harmoniesStage(0.5), 'quarters');
    assert.deepEqual(BORDERS, [0.15, 0.25, 0.4]);
  });

  it('holds every value across a step, which is one setting', () => {
    for (const [from, to] of [
      [0.15, 0.25],
      [0.25, 0.4],
    ] as const)
      for (const e of positions.filter((x) => x >= from && x < to - 1e-9)) {
        assert.equal(stepAt(e), from);
        assert.deepEqual(shapeAt(e), shapeAt(from));
        assert.deepEqual(mix(e), mix(from));
        assert.equal(voiceElaboration(e), from);
      }
    assert.equal(stepAt(0.1), null);
    assert.equal(stepAt(0.5), null);
  });

  it('keeps to its points, and between two never goes beyond them', () => {
    const { points, piano, voice } = ELABORATION;
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

  it('plays Grünfeld’s performance as it is at the top, the humming under it', () => {
    const top = shapeAt(1);
    assert.equal(tempoFactor(top), 1);
    assert.equal(top.inexactMs, 0);
    assert.equal(pianoLevel(top), 1);
    assert.equal(top.approximateness, 0);
    assert.ok(mix(1).hum > 0.05 && mix(1).hum < mix(0.4).hum);
    assert.ok(mix(1).hum < mix(1).piece / 5);
  });

  it('sounds one of the piano’s parts at a time', () => {
    for (const e of positions) assert.ok(mix(e).harmonies === 0 || mix(e).piece === 0);
  });

  it('renders each setting on the fader’s side of a border, and a step at its point', () => {
    assert.equal(voiceElaboration(0.14), 0.1);
    assert.equal(voiceElaboration(0.15), 0.15);
    assert.equal(voiceElaboration(0.4), 0.4);
    assert.equal(voiceElaboration(0.42), 0.4);
    assert.equal(voiceElaboration(0.43), 0.45);
    assert.equal(voiceElaboration(0.66), 0.65);
    assert.equal(voiceElaboration(-1), 0);
    assert.equal(voiceElaboration(2), 1);
    for (const e of positions) {
      assert.equal(pianoPlays(voiceElaboration(e)), pianoPlays(e), String(e));
      assert.equal(voiceFollows(voiceElaboration(e)), voiceFollows(e), String(e));
    }
    assert.deepEqual(RENDERED, [
      0,
      0.05,
      0.1,
      0.15,
      0.25,
      ...Array.from({ length: 13 }, (_, i) => (40 + 5 * i) / 100),
    ]);
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
  it('are the piece’s where the voice hums it alone or the piano plays it, the reductions’ between', () => {
    for (const e of positions)
      assert.equal(
        performedOf(partsAt(e), voiceFollows(e)),
        e >= 0.15 && e < 0.4 ? 'reductions' : 'piece',
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
