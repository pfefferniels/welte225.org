import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkOrder } from '../src/page/pool.ts';

/** That the chunks cover [0, count) exactly once. */
function assertCovers(chunks: readonly (readonly [number, number])[], count: number): void {
  const sorted = [...chunks].sort((a, b) => a[0] - b[0]);
  assert.equal(sorted[0]?.[0], 0);
  assert.equal(sorted.at(-1)?.[1], count);
  for (let i = 1; i < sorted.length; i++) assert.equal(sorted[i]?.[0], sorted[i - 1]?.[1]);
}

describe('chunkOrder', () => {
  const plan = { stateCount: 10000, seams: [2000, 5000, 5100, 8000, 9900] };
  it('cuts at the seams, joining chunks that would be too short', () => {
    const chunks = chunkOrder({ ...plan, startState: 0 });
    assert.deepEqual(chunks, [
      [0, 2000],
      [2000, 5000],
      [5000, 8000],
      [8000, 10000],
    ]);
  });
  it('starts where playback starts and comes round to it', () => {
    const chunks = chunkOrder({ ...plan, startState: 6000 });
    assert.deepEqual(chunks[0], [6000, 8000]);
    assert.deepEqual(chunks.at(-1), [5000, 6000]);
    assertCovers(chunks, plan.stateCount);
  });
  it('starts at a seam without splitting', () => {
    const chunks = chunkOrder({ ...plan, startState: 5000 });
    assert.deepEqual(chunks[0], [5000, 8000]);
    assert.equal(chunks.length, 4);
    assertCovers(chunks, plan.stateCount);
  });
  it('renders in one piece without seams', () => {
    assert.deepEqual(chunkOrder({ stateCount: 500, seams: [], startState: 0 }), [[0, 500]]);
  });
});
