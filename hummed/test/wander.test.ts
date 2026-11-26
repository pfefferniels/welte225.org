// Wandering: the fader's stops, one for each setting of the table, the walk there and back, and the
// playhead counted in bars.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RENDERED } from '../src/page/mix.ts';
import { barsAt, nextStop, WANDER_STOPS, type Wandering } from '../src/page/wander.ts';
import { ELABORATION, pianoPlays, voiceFollows } from '../src/shared/shape.ts';

describe('wandering', () => {
  it('stops at every setting of the table, where the voice is rendered for it', () => {
    assert.equal(WANDER_STOPS.length, ELABORATION.points.length);
    WANDER_STOPS.forEach((stop, i) => {
      assert.ok(RENDERED.includes(stop), String(stop));
      assert.equal(pianoPlays(stop), ELABORATION.piano.plays[i]);
      assert.equal(voiceFollows(stop), ELABORATION.voice.follows[i]);
    });
  });

  it('walks from the far left to the far right a setting at a time, then back, and so on', () => {
    let at: Wandering = { stop: 0, direction: 1 };
    const walked = [at.stop];
    for (let i = 0; i < 14; i++) {
      at = nextStop(at, 7);
      walked.push(at.stop);
    }
    assert.deepEqual(walked, [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0, 1, 2]);
  });

  it('counts the playhead in bars, between downbeats and beyond them', () => {
    const bars = [
      [1, '1'],
      [3, '2'],
      [4, '3'],
    ] as const;
    assert.equal(barsAt(bars, 1), 0);
    assert.equal(barsAt(bars, 2), 0.5);
    assert.equal(barsAt(bars, 3.5), 1.5);
    // the upbeat at the first bar's length, past the end at the last's
    assert.equal(barsAt(bars, 0.5), -0.25);
    assert.equal(barsAt(bars, 5), 3);
    assert.equal(barsAt([], 3), 0);
  });
});
