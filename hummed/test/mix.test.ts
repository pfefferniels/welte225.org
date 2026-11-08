// The elaboration fader: the humming alone at 0, the harmonies coming in under it, the piece from
// the middle up with the humming quieter.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { heard, mix, PIECE_FROM } from '../src/page/mix.ts';

const positions = Array.from({ length: 101 }, (_, i) => i / 100);

describe('elaboration', () => {
  it('is the humming alone at 0', () => {
    assert.deepEqual(mix(0), { hum: 1, harmonies: 0, piece: 0 });
    assert.equal(heard(0), 'humming');
  });

  it('brings the harmonies in under the humming, which recedes', () => {
    const lower = positions.filter((e) => e < PIECE_FROM);
    for (const [a, b] of lower.slice(1).map((x, i) => [lower[i], x] as const)) {
      assert.ok(mix(b).harmonies > mix(a).harmonies);
      assert.ok(mix(b).hum < mix(a).hum);
      assert.equal(heard(b), 'harmonies');
    }
    assert.ok(mix(PIECE_FROM - 0.01).harmonies > mix(PIECE_FROM - 0.01).hum);
  });

  it('passes from the harmonies to the piece at the middle, as loud', () => {
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
});
