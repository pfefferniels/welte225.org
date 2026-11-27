// The library of ready settings: which are wanted, in what order (the fader's, then outward, more on
// the side it travels to), and which are kept under the budget (those sounding always, then the
// wanted, then the ones heard last).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AHEAD, BEHIND, budget, bytesPerSecond, kept, wanted } from '../src/page/library.ts';
import { RENDERED } from '../src/page/mix.ts';

const MB = 1024 * 1024;

describe('the settings that are ready', () => {
  it('are wanted from the fader outward, more of them on the side it travels to', () => {
    assert.deepEqual(wanted(RENDERED, 0.5, 1), [0.5, 0.55, 0.45, 0.6, 0.4, 0.65]);
    assert.deepEqual(wanted(RENDERED, 0.5, -1), [0.5, 0.45, 0.55, 0.4, 0.6, 0.35]);
    assert.equal(wanted(RENDERED, 0.5, 1).length, 1 + AHEAD + BEHIND);
    // at an end, only what there is
    assert.deepEqual(wanted(RENDERED, 0, -1), [0, 0.05, 0.1]);
    assert.deepEqual(wanted(RENDERED, 1, 1), [1, 0.95, 0.9]);
    // an elaboration between the steps is the nearest step's
    assert.equal(wanted(RENDERED, 0.42, 0)[0], 0.4);
  });

  it('are kept: those sounding, the wanted as far as the budget goes, then the ones heard last', () => {
    const held = [
      { key: 'a', bytes: 100, lastUsed: 1 },
      { key: 'b', bytes: 100, lastUsed: 5 },
      { key: 'c', bytes: 100, lastUsed: 3 },
      { key: 'd', bytes: 100, lastUsed: 4 },
      { key: 'e', bytes: 300, lastUsed: 2 },
    ];
    assert.deepEqual([...kept(held, ['c', 'a'], new Set(), 300)].sort(), ['a', 'b', 'c']);
    // what sounds is kept whatever it costs, and so is the fader's own
    assert.deepEqual([...kept(held, ['e'], new Set(['d']), 300)].sort(), ['d', 'e']);
    // the least wanted goes first, then the one heard longest ago
    assert.deepEqual([...kept(held, ['a', 'b', 'c', 'd'], new Set(), 250)].sort(), ['a', 'b']);
    assert.deepEqual([...kept(held, [], new Set(), 250)].sort(), ['b', 'd']);
  });

  it('take a budget that keeps a few long settings on a computer, and one long or a few short on a phone', () => {
    // the longest setting (3:55) and the shortest (1:12), the piano at 48 kHz
    const long = 235 * bytesPerSecond(48000);
    const short = 72 * bytesPerSecond(48000);
    assert.ok(long > 140 * MB && long < 160 * MB);
    assert.equal(Math.floor(budget(undefined, false) / long), 4);
    assert.equal(Math.floor(budget(8, false) / short), 14);
    assert.equal(budget(4, false), budget(undefined, false) / 2);
    assert.equal(budget(undefined, true), budget(2, false));
    assert.equal(Math.floor(budget(undefined, true) / long), 1);
    assert.equal(Math.floor(budget(undefined, true) / short), 4);
  });
});
