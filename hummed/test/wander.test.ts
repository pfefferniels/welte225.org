// Wandering: the fader's stops, one for each setting of the table, the glide there and back at an even
// pace in bars, the music counted as going on, and the playhead counted in bars.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RENDERED } from '../src/page/mix.ts';
import { barsAt, WANDER_BARS, WANDER_LEAP, WANDER_STOPS, wanderAt, wentOn } from '../src/page/wander.ts';
import { ELABORATION, pianoPlays, voiceFollows } from '../src/shared/shape.ts';

const close = (actual: number, expected: number, what = ''): void => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what} ${actual} is not ${expected}`);
};

describe('wandering', () => {
  it('has a stop at every setting of the table, where the voice is rendered for it', () => {
    assert.equal(WANDER_STOPS.length, ELABORATION.points.length);
    WANDER_STOPS.forEach((stop, i) => {
      assert.ok(RENDERED.includes(stop), String(stop));
      assert.equal(pianoPlays(stop), ELABORATION.piano.plays[i]);
      assert.equal(voiceFollows(stop), ELABORATION.voice.follows[i]);
    });
  });

  it('glides from the far right to the far left, a stop every two and a half bars, then back, and so on', () => {
    const n = WANDER_STOPS.length - 1;
    assert.equal(WANDER_BARS, 2.5);
    // at each stop in turn: right to left, then left to right, then on again
    for (let k = 0; k <= 3 * n; k++) {
      const turn = Math.floor(k / n) % 2 === 0;
      const stop = turn ? n - (k % n) : k % n;
      close(wanderAt(k * WANDER_BARS), WANDER_STOPS[stop], `after ${k} stops`);
    }
    close(wanderAt(0), WANDER_STOPS[n]);
    close(wanderAt(n * WANDER_BARS), WANDER_STOPS[0]);
    close(wanderAt(2 * n * WANDER_BARS), WANDER_STOPS[n]);
  });

  it('goes evenly between the stops, never past either end, and is where it was at every moment', () => {
    const n = WANDER_STOPS.length - 1;
    // halfway between the first two stops, on the way there and on the way back
    close(wanderAt(WANDER_BARS / 2), (WANDER_STOPS[n] + WANDER_STOPS[n - 1]) / 2);
    close(wanderAt((2 * n - 0.5) * WANDER_BARS), (WANDER_STOPS[n] + WANDER_STOPS[n - 1]) / 2);
    let last = wanderAt(0);
    for (let b = 0.01; b < 4 * n * WANDER_BARS; b += 0.01) {
      const e = wanderAt(b);
      assert.ok(e >= WANDER_STOPS[0] - 1e-9 && e <= WANDER_STOPS[n] + 1e-9, `at ${b} bars: ${e}`);
      // a hundredth of a bar moves it no further than its pace
      const pace = (WANDER_STOPS[n] - WANDER_STOPS[0]) / (n * WANDER_BARS);
      assert.ok(Math.abs(e - last) <= pace * 0.01 + 1e-9, `at ${b} bars it leaps from ${last} to ${e}`);
      last = e;
    }
  });

  it('counts the music as going on, not where it went back or leapt ahead', () => {
    assert.equal(wentOn(null, 3), 0);
    close(wentOn(3, 3.25), 0.25);
    assert.equal(wentOn(3, 3), 0);
    assert.equal(wentOn(3, 2.5), 0);
    assert.equal(wentOn(3, 3 + WANDER_LEAP + 0.01), 0);
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
