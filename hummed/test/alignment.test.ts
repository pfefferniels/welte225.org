// Two renderings at different tempi, as a crossfade places them: at the same tick at its midpoint,
// to the sample; apart by no more than the bound wherever both are heard; the crossfade as long as
// that allows. The clocks are made up: steady tempi, and tempi that bend as rubato does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  apartAt,
  counterpart,
  crossfadeFrom,
  fadeInGain,
  fadeOutGain,
  findCrossfade,
  largestMisalignment,
  misalignment,
  olderFades,
  placeCrossfade,
  SEARCH,
  SWITCH,
  weightedHalf,
  type Clock,
  type Placing,
} from '../src/page/alignment.ts';
import { seededRandom } from '../src/shared/math.ts';
import { SAMPLE_RATE } from '../src/shared/units.ts';

const QUARTER = 720;

/** A steady tempo: `ms` a quarter, over `quarters` quarters. */
const steady = (ms: number, quarters = 400): Clock => ({
  ticks: Array.from({ length: quarters + 1 }, (_, i) => i * QUARTER),
  ms: Array.from({ length: quarters + 1 }, (_, i) => i * ms),
});

/** A tempo that bends: each quarter `ms` long, give or take `rubato` of it, as a seeded rubato would. */
function bending(ms: number, rubato: number, seed: number, quarters = 400): Clock {
  const random = seededRandom(seed);
  const ticks = [0];
  const times = [0];
  for (let i = 1; i <= quarters; i++) {
    // two points a quarter, the second off its half
    const length = ms * (1 + random.uniform(-rubato, rubato));
    const split = random.uniform(0.3, 0.7);
    ticks.push((i - 1) * QUARTER + QUARTER * split, i * QUARTER);
    times.push(times[times.length - 1] + length * split, times[times.length - 1] + length);
  }
  return { ticks, ms: times };
}

/** The most two are apart on either side of the midpoint, by sampling every tenth of a millisecond. */
function sampled(from: Clock, to: Clock, tFrom: number, tTo: number, half: number): number {
  let most = 0;
  for (let d = -half; d <= half; d += 0.0001)
    most = Math.max(most, Math.abs(misalignment(from, to, tFrom, tTo, d)));
  return Math.max(most, Math.abs(misalignment(from, to, tFrom, tTo, half)));
}

