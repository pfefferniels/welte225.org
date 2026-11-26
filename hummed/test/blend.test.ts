// The weights of settings sounding at once: a crossfade fades every one from where it is while the
// new one comes in, so their powers sum to one however often the fader moves on; the course is
// what an AudioParam plays as linear ramps between its points.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FADE_STEP, power, Weight } from '../src/page/blend.ts';
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
});
