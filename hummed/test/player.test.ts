// The transport as it changes settings, on an audio graph made up for the test whose clock the test
// moves on, with the plans of the voice rendered ahead (voice/): a setting faded out is let go of; a
// setting rendered as you listen takes over once it has sound where it begins to be heard; one whose
// recording does not load is rendered, even the first; one rendered whole before it takes over still
// does; settings that sound the same go on into each other without a crossfade; a drag keeps every
// two settings heard together within the bound; and the sound keeps to its timeline where the page's
// thread is late, at a crossfade made while it was held up, and at a pause.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { AudioGraph } from '../src/page/audio-graph.ts';
import type { Mix } from '../src/page/mix.ts';
import type { PianoOutput } from '../src/page/outputs.ts';
import { Player, type ReadySettings } from '../src/page/player.ts';
import type { VoicePool } from '../src/page/pool.ts';
import { counterpart } from '../src/page/alignment.ts';
import { Rendering, renderingId } from '../src/page/rendering.ts';
import { interp } from '../src/shared/math.ts';
import { settingKey, type PlanBody, type Setting, type StartAt } from '../src/shared/protocol.ts';
import { PAD_MS, SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';

/** A value an AudioParam is set to reach: for which context time, and the context's time as it was set. */
interface Ramp {
  readonly when: number;
  readonly setAt: number;
}

/**
 * An AudioParam, a node, a buffer's source, as far as the page uses them; nothing sounds. An
 * AudioParam keeps what it is set to (`set` is told), cancelling apart.
 */
const param = (set: (when: number) => void = () => undefined): AudioParam =>
  ({
    value: 1,
    setValueAtTime: (_value: number, when: number) => {
      set(when);
    },
    linearRampToValueAtTime: (_value: number, when: number) => {
      set(when);
    },
    cancelScheduledValues: () => undefined,
    setTargetAtTime: (_value: number, when: number) => {
      set(when);
    },
  }) as unknown as AudioParam;
interface Source {
  readonly buffer: unknown;
  started: boolean;
  stopped: boolean;
  /** Where it was started: at which context time, how far into its buffer; and when it was stopped. */
  when: number;
  offset: number;
  stoppedAt: number | undefined;
  /** The context time when the page asked for it to start. */
  asked: number;
}

/** A context whose clock the test moves on, which keeps every source the page starts. */
function fakeContext(): {
  context: AudioContext;
  sources: Source[];
  now: { time: number; slow: number };
  ramps: Ramp[];
} {
  // a slow thread: each reading of the time finds it on by `slow`
  const now = { time: 0, slow: 0 };
  const sources: Source[] = [];
  const ramps: Ramp[] = [];
  const node = (): object => ({
    connect: () => undefined,
    disconnect: () => undefined,
    gain: param((when) => ramps.push({ when, setAt: now.time })),
  });
  const context = {
    get currentTime() {
      now.time += now.slow;
      return now.time;
    },
    sampleRate: 48000,
    createGain: node,
    createChannelMerger: node,
    createChannelSplitter: node,
    createBuffer: (_channels: number, length: number) => ({
      length,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource() {
      const source = {
        buffer: null as unknown,
        context,
        playbackRate: { value: 1 },
        started: false,
        stopped: false,
        when: NaN,
        offset: NaN,
        asked: NaN,
        stoppedAt: undefined as number | undefined,
        connect: () => undefined,
        start(when: number, offset = 0) {
          source.started = true;
          source.when = when;
          source.offset = offset;
          source.asked = now.time;
        },
        stop(at?: number) {
          source.stopped = true;
          source.stoppedAt = at;
        },
      };
      sources.push(source);
      return source;
    },
    resume: () => Promise.resolve(),
  } as unknown as AudioContext;
  return { context, sources, now, ramps };
}

const plans = new Map<string, PlanBody>();
const planOf = (elaboration: number): PlanBody => {
  const name = `e${String(Math.round(elaboration * 100)).padStart(3, '0')}`;
  let plan = plans.get(name);
  if (!plan) {
    plan = JSON.parse(readFileSync(new URL(`../voice/${name}.json`, import.meta.url), 'utf8')) as PlanBody;
    plans.set(name, plan);
  }
  return { ...plan, setting: { elaboration } };
};

/** A setting rendered ahead, whole: its sound a buffer (of nothing), what it sounds like as given. */
function recorded(elaboration: number, sound = `sound of ${elaboration}`): Rendering {
  const plan = planOf(elaboration);
  const length = Math.ceil(plan.duration * SAMPLE_RATE);
  const whole = {
    length,
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
    duration: plan.duration,
    getChannelData: () => new Float32Array(0),
    // silence, where a crossfade measures how alike two are
    copyFromChannel: (destination: Float32Array) => destination.fill(0),
  } as unknown as AudioBuffer;
  return new Rendering({ ...plan, id: renderingId(), startSeconds: 0, startState: 0 }, whole, sound);
}

const MIX: Mix = { hum: 0.1, piece: 1, harmonies: 0 };

/** A player on the fake graph, its library holding `ready` (and `coming`, which can change), its pool keeping requests. */
function setUp(ready: readonly Rendering[], coming: (setting: Setting) => boolean = () => false) {
  const { context, sources, now, ramps } = fakeContext();
  const sink = { connect: () => undefined, gain: param() };
  const graph = { context, master: sink, hum: sink, piano: sink, harmonies: sink } as unknown as AudioGraph;
  const piano = {
    lead: 0,
    fades: true,
    ready: () => true,
    play: () => ({ schedule: () => undefined, stop: () => undefined }),
    stop: () => undefined,
  } as unknown as PianoOutput;
  const requests: { id: number; setting: Setting; start: StartAt }[] = [];
  const pool = {
    request: (id: number, setting: Setting, start: StartAt) => requests.push({ id, setting, start }),
  } as unknown as VoicePool;
  const library: ReadySettings = {
    ready: (setting) => ready.find((r) => settingKey(r.setting) === settingKey(setting)) ?? null,
    coming,
    keep: () => undefined,
    used: () => undefined,
  };
  const statuses: string[] = [];
  let tick = (): void => undefined;
  const player = new Player(
    graph,
    piano,
    pool,
    library,
    {
      adopted: () => undefined,
      status: (text) => statuses.push(text),
      playingChanged: () => undefined,
      changed: () => undefined,
    },
    (t) => {
      tick = t;
    },
  );
  for (const r of ready) player.setMix(r.setting, MIX);
  /** The clock on by `seconds`, the transport ticking every 50 ms. */
  const run = (seconds: number): void => {
    for (let k = 0; k < Math.round(seconds / 0.05); k++) {
      now.time += 0.05;
      tick();
    }
  };
  /**
   * The workers' answer to a request: its plan, as a worker plans from where it was asked, and its
   * sound from there to the end; with `whole`, from the beginning up to there too, and done.
   */
  const feed = (request: { id: number; setting: Setting; start: StartAt }, whole = false): void => {
    const plan = planOf(request.setting.elaboration);
    const startSeconds =
      'tick' in request.start
        ? interp(request.start.tick, plan.clock.ticks, plan.clock.ms) / 1000 + PAD_MS / 1000
        : request.start.seconds;
    const slot = SAMPLE_RATE / 100;
    const startState = Math.floor((Math.floor(startSeconds * 100) * slot) / STATE_STEP);
    player.setMix(request.setting, MIX);
    player.receive({ ...plan, type: 'plan', id: request.id, startSeconds, startState });
    const end = (plan.stateCount - 1) * STATE_STEP;
    const send = (from: number, to: number): void => {
      for (let a = from; a < to; a += 4410)
        player.receive({
          type: 'audio',
          id: request.id,
          start: a,
          samples: new Float32Array(Math.min(4410, to - a)),
          spectrogram: null,
        });
    };
    send(startState * STATE_STEP, end);
    if (!whole) return;
    send(0, startState * STATE_STEP);
    player.receive({ type: 'done', id: request.id });
  };
  return {
    player,
    sources,
    requests,
    statuses,
    run,
    feed,
    now,
    ramps,
    tick: () => {
      tick();
    },
  };
}

describe('the transport changing settings', () => {
  it('lets go of a setting once it has faded out', () => {
    const [a, b, c] = [recorded(0.65), recorded(0.7), recorded(0.75)];
    const { player, sources, run } = setUp([a, b, c]);
    player.begin(a.setting);
    player.play();
    run(1);
    player.change(b.setting);
    run(0.1);
    // dragged on before the first crossfade is over
    player.change(c.setting);
    assert.ok(player.blending);
    run(1);
    assert.equal(player.current, c);
    assert.ok(!player.blending, 'settings faded out still sound');
    assert.ok(!player.inUse(a) && !player.inUse(b));
    // their voices stopped: only the last one's source plays on
    const playing = sources.filter((s) => s.started && !s.stopped);
    assert.equal(playing.length, 1);
    assert.equal(playing[0].buffer, c.whole);
  });

  it('takes a setting rendered as you listen over once it has sound where it begins to be heard', () => {
    // asked for while the old one plays, from wherever the playhead is
    const stalled: number[] = [];
    for (let at = 20; at < 59; at += 3) {
      const { player, requests, statuses, run, feed } = setUp([recorded(0.65)]);
      player.begin({ elaboration: 0.65 });
      player.play();
      player.seek(at);
      run(0.2);
      player.change({ elaboration: 0.3 });
      const request = requests.at(-1);
      assert.ok(request);
      feed(request);
      run(5);
      const tookOver = player.current?.id === request.id && player.moving;
      if (!tookOver || statuses.at(-1) === 'Waiting for VocalTractLab…') stalled.push(at);
    }
    assert.deepEqual(stalled, []);
  });

  it('renders the first setting from the beginning where its recording does not load', () => {
    let loading = true;
    const { player, requests, run } = setUp([], () => loading);
    player.begin({ elaboration: 0.65 });
    run(0.2);
    assert.equal(requests.length, 0);
    // its files did not load
    loading = false;
    run(0.1);
    assert.deepEqual(
      requests.map((r) => [r.setting, r.start]),
      [[{ elaboration: 0.65 }, { seconds: 0 }]],
    );
  });

  it('takes a setting over that was rendered whole before the playhead came to it', () => {
    const { player, requests, run, feed } = setUp([recorded(0.65)]);
    player.begin({ elaboration: 0.65 });
    player.play();
    player.seek(60);
    run(0.2);
    player.change({ elaboration: 0.3 });
    const request = requests.at(-1);
    assert.ok(request);
    // the visitor goes back a while; meanwhile the workers render all of it
    player.seek(20);
    feed(request, true);
    run(2);
    assert.equal(player.current?.id, request.id);
    assert.ok(player.moving);
  });

  it('goes on into a setting that sounds the same without a crossfade', () => {
    const [a, b] = [recorded(0.9, 'the same'), recorded(0.95, 'the same')];
    const other = recorded(1, 'another');
    const { player, sources, run } = setUp([a, b, other]);
    player.begin(a.setting);
    player.play();
    run(1);
    const before = sources.length;
    player.change(b.setting);
    run(0.05);
    assert.equal(player.current, b);
    assert.ok(!player.blending);
    assert.equal(player.lastCrossfade, null);
    assert.equal(sources.length, before, 'no new sound was started');
    assert.ok(player.inUse(b) && !player.inUse(a));
    // one that sounds otherwise is crossfaded into
    player.change(other.setting);
    assert.ok(player.blending);
    assert.ok(player.lastCrossfade);
  });

  it('keeps every setting heard with another within 10 ms of it while the fader is dragged', () => {
    const settings = [0.55, 0.6, 0.65, 0.7, 0.75].map((e) => recorded(e));
    for (const [gap, path] of [
      [0.04, [0.65, 0.7, 0.75]],
      [0.14, [0.65, 0.7, 0.75]],
      [0.03, [0.7, 0.65, 0.6, 0.55]],
      [0.02, [0.65, 0.7, 0.75, 0.7, 0.65]],
    ] as const) {
      const { player, now, tick } = setUp(settings);
      player.begin({ elaboration: 0.6 });
      player.play();
      player.seek(20);
      for (let k = 0; k < 10; k++) {
        now.time += 0.05;
        tick();
      }
      let most = 0;
      let power = { least: Infinity, most: 0 };
      const moves = [...path];
      // a millisecond at a time, the transport ticking every 50 ms, the fader moving every `gap`
      for (let ms = 0, next = 0; ms < 2000; ms++) {
        if (moves.length > 0 && ms >= next) {
          const e = moves.shift();
          if (e !== undefined) player.change({ elaboration: e });
          next = ms + gap * 1000;
        }
        now.time += 0.001;
        if (ms % 50 === 0) tick();
        const heard = player.sounding(player.position());
        const total = heard.reduce((sum, h) => sum + h.weight ** 2, 0);
        power = { least: Math.min(power.least, total), most: Math.max(power.most, total) };
        for (const a of heard)
          for (const b of heard)
            if (a !== b && a.weight >= 0.25 && b.weight >= 0.25)
              most = Math.max(most, Math.abs(counterpart(a.rendering.clock, b.rendering.clock, a.t) - b.t));
      }
      assert.ok(
        most <= 0.0101,
        `${path.join(' ')} every ${gap * 1000} ms: ${(most * 1000).toFixed(1)} ms apart`,
      );
      assert.ok(power.least > 0.97 && power.most < 1.03, `power ${power.least}..${power.most}`);
    }
  });

  it('keeps each sound where its timeline puts it when the page’s thread is late', () => {
    const [a, b] = [recorded(0.6), recorded(0.65)];
    const { player, sources, now, run } = setUp([a, b]);
    player.begin(a.setting);
    player.play();
    run(1);
    // from here every reading of the time finds it 100 ms on: the crossfade’s time passes before
    // the sound coming in is started
    now.slow = 0.1;
    player.change(b.setting);
    now.slow = 0;
    const placed = player.lastCrossfade;
    assert.ok(placed);
    const coming = sources.at(-1);
    assert.ok(coming?.buffer === b.whole);
    // started later than asked, and as much further into it: its time 0 where the crossfade put it
    assert.ok(coming.asked > placed.at, 'the place had passed');
    assert.ok(coming.when >= coming.asked);
    assert.ok(Math.abs(coming.when - coming.offset - placed.origin) < 1e-9);
  });

  it('finds a crossfade again whose beginning passed while it was made', () => {
    const [a, b] = [recorded(0.6), recorded(0.65)];
    // measuring how alike the two sound holds the page's thread up, the first time, for 100 ms
    const whole = b.whole;
    assert.ok(whole);
    let stalls = 1;
    const { player, sources, now, ramps, run } = setUp([a, b]);
    whole.copyFromChannel = (destination: Float32Array) => {
      if (stalls-- > 0) now.time += 0.1;
      destination.fill(0);
    };
    player.begin(a.setting);
    player.play();
    run(1);
    ramps.length = 0;
    player.change(b.setting);
    const placed = player.lastCrossfade;
    assert.ok(placed);
    assert.equal(stalls, -1, 'measured again');
    // every ramp of the crossfade lies ahead of the context's time as it was set
    assert.ok(ramps.length > 0);
    for (const ramp of ramps)
      assert.ok(ramp.when >= ramp.setAt, `a ramp for ${ramp.when} set at ${ramp.setAt}`);
    // and the one coming in starts where it is placed
    const coming = sources.at(-1);
    assert.ok(coming?.buffer === b.whole);
    assert.equal(coming.when, placed.at);
    assert.ok(Math.abs(coming.when - coming.offset - placed.origin) < 1e-9);
  });

  it('pauses to the sample, and plays on from there', () => {
    const a = recorded(0.6);
    const { player, sources, now, run } = setUp([a]);
    player.begin(a.setting);
    player.play();
    run(1.3);
    now.time += 0.0123;
    const playing = sources.at(-1);
    assert.ok(playing);
    player.pause();
    // it stops a little ahead, where the audio thread has not been yet, and is kept there
    const stop = playing.stoppedAt;
    assert.ok(stop !== undefined && stop > now.time);
    const position = player.position();
    assert.ok(Math.abs(stop - (playing.when - playing.offset) - position) < 1e-12);
    run(0.5);
    player.play();
    const again = sources.at(-1);
    assert.ok(again && again !== playing);
    assert.ok(Math.abs(again.offset - position) < 1e-12, `${again.offset} after ${position}`);
  });
});