describe('two renderings aligned through the score', () => {
  it('finds the same tick in the other, and runs on at its own pace beyond the score', () => {
    const slow = steady(500);
    const fast = steady(250);
    // 600 ms of silence before the music in each
    assert.equal(counterpart(slow, fast, 0.6 + 1), 0.6 + 0.5);
    assert.equal(counterpart(fast, slow, 0.6 + 0.5), 0.6 + 1);
    // before the first tick and after the last, time passes as it does
    assert.equal(counterpart(slow, fast, 0.1), 0.1);
    const end = (400 * 500) / 1000 + 0.6;
    assert.ok(Math.abs(counterpart(slow, fast, end + 2) - ((400 * 250) / 1000 + 0.6 + 2)) < 1e-9);
    // one rendering is where it is in itself
    const rubato = bending(500, 0.3, 1);
    for (const t of [0, 0.3, 5.123, 77.7, 300])
      assert.ok(Math.abs(counterpart(rubato, rubato, t) - t) < 1e-9);
  });

  it('is apart by nothing at the midpoint, to the sample', () => {
    for (const [from, to] of [
      [steady(500), steady(208)],
      [bending(500, 0.3, 2), bending(357, 0.25, 3)],
      [bending(714, 0.4, 4), steady(250)],
    ] as const)
      for (const start of [1, 10.5, 33.333, 101.01]) {
        const fade = crossfadeFrom(from, to, start, SWITCH);
        assert.equal(misalignment(from, to, fade.from, fade.to, 0), 0);
        // and in samples, where the page places the one coming in
        assert.equal(Math.round((counterpart(from, to, fade.from) - fade.to) * SAMPLE_RATE), 0);
      }
  });

  it('drifts apart away from the midpoint as far as the tempi differ', () => {
    // the one coming in twice as fast: half of every second apart
    const fade = { from: 10.6, to: 0.6 + 5 };
    const slow = steady(500);
    const fast = steady(250);
    for (const d of [-0.2, -0.05, 0.05, 0.2]) {
      const apart = misalignment(slow, fast, fade.from, fade.to, d);
      assert.ok(Math.abs(apart + d / 2) < 1e-12, `${d}: ${apart}`);
    }
  });

  it('finds the most they are apart at a bend of either clock or an end', () => {
    for (let seed = 10; seed < 30; seed++) {
      const from = bending(480, 0.35, seed);
      const to = bending(300, 0.35, seed + 100);
      const tFrom = 3 + seed * 2.7;
      const tTo = counterpart(from, to, tFrom);
      for (const half of [0.01, 0.07, 0.3]) {
        const exact = largestMisalignment(from, to, tFrom, tTo, half);
        assert.ok(Math.abs(exact - sampled(from, to, tFrom, tTo, half)) < 2e-5, `${seed} ${half}`);
      }
    }
  });

  it('is as long as keeps them within 10 ms wherever each is heard at a quarter of its level or more', () => {
    // where each is at least a quarter of itself: the middle two thirds of an equal-power crossfade
    const half = weightedHalf(1, SWITCH.weight);
    assert.ok(Math.abs(fadeInGain(0.5 - half) - 0.25) < 1e-12);
    assert.ok(Math.abs(fadeOutGain(0.5 + half) - 0.25) < 1e-12);
    const report: string[] = [];
    for (const [name, from, to] of [
      ['the same tempo', steady(500), steady(500)],
      ['×1.05', steady(500), steady(500 / 1.05)],
      ['×1.25', steady(500), steady(400)],
      ['×2.4 against ×0.7', steady(1000 / 0.7), steady(1000 / 2.4)],
      ['rubato against rubato', bending(500, 0.3, 7), bending(450, 0.3, 8)],
    ] as const) {
      let longest = 0;
      let most = 0;
      for (let start = 2; start < 150; start += 3.7) {
        const fade = crossfadeFrom(from, to, start, SWITCH);
        const apart = sampled(from, to, fade.from, fade.to, weightedHalf(fade.length, SWITCH.weight));
        longest = Math.max(longest, fade.length);
        most = Math.max(most, apart);
        assert.ok(apart <= SWITCH.bound + 1e-9, `${name} at ${start}: ${apart}`);
        assert.ok(fade.length <= SWITCH.longest && fade.length >= SWITCH.shortest);
      }
      report.push(
        `${name}: up to ${(longest * 1000).toFixed(0)} ms long, ${(most * 1000).toFixed(2)} ms apart`,
      );
    }
    // the same tempo crossfades as long as it may; very different tempi briefly
    assert.equal(crossfadeFrom(steady(500), steady(500), 10, SWITCH).length, SWITCH.longest);
    assert.ok(crossfadeFrom(steady(500), steady(400), 10, SWITCH).length < 0.2);
    console.log(report.join('\n'));
  });

  it('never goes shorter than its shortest, however far apart they are then', () => {
    // into one twenty times as slow
    const fade = crossfadeFrom(steady(100), steady(2000), 20, SWITCH);
    assert.equal(fade.length, SWITCH.shortest);
    assert.ok(fade.apart > SWITCH.bound);
  });
});

