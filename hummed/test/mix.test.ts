// The abstractness fader: the humming alone at the top, the harmonies coming in under it, the
// piece from the middle down with the humming quieter.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { heard, mix, PIECE_BELOW } from '../src/page/mix.ts';

const positions = Array.from({ length: 101 }, (_, i) => i / 100);

describe('abstractness', () => {
  it('is the humming alone at the top', () => {
    assert.deepEqual(mix(1), { hum: 1, harmonies: 0, piece: 0 });
    assert.equal(heard(1), 'humming');
  });

  it('brings the harmonies in under the humming, which recedes', () => {
    const upper = positions.filter((a) => a >= PIECE_BELOW).reverse();
    for (const [a, b] of upper.slice(1).map((x, i) => [upper[i], x] as const)) {
      assert.ok(mix(b).harmonies > mix(a).harmonies);
      assert.ok(mix(b).hum < mix(a).hum);
      assert.equal(heard(b), 'harmonies');
    }
    assert.ok(mix(PIECE_BELOW).harmonies > mix(PIECE_BELOW).hum);
  });

  it('passes from the harmonies to the piece at the middle, as loud', () => {
    assert.ok(Math.abs(mix(PIECE_BELOW).harmonies - mix(PIECE_BELOW - 0.01).piece) < 1e-12);
    assert.equal(heard(PIECE_BELOW - 0.01), 'piece');
  });

  it('keeps the humming on under the piece, quieter towards the bottom', () => {
    assert.ok(mix(0).hum > 0.05 && mix(0).hum < mix(PIECE_BELOW).hum);
    assert.ok(mix(0).hum < mix(0).piece / 5);
  });

  it('sounds one of the piano’s parts at a time', () => {
    for (const a of positions) assert.ok(mix(a).harmonies === 0 || mix(a).piece === 0);
  });
});
