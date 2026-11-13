// The elaboration fader: the humming alone at 0, the harmonies under it at once, the piece from a
// third of the way up with the humming quieter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { heard, mix, PIECE_FROM, voiceElaboration } from '../src/page/mix.ts';
import {
  approximateness,
  atTempo,
  DEFAULT_ELABORATION,
  flightiness,
  pianoLevel,
  tempoFactor,
  voiceLevel,
  shapeAt,
} from '../src/worker/levels.ts';
import { ROOT } from '../tools/node-support.ts';

const positions = Array.from({ length: 101 }, (_, i) => i / 100);

describe('elaboration', () => {
  it('is the humming alone at 0', () => {
    assert.deepEqual(mix(0), { hum: 1, harmonies: 0, piece: 0 });
    assert.equal(heard(0), 'humming');
  });

  it('brings the harmonies in under the humming at once, as loud as the piano will be', () => {
    const lower = positions.filter((e) => e > 0 && e < PIECE_FROM);
    for (const e of lower) {
      assert.equal(mix(e).harmonies, mix(1).piece);
      assert.equal(heard(e), 'harmonies');
    }
    for (const [a, b] of lower.slice(1).map((x, i) => [lower[i], x] as const))
      assert.ok(mix(b).hum < mix(a).hum);
  });

  it('gives the harmonies a third of the fader', () => {
    assert.ok(Math.abs(PIECE_FROM - 1 / 3) < 1e-9);
    assert.equal(heard(0.33), 'harmonies');
    assert.equal(heard(0.34), 'piece');
  });

  it('brings the humming down soon', () => {
    const db = (x: number): number => 20 * Math.log10(x);
    // a quarter of the way up the humming is 10 dB down, under the harmonies
    assert.ok(db(mix(0.25).hum) < -10);
    assert.ok(mix(0.25).harmonies > mix(0.25).hum);
  });

  it('passes from the harmonies to the piece a third of the way up, as loud', () => {
    const justBelow = mix(PIECE_FROM - 1e-9).harmonies;
    assert.ok(Math.abs(justBelow - mix(PIECE_FROM).piece) < 1e-6);
    assert.equal(heard(PIECE_FROM), 'piece');
  });

  it('keeps the humming on under the piece, quieter towards the top', () => {
    assert.ok(mix(1).hum > 0.05 && mix(1).hum < mix(PIECE_FROM).hum);
    assert.ok(mix(1).hum < mix(1).piece / 5);
  });

  it('sounds one of the piano’s parts at a time', () => {
    for (const e of positions) assert.ok(mix(e).harmonies === 0 || mix(e).piece === 0);
  });

  it('exaggerates the more, and lets the voice sing the more loosely, the barer the music', () => {
    for (const [a, b] of positions.slice(1).map((x, i) => [positions[i], x] as const)) {
      // the piano's falls through the humming and the harmonies, and again through the piece
      if (b === PIECE_FROM || (a < PIECE_FROM && b > PIECE_FROM))
        assert.ok(pianoLevel(shapeAt(b)) > pianoLevel(shapeAt(a)));
      else assert.ok(pianoLevel(shapeAt(b)) < pianoLevel(shapeAt(a)));
      // the voice's own, once, smoothly
      assert.ok(voiceLevel(shapeAt(b)) < voiceLevel(shapeAt(a)));
      assert.ok(approximateness(b) < approximateness(a));
    }
    // the piece comes in as raw as the humming was; the voice goes on where it was
    assert.ok(Math.abs(pianoLevel(shapeAt(PIECE_FROM)) - 2) < 1e-9);
    assert.ok(Math.abs(pianoLevel(shapeAt(PIECE_FROM - 1e-9)) - (1 + Math.pow(2 / 3, 2))) < 1e-6);
    assert.ok(Math.abs(voiceLevel(shapeAt(PIECE_FROM)) - voiceLevel(shapeAt(PIECE_FROM - 1e-9))) < 1e-6);
    // the humming alone ×1.85 (×2 in timing); the piece as the MPM sets it down, the voice a little beyond it
    assert.ok(Math.abs(pianoLevel(shapeAt(0)) - 2) < 1e-9);
    assert.ok(Math.abs(voiceLevel(shapeAt(0)) - 1.85) < 1e-9);
    assert.equal(pianoLevel(shapeAt(1)), 1);
    assert.ok(Math.abs(voiceLevel(shapeAt(1)) - 1.1) < 1e-9);
    assert.equal(approximateness(0), 1);
    assert.equal(approximateness(1), 0);
  });

  it('goes the faster the barer the music, and as the MPM has it at the top', () => {
    for (const [a, b] of positions.slice(1).map((x, i) => [positions[i], x] as const)) {
      assert.ok(flightiness(b) < flightiness(a));
      assert.ok(tempoFactor(shapeAt(b)) < tempoFactor(shapeAt(a)));
    }
    assert.equal(flightiness(0), 1);
    assert.equal(flightiness(1), 0);
    assert.ok(Math.abs(tempoFactor(shapeAt(0)) - 2) < 1e-9);
    assert.equal(tempoFactor(shapeAt(1)), 1);
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

  it('renders the voice anew only at steps of the fader', () => {
    assert.equal(voiceElaboration(0.66), 0.65);
    assert.equal(voiceElaboration(0.68), 0.7);
    assert.equal(voiceElaboration(-1), 0);
    assert.equal(voiceElaboration(2), 1);
  });

  it('starts where the tools render the voice', () => {
    const page = readFileSync(join(ROOT, '../index.html'), 'utf8');
    const value = /id="elaboration"[^>]*value="(\d+)"/.exec(page)?.[1];
    assert.equal(Number(value) / 100, DEFAULT_ELABORATION);
    assert.equal(voiceElaboration(DEFAULT_ELABORATION), DEFAULT_ELABORATION);
  });
});
