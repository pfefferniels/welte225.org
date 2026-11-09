import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inkColumns, Revisions, spans, TILE } from '../src/page/strip.ts';

describe('spans', () => {
  it('writes a message’s columns in one piece', () => {
    assert.deepEqual([...spans(100, 10)], [{ tile: 0, x: 100, from: 0, count: 10 }]);
    assert.deepEqual([...spans(3 * TILE + 7, 25)], [{ tile: 3, x: 7, from: 0, count: 25 }]);
  });
  it('cuts where one tile ends and the next begins', () => {
    assert.deepEqual(
      [...spans(TILE - 4, 10)],
      [
        { tile: 0, x: TILE - 4, from: 0, count: 4 },
        { tile: 1, x: 0, from: 4, count: 6 },
      ],
    );
  });
  it('cuts a long run into batches that cover it once', () => {
    const parts = [...spans(TILE - 100, 300)];
    assert.ok(parts.every((part) => part.count <= 64 && part.x + part.count <= TILE));
    let next = 0;
    for (const part of parts) {
      assert.equal(part.from, next);
      assert.equal(part.tile * TILE + part.x, TILE - 100 + part.from);
      next += part.count;
    }
    assert.equal(next, 300);
  });
  it('writes nothing for no columns', () => {
    assert.deepEqual([...spans(5, 0)], []);
  });
});

describe('inkColumns', () => {
  it('makes each grey the opacity of its pixel, column by column, and leaves the ink alone', () => {
    const rows = 3;
    const width = 4;
    // three columns: column k, row r is the grey 10 k + r
    const pixels = Uint8Array.from([0, 1, 2, 10, 11, 12, 20, 21, 22]);
    const image = new Uint8ClampedArray(width * rows * 4).fill(7);
    inkColumns(image, width, pixels, 1, 2, rows);
    for (let r = 0; r < rows; r++)
      for (let x = 0; x < width; x++) {
        const at = (r * width + x) * 4;
        assert.deepEqual([...image.subarray(at, at + 3)], [7, 7, 7]);
        // the second and third columns in the image's first two; the rest untouched
        assert.equal(image[at + 3], x < 2 ? 255 - (10 * (x + 1) + r) : 7);
      }
  });
});

describe('Revisions', () => {
  it('knows nothing drawn', () => {
    assert.equal(new Revisions().latest(0, 5000), 0);
  });
  it('gives a stretch a higher number once columns in it are drawn', () => {
    const revisions = new Revisions();
    revisions.drew(1000, 10);
    const before = revisions.latest(900, 1100);
    assert.ok(before > 0);
    revisions.drew(1010, 10);
    assert.ok(revisions.latest(900, 1100) > before);
  });
  it('leaves a stretch as it was while columns are drawn elsewhere', () => {
    const revisions = new Revisions();
    revisions.drew(1000, 10);
    const before = revisions.latest(0, 1600);
    revisions.drew(8000, 25);
    revisions.drew(1700, 10);
    assert.equal(revisions.latest(0, 1600), before);
    assert.ok(revisions.latest(0, 1800) > before);
    assert.equal(revisions.latest(3000, 4000), 0);
  });
  it('counts a drawing that reaches into the stretch from before it', () => {
    const revisions = new Revisions();
    revisions.drew(190, 20);
    assert.ok(revisions.latest(200, 300) > 0);
  });
});