describe('where a crossfade is placed', () => {
  const onsetAt = (clock: Clock, time: number): boolean =>
    clock.ms.some((ms) => Math.abs(ms / 1000 + 0.6 - time) < 1e-9);

  it('waits for a place where the two keep together, where they cannot at once', () => {
    // the half notes hurried (0.05) into the piece struck again (0.65), in bar 6′: the piece spends
    // half a second on a grace note's figure that the reduction passes in a few milliseconds
    const clock = (name: string): Clock =>
      (
        JSON.parse(readFileSync(new URL(`../voice/${name}.json`, import.meta.url), 'utf8')) as {
          clock: Clock;
        }
      ).clock;
    const reduction = clock('e005');
    const piece = clock('e065');
    let worstAtOnce = 0;
    let worstFound = 0;
    let latest = 0;
    for (let start = 33; start < 34; start += 0.005) {
      const atOnce = placeCrossfade(reduction, 0, piece, start, SWITCH);
      const found = findCrossfade(reduction, 0, piece, start, SWITCH);
      worstAtOnce = Math.max(worstAtOnce, atOnce.apart);
      worstFound = Math.max(worstFound, found.apart);
      latest = Math.max(latest, found.at - start);
      assert.ok(found.at >= start - 1e-12);
      // where it is placed, the two are at the same tick at its midpoint
      assert.ok(Math.abs(counterpart(reduction, piece, found.mid) - (found.mid - found.origin)) < 1e-9);
    }
    assert.ok(worstAtOnce > 0.05, `at once ${worstAtOnce}`);
    assert.ok(worstFound <= SWITCH.bound + 1e-9, `found ${worstFound}`);
    assert.ok(latest <= SEARCH.ahead * 2 + 1e-9);
  });

  it('centres a crossfade on a note struck in both, beginning hardly later', () => {
    const a = bending(500, 0.1, 21);
    const b = bending(480, 0.1, 22);
    let centred = 0;
    let n = 0;
    for (let start = 3; start < 60; start += 0.37) {
      const found = findCrossfade(a, 0, b, start, SWITCH);
      n++;
      assert.ok(found.apart <= SWITCH.bound + 1e-9);
      assert.ok(found.length >= SEARCH.decent - 1e-9);
      if (onsetAt(a, found.mid)) {
        centred++;
        assert.ok(found.at - start <= SEARCH.snap + 1e-9);
      }
    }
    assert.ok(centred > n / 3, `${centred} of ${n}`);
  });

  it('begins at once where the tempi are too far apart for a longer one anywhere', () => {
    const fast = steady(1000 / 2.4);
    const slow = steady(1000 / 0.7);
    for (const start of [5, 17.3, 40.04]) {
      const found = findCrossfade(slow, 0, fast, start, SWITCH);
      assert.ok(found.apart <= SWITCH.bound);
      assert.ok(found.length < SEARCH.decent);
      // centred on a strike if one is within reach, else at once
      assert.ok(found.at - start <= SEARCH.snap + 1e-9);
    }
  });
});

describe('the fader moved on while settings blend', () => {
  it('fades each older setting out of hearing before it is further apart than the bound from any it is heard with', () => {
    const quarter = (ms: number): Placing & { readonly weight: number } => ({
      clock: steady(ms),
      origin: 0,
      weight: 1,
    });
    // an older one at one tempo, the one that came in last at another, and the one coming in at a third
    for (const [older, target, coming] of [
      [500, 450, 400],
      [500, 430, 560],
      [700, 480, 300],
    ] as const) {
      const a = quarter(older);
      // the target came in 50 ms ago, placed against the older one at its midpoint
      const first = placeCrossfade(a.clock, 0, steady(target), 10, SWITCH);
      const t: Placing = { clock: steady(target), origin: first.origin };
      const placed = findCrossfade(t.clock, t.origin, steady(coming), 10.05, SWITCH);
      const incoming: Placing = { clock: steady(coming), origin: placed.origin };
      const weight = fadeOutGain((placed.at - first.at) / first.length);
      const [length] = olderFades([{ ...a, weight }], t, incoming, placed, SWITCH);
      assert.ok(length <= placed.length && length >= SWITCH.shortest);
      // while the older one is at a quarter or more, it is within the bound of the target, and of
      // the one coming in wherever that is at a quarter
      const heardIn = placed.at + (placed.length * 2 * Math.asin(SWITCH.weight)) / Math.PI;
      for (let time = placed.at; time < placed.at + length; time += 0.0005) {
        if (weight * fadeOutGain((time - placed.at) / length) < SWITCH.weight) break;
        assert.ok(Math.abs(apartAt(a, t, time)) <= SWITCH.bound + 1e-6);
        if (time >= heardIn) assert.ok(Math.abs(apartAt(a, incoming, time)) <= SWITCH.bound + 1e-6);
      }
    }
  });

  it('leaves alone an older one that is out of hearing already', () => {
    const [length] = olderFades(
      [{ clock: steady(500), origin: 0, weight: 0.2 }],
      { clock: steady(400), origin: 0 },
      { clock: steady(300), origin: 0 },
      { at: 10, length: 0.3 },
      SWITCH,
    );
    assert.equal(length, 0.3);
  });
});
