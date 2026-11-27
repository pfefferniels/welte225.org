// The weights of settings sounding at once: a crossfade fades every one from where it is while the
// new one comes in, so their powers sum to one however often the fader moves on; the course is
// what an AudioParam plays as linear ramps between its points.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { correction, FADE_STEP, likeness, power, Weight, type Correction } from '../src/page/blend.ts';
import { seededRandom } from '../src/shared/math.ts';

describe('the weights of settings that blend', () => {
  it('fades in as a sine and out as a cosine, the course straight between points a few ms apart', () => {
    const coming = Weight.fadingIn(10, 0.2);
    const going = new Weight(0, 1);
    going.fadeOut(10, 0.2);
    for (const p of coming.points)
      assert.ok(Math.abs(p.value - Math.sin(((p.time - 10) / 0.2) * (Math.PI / 2))) < 1e-12);
    assert.equal(coming.at(9), 0);
    assert.equal(coming.at(10.2), 1);
    assert.equal(going.at(10), 1);
    assert.equal(going.at(10.2), 0);
    assert.equal(going.end, 10.2);
    assert.equal(coming.end, null);
    for (let i = 1; i < coming.points.length; i++)
      assert.ok(coming.points[i].time - coming.points[i - 1].time <= FADE_STEP + 1e-12);
  });

  it('keeps the powers summing to one through crossfades that follow each other before they end', () => {
    const random = seededRandom(5);
    const lanes = [new Weight(0, 1)];
    let time = 1;
    let worst = 0;
    for (let k = 0; k < 40; k++) {
      // the fader lands on another setting every 10 to 300 ms, each crossfade 10 to 400 ms long
      const length = random.uniform(0.01, 0.4);
      for (const lane of lanes) lane.fadeOut(time, length);
      lanes.push(Weight.fadingIn(time, length));
      const next = time + random.uniform(0.01, 0.3);
      for (let t = time - 0.05; t < next; t += 0.0005) worst = Math.max(worst, Math.abs(power(lanes, t) - 1));
      time = next;
    }
    // straight between points a few ms apart, the cosine and sine sum to one within a hundredth
    assert.ok(worst < 0.01, String(worst));
    // every one but the last has been faded out, and goes for good at the end of its fade
    assert.ok(lanes.slice(0, -1).every((lane) => lane.end !== null));
    assert.equal(lanes.at(-1)?.end, null);
  });

  it('fades a setting still coming in from where it had got to', () => {
    const coming = Weight.fadingIn(0, 0.4);
    const halfway = coming.at(0.213);
    const added = coming.fadeOut(0.213, 0.1);
    // the first point is where it was, reached along the way it was going
    assert.deepEqual(added[0], { time: 0.213, value: halfway });
    const kept = Weight.fadingIn(0, 0.4);
    const onPoint = kept.points[50];
    // where a point is there already, the fade goes on from it
    assert.ok(kept.fadeOut(onPoint.time, 0.1)[0].time > onPoint.time);
    assert.ok(kept.points.includes(onPoint));
    assert.ok(Math.abs(coming.at(0.263) - halfway * Math.cos(Math.PI / 4)) < 0.01);
    assert.equal(coming.at(0.313), 0);
  });

  it('forgets what the audio thread has played', () => {
    const coming = Weight.fadingIn(0, 0.4);
    const before = coming.at(0.31);
    coming.forget(0.3);
    assert.ok(coming.points[0].time <= 0.3);
    assert.equal(coming.at(0.31), before);
  });

  it('knows when it has gone, whatever it has forgotten (the player lets go of it then)', () => {
    const going = new Weight(10, 1);
    going.fadeOut(20, 0.4);
    assert.equal(going.end, 20.4);
    going.forget(20.2);
    assert.equal(going.end, 20.4);
    // the audio thread past the end: only the last point is left of the course
    going.forget(20.42);
    assert.equal(going.points.length, 1);
    assert.equal(going.end, 20.4);
    assert.equal(going.at(21), 0);
    // faded out again once it has gone, it stays gone from when it went
    going.fadeOut(22, 0.3);
    assert.equal(going.end, 20.4);
  });
});

