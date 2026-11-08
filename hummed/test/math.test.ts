import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clip, fixed, groupBy, interp, seededRandom } from '../src/shared/math.ts';

describe('interp', () => {
  const xs = [0, 10, 20];
  const ys = [0, 100, 50];
  it('interpolates linearly inside the table', () => {
    assert.equal(interp(5, xs, ys), 50);
    assert.equal(interp(15, xs, ys), 75);
  });
  it('holds the end values outside it', () => {
    assert.equal(interp(-3, xs, ys), 0);
    assert.equal(interp(99, xs, ys), 50);
  });
  it('hits the table points exactly', () => {
    for (let i = 0; i < xs.length; i++) assert.equal(interp(xs[i], xs, ys), ys[i]);
  });
});

describe('clip and fixed', () => {
  it('clip bounds a value', () => {
    assert.equal(clip(5, 0, 1), 1);
    assert.equal(clip(-5, 0, 1), 0);
    assert.equal(clip(0.5, 0, 1), 0.5);
  });
  it('fixed keeps what toFixed prints', () => {
    assert.equal(fixed(0.125, 2), Number((0.125).toFixed(2)));
    assert.equal(fixed(1.005, 2), 1);
  });
});

describe('seededRandom', () => {
  it('repeats itself for a seed', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    for (let i = 0; i < 100; i++) assert.equal(a.uniform(0, 1), b.uniform(0, 1));
  });
  it('stays within its range', () => {
    const r = seededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const x = r.uniform(1.5, 3.5);
      assert.ok(x >= 1.5 && x < 3.5);
    }
  });
});

describe('groupBy', () => {
  it('keeps the order of first appearance and within groups', () => {
    const groups = groupBy([3, 1, 4, 1, 5, 9, 2, 6], (x) => x % 2);
    assert.deepEqual([...groups.keys()], [1, 0]);
    assert.deepEqual(groups.get(1), [3, 1, 1, 5, 9]);
  });
});
