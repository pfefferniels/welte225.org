// Every sound keeps its place on its timeline: a source started where its place is far enough ahead
// starts there; one whose place has passed, or is too close, starts a little later and as much
// further into its sound, at the rate it plays at; one placed before its first sample starts where
// that is placed.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { marginOf, startOn, startPlace } from '../src/page/timeline.ts';

/** A source on a context at `now`, which keeps where it is started. */
function source(now: number, rate = 1) {
  const context = { currentTime: now, sampleRate: 44100 } as unknown as BaseAudioContext;
  const started: { when: number; offset: number }[] = [];
  const node = {
    context,
    playbackRate: { value: rate },
    start: (when: number, offset: number) => started.push({ when, offset }),
  } as unknown as AudioBufferSourceNode;
  return { node, started };
}

describe('a sound on its timeline', () => {
  it('starts at its place where that is far enough ahead, else later and further into it', () => {
    assert.deepEqual(startPlace(10.5, 2, 10, 0.01), { when: 10.5, offset: 2, late: 0 });
    // passed by 0.2 s: it starts at the margin, 0.21 s further in
    const late = startPlace(9.8, 2, 10, 0.01);
    assert.ok(Math.abs(late.when - 10.01) < 1e-12 && Math.abs(late.offset - 2.21) < 1e-12);
    assert.ok(Math.abs(late.late - 0.21) < 1e-12);
    // where it plays faster than its own time, as much further as that
    const fast = startPlace(9.8, 2, 10, 0.01, 1.5);
    assert.ok(Math.abs(fast.offset - (2 + 0.21 * 1.5)) < 1e-12);
    // everywhere, what is heard at a time is what its place says: offset − rate·when stays
    for (const [when, now] of [
      [10.5, 10],
      [10.001, 10],
      [9, 10],
    ] as const) {
      const s = startPlace(when, 3, now, 0.0087, 1.2);
      assert.ok(Math.abs(s.offset - 1.2 * s.when - (3 - 1.2 * when)) < 1e-9);
      assert.ok(s.when >= now + 0.0087 - 1e-12);
    }
  });

  it('keeps three render quanta from the context’s time, and none offline', () => {
    assert.ok(Math.abs(marginOf({ sampleRate: 44100 } as BaseAudioContext) - (3 * 128) / 44100) < 1e-15);
    assert.equal(
      marginOf({ sampleRate: 44100, startRendering: () => undefined } as unknown as BaseAudioContext),
      0,
    );
  });

  it('starts a source as its place says', () => {
    // on time
    let s = source(10);
    assert.equal(startOn(s.node, 11, 4), 0);
    assert.deepEqual(s.started, [{ when: 11, offset: 4 }]);
    // its place passed while the page's thread was held up: as far into it as it is late
    s = source(10);
    const late = startOn(s.node, 9.9, 4);
    assert.ok(late > 0.1);
    assert.ok(Math.abs(s.started[0].when - s.started[0].offset - (9.9 - 4)) < 1e-12);
    // placed before its first sample (a crossfade beginning before a rendering's time 0)
    s = source(10);
    startOn(s.node, 11, -0.5);
    assert.deepEqual(s.started, [{ when: 11.5, offset: 0 }]);
  });
});