describe('a crossfade between settings that sound alike', () => {
  const RATE = 8000;
  /** A sound: a few partials of `f0`, `seed` choosing their phases. */
  const sound = (seed: number, f0 = 110, seconds = 1): Float32Array => {
    const random = seededRandom(seed);
    const phases = [1, 2, 3, 5].map(() => random.uniform(0, 2 * Math.PI));
    return Float32Array.from({ length: seconds * RATE }, (_, i) =>
      phases.reduce((x, p, h) => x + Math.sin(2 * Math.PI * f0 * (h + 1) * (i / RATE) + p) / (h + 1), 0),
    );
  };
  const heard = (samples: Float32Array, origin = 0, gain = 1) => ({
    origin,
    parts: [{ samples, from: 0, rate: RATE, gain }],
  });
  /** The power of the sum through the crossfade against what unrelated sounds would give, at each tenth. */
  const sums = (a: Float32Array, b: Float32Array, corrected: Correction = () => 1): number[] => {
    const like = likeness(heard(a), heard(b), 0, 1);
    return Array.from({ length: 9 }, (_, k) => {
      const phase = (k + 1) / 10;
      const g = corrected(phase);
      const c = Math.cos((phase * Math.PI) / 2) * g;
      const s = Math.sin((phase * Math.PI) / 2) * g;
      const summed = c * c * like.going + s * s * like.coming + 2 * c * s * like.both;
      const unrelated = (c * c * like.going + s * s * like.coming) / (g * g);
      return 10 * Math.log10(summed / unrelated);
    });
  };

  it('measures how alike two sounds are where they are placed', () => {
    const a = sound(1);
    const same = likeness(heard(a), heard(a), 0.1, 0.9);
    assert.ok(Math.abs(same.both / same.going - 1) < 1e-9);
    const opposite = likeness(heard(a), heard(a, 0, -1), 0.1, 0.9);
    assert.ok(Math.abs(opposite.both / opposite.going + 1) < 1e-9);
    // the same sound placed later is found there: a quarter of a second in, it starts
    const later = new Float32Array(2 * RATE);
    later.set(a, RATE / 4);
    const found = likeness(heard(a), heard(later, -0.25), 0.1, 0.7);
    assert.ok(Math.abs(found.both / found.going - 1) < 1e-6);
  });

  it('keeps the sum where two unrelated sounds would have it, within 3 dB of correction', () => {
    const a = sound(1);
    const b = sound(2, 137);
    const flip = a.map((x) => -x);
    // the same sound: 3 dB up in the middle of an equal-power crossfade; corrected, as unrelated
    assert.ok(Math.abs(Math.max(...sums(a, a)) - 10 * Math.log10(2)) < 1e-6);
    for (const db of sums(a, a, correction(likeness(heard(a), heard(a), 0, 1))))
      assert.ok(Math.abs(db) < 1e-6);
    // unrelated sounds are left alone
    const unrelated = correction(likeness(heard(a), heard(b), 0, 1));
    for (let phase = 0; phase <= 1; phase += 0.1) assert.ok(Math.abs(unrelated(phase) - 1) < 0.05);
    // opposite ones cancel in the middle: lifted by 3 dB at most there, and nothing at either end
    const opposite = correction(likeness(heard(a), heard(flip), 0, 1));
    assert.ok(Math.abs(opposite(0.5) - Math.SQRT2) < 1e-9);
    assert.equal(opposite(0), 1);
    assert.equal(opposite(1), 1);
    // and a weight takes it: the fade in and out of the same sound sum to the one sound throughout
    const coming = Weight.fadingIn(0, 1, correction(likeness(heard(a), heard(a), 0, 1)));
    const going = new Weight(-1, 1);
    going.fadeOut(0, 1, correction(likeness(heard(a), heard(a), 0, 1)));
    for (let t = 0; t <= 1; t += 0.05) assert.ok(Math.abs(coming.at(t) + going.at(t) - 1) < 0.01, String(t));
  });
});
