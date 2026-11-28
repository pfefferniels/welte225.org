// A passage played alone (described/passage.ts), on an audio graph made up for the test and the
// plans of the voice rendered ahead (voice/): where it lies in a rendering through the rendering's
// clock, and so in the recording's buffer; how it fades in up to its first tick and is gone at its
// end, with nothing handed over past it; and when one the workers render can begin to play.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { canPlay, laneOf, LEAD, stretchOf } from '../src/described/passage.ts';
import type { AudioGraph } from '../src/page/audio-graph.ts';
import { mix } from '../src/page/mix.ts';
import type { PianoOutput } from '../src/page/outputs.ts';
import { Rendering, renderingId } from '../src/page/rendering.ts';
import { interp } from '../src/shared/math.ts';
import type { Plan, PlanBody } from '../src/shared/protocol.ts';
import { PAD_MS, SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';

const planOf = (name: string): PlanBody =>
  JSON.parse(readFileSync(new URL(`../voice/${name}.json`, import.meta.url), 'utf8')) as PlanBody;

/** A setting rendered ahead: its sound a buffer (of nothing), the rendering's first sample `lead` into it. */
function recorded(name: string, lead = 0): Rendering {
  const plan = planOf(name);
  const whole = {
    length: Math.ceil(plan.duration * SAMPLE_RATE) + lead,
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
    duration: plan.duration,
    getChannelData: () => new Float32Array(0),
  } as unknown as AudioBuffer;
  return new Rendering({ ...plan, id: renderingId(), startSeconds: 0, startState: 0 }, whole, name, lead);
}

/** What the page did with a gain: the values it is to reach, and when. */
interface Ramp {
  readonly value: number;
  readonly when: number;
}

/**
 * An audio graph as far as a lane uses it, at a context time the test sets; nothing sounds. It keeps
 * the sources started (when, and how far into their buffer) and the ramps of the lane's weight (the
 * one gain a lane ramps: its mix is set once).
 */
function fakeGraph(now: { time: number }) {
  const sources: { when: number; offset: number; stoppedAt: number | undefined }[] = [];
  const ramps: Ramp[] = [];
  const node = (): object => ({
    connect: () => undefined,
    disconnect: () => undefined,
    gain: {
      value: 1,
      setValueAtTime: (value: number, when: number) => ramps.push({ value, when }),
      linearRampToValueAtTime: (value: number, when: number) => ramps.push({ value, when }),
      // a fade out takes the place of whatever was to come after it begins
      cancelScheduledValues: (from: number) => {
        for (let i = ramps.length - 1; i >= 0; i--) if (ramps[i].when >= from) ramps.splice(i, 1);
      },
    },
  });
  const context = {
    get currentTime() {
      return now.time;
    },
    sampleRate: 48000,
    createGain: node,
    createChannelMerger: node,
    createChannelSplitter: node,
    createBufferSource() {
      const source = {
        buffer: null as unknown,
        context,
        playbackRate: { value: 1 },
        connect: () => undefined,
        start(when: number, offset = 0) {
          sources.push({ when, offset, stoppedAt: undefined });
        },
        stop: () => undefined,
      };
      return source;
    },
  } as unknown as AudioContext;
  const sink = node();
  const graph = { context, master: sink, hum: sink, piano: sink, harmonies: sink } as unknown as AudioGraph;
  return { graph, sources, ramps };
}

/** A piano that keeps what it is handed: from where it plays, and every stretch after. */
function fakePiano() {
  const played: { t: number; when: number }[] = [];
  const handed: { from: number; until: number }[] = [];
  const piano = {
    lead: 0,
    fades: true,
    ready: () => true,
    play: (_rendering: Rendering, t: number, when: number) => {
      played.push({ t, when });
      return {
        schedule: (from: number, until: number) => handed.push({ from, until }),
        stop: () => undefined,
      };
    },
    stop: () => undefined,
  } as unknown as PianoOutput;
  return { piano, played, handed };
}

const near = (a: number, b: number, within = 1e-9): boolean => Math.abs(a - b) < within;

describe('a passage in a rendering', () => {
  const plan = planOf('e100');
  const rendering = recorded('e100');
  const at = (tick: number): number => interp(tick, plan.clock.ticks, plan.clock.ms) / 1000 + PAD_MS / 1000;

  it('lies where the rendering’s clock has its ticks, its sound beginning a little before', () => {
    const stretch = stretchOf(rendering, 2160, 4320);
    assert.equal(stretch.from, at(2160));
    assert.equal(stretch.to, at(4320));
    assert.equal(stretch.begin, at(2160 - LEAD));
    // some 40 ms before, at Grünfeld's tempo
    assert.ok(stretch.from - stretch.begin > 0.02 && stretch.from - stretch.begin < 0.08);
    assert.ok(stretch.to - stretch.from > 3 && stretch.to - stretch.from < 4);
  });

  it('begins with the piece where nothing comes before it, and ends with it', () => {
    const first = plan.clock.ticks[0];
    const stretch = stretchOf(rendering, first, 1e9);
    assert.equal(stretch.begin, stretch.from);
    assert.equal(stretch.to, plan.clock.ms[plan.clock.ms.length - 1] / 1000 + PAD_MS / 1000);
  });

  it('lies elsewhere in a setting gone through faster, by that setting’s own clock', () => {
    const fast = stretchOf(recorded('e000'), 2160, 4320);
    const slow = stretchOf(rendering, 2160, 4320);
    assert.ok(fast.from < slow.from && fast.to - fast.from < (slow.to - slow.from) / 2);
  });
});

describe('a passage as it sounds', () => {
  // the rendering's first sample 1105 samples into the decoded sound, as a decoder may leave it
  const LEAD_SAMPLES = 1105;
  const rendering = recorded('e100', LEAD_SAMPLES);
  const stretch = stretchOf(rendering, 2160, 4320);
  const mixed = mix(1);

  it('plays the recording from where the passage lies in its buffer', () => {
    const now = { time: 9.94 };
    const { graph, sources } = fakeGraph(now);
    const { piano, played } = fakePiano();
    const lane = laneOf(graph, rendering, stretch, mixed, piano, 10);
    lane.schedule(now.time, 2, 0);
    // the voice, whole, as one source: at the passage's beginning in the buffer, the decoder's lead with it
    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.when, 10);
    assert.ok(near(sources[0]?.offset ?? NaN, stretch.begin + LEAD_SAMPLES / SAMPLE_RATE));
    // and the piano from the same place, at the same moment
    assert.deepEqual(played, [{ t: stretch.begin, when: 10 }]);
    assert.ok(near(lane.position(10), stretch.begin));
    assert.ok(near(lane.at(stretch.to), 10 + stretch.to - stretch.begin));
  });

  it('fades in up to its first tick and is gone at its end', () => {
    const now = { time: 9.94 };
    const { graph, ramps } = fakeGraph(now);
    const lane = laneOf(graph, rendering, stretch, mixed, fakePiano().piano, 10);
    const first = lane.at(stretch.from);
    const end = lane.at(stretch.to);
    assert.equal(lane.weight.at(10), 0);
    assert.ok(lane.weight.at((10 + first) / 2) > 0.5);
    assert.equal(lane.weight.at(first), 1);
    assert.equal(lane.weight.at(end - 0.13), 1);
    assert.ok(lane.weight.at(end - 0.06) < 0.8);
    assert.equal(lane.weight.at(end), 0);
    assert.ok(near(lane.weight.end ?? NaN, end));
    // as the audio graph was told: nothing after the end, and nothing there
    const last = ramps.reduce((a, b) => (b.when > a.when ? b : a));
    assert.ok(near(last.when, end) && last.value === 0);
  });

  it('hands nothing over past its end, however far ahead it is asked', () => {
    const now = { time: 9.94 };
    const { graph } = fakeGraph(now);
    const { piano, handed } = fakePiano();
    const lane = laneOf(graph, rendering, stretch, mixed, piano, 10);
    const end = lane.at(stretch.to);
    for (; now.time < end + 1; now.time += 0.05) lane.schedule(now.time, 2, 0);
    assert.equal(handed[0]?.from, stretch.begin);
    // up to the end, and the few ms a lane hands over beyond what is heard (at nothing by then)
    const furthest = Math.max(...handed.map((h) => h.until));
    assert.ok(furthest >= stretch.to && furthest <= stretch.to + 0.021, `${furthest - stretch.to}`);
  });

  it('goes on from where it had to wait for sound, fading in there', () => {
    const now = { time: 20 };
    const { graph, sources } = fakeGraph(now);
    const { piano, played } = fakePiano();
    const t = stretch.from + 1.5;
    const lane = laneOf(graph, rendering, stretch, mixed, piano, 20.06, t);
    lane.schedule(now.time, 2, 0);
    assert.ok(near(sources[0]?.offset ?? NaN, t + LEAD_SAMPLES / SAMPLE_RATE));
    assert.deepEqual(played, [{ t, when: 20.06 }]);
    assert.equal(lane.weight.at(20.06), 0);
    assert.equal(lane.weight.at(20.06 + 0.02), 1);
    assert.ok(near(lane.weight.end ?? NaN, 20.06 + stretch.to - t));
  });

  it('is short where the passage is: a fade in, and out at once', () => {
    const brief = { begin: 5, from: 5.03, to: 5.1 };
    const { graph } = fakeGraph({ time: 0 });
    const lane = laneOf(graph, rendering, brief, mixed, fakePiano().piano, 1);
    assert.equal(lane.weight.at(1), 0);
    assert.ok(lane.weight.at(1.03) > 0.9);
    assert.equal(lane.weight.at(1.1), 0);
    assert.ok(near(lane.weight.end ?? NaN, 1.1));
  });
});

