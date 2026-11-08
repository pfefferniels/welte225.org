import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { silences } from '../src/hummer/gestures.ts';
import { segment } from '../src/hummer/tiers.ts';

describe('silences', () => {
  it('finds where the lungs have rested 250 ms and rest on', () => {
    const pressure = [
      segment(0, 1000, 7000),
      segment(1000, 1200, 0),
      segment(1200, 1600, 0),
      segment(1600, 2000, 5000),
    ];
    assert.deepEqual(silences(pressure), [1250]);
  });
  it('ignores a pause too short to be silent', () => {
    const pressure = [segment(0, 1000, 7000), segment(1000, 1200, 0), segment(1200, 2000, 7000)];
    assert.deepEqual(silences(pressure), []);
  });
});