describe('a passage the workers render', () => {
  // from tick 2160 to 4320 of the piece at the top of the fader, as a worker plans it
  const body = planOf('e100');
  const begin = interp(2160 - LEAD, body.clock.ticks, body.clock.ms) / 1000 + PAD_MS / 1000;
  const end = interp(4320, body.clock.ticks, body.clock.ms) / 1000 + PAD_MS / 1000;
  const slot = SAMPLE_RATE / 100;
  const plan: Plan = {
    ...body,
    id: renderingId(),
    startSeconds: begin,
    startState: Math.floor((Math.floor(begin * 100) * slot) / STATE_STEP),
    endState: Math.ceil((Math.ceil(end * 100) * slot) / STATE_STEP),
  };
  /** The sound of tract states [from, to), as a worker sends it. */
  const sound = (from: number, to: number) => ({
    type: 'audio' as const,
    id: plan.id,
    start: from * STATE_STEP,
    samples: new Float32Array((to - from) * STATE_STEP),
    spectrogram: null,
  });
  const first = plan.startState;
  const last = plan.endState ?? 0;

  it('can play once its first sound has come, where the rest comes faster than it plays', () => {
    const rendering = new Rendering(plan);
    assert.ok(!canPlay(rendering, begin, end));
    // a tenth of a second is not enough
    rendering.receive(sound(first, first + 40));
    assert.ok(!canPlay(rendering, begin, end));
    // half a second, come at once: far faster than it plays
    rendering.receive(sound(first + 40, first + 200));
    assert.ok(rendering.speed() > 2);
    assert.ok(canPlay(rendering, begin, end));
    assert.ok(!rendering.rendered(begin, end));
  });

  it('has all its sound once the passage has come, though the piece goes on', () => {
    const rendering = new Rendering(plan);
    rendering.receive(sound(first, last));
    assert.ok(rendering.rendered(begin, end));
    // what a lane asks for in pieces of a quarter of a second, the last of them past the end
    assert.ok(rendering.rendered(end - 0.1, end + 0.15));
    assert.ok(canPlay(rendering, begin, end));
    // not what lies before it
    assert.ok(!rendering.rendered(begin - 0.5, end));
  });

  it('waits for more where the sound comes more slowly than it plays', async () => {
    const rendering = new Rendering(plan);
    await new Promise((resolve) => setTimeout(resolve, 600));
    // half a second of sound in over half a second: as far ahead as it would fall behind is not there
    rendering.receive(sound(first, first + 200));
    assert.ok(rendering.speed() < 1);
    assert.ok(!canPlay(rendering, begin, end));
    rendering.receive(sound(first + 200, last));
    assert.ok(canPlay(rendering, begin, end));
  });
});
