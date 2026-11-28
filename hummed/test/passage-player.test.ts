// The passage player as a page has it (described/passage.ts: `createPassagePlayer`), on a page made
// up for the test: an audio context whose clock the test moves on, timers the test ticks, files that
// are there or not, and workers that say what the test has them say. What a playing tells whoever
// listens, from the asking to the end: that it prepares, plays and stops, once each; that one asked
// for while another is prepared or plays takes its place, and the other stops; that it waits where
// its sound runs out and goes on; and that the piece is performed for the latest asker first.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import {
  createPassagePlayer,
  LEAD,
  type Emphasis,
  type PassagePlayer,
  type PassageRequest,
} from '../src/described/passage.ts';
import type { NotesRequest, Plan, PlanBody, ToWorker } from '../src/shared/protocol.ts';
import { SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';
import { planOf, type Level } from '../src/worker/prepare.ts';
import { ROOT } from '../tools/node-support.ts';

const noop = (): void => undefined;
const body = JSON.parse(readFileSync(join(ROOT, 'voice/e100.json'), 'utf8')) as PlanBody;
const mei = readFileSync(join(ROOT, 'reduction/reduction.mei'), 'utf8');

/** A worker's stand-in: it keeps what it is sent, and says what the test has it say. */
class StandIn {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: unknown = null;
  /** Whether it is one of those that render the voice (else the one that performs the piece). */
  readonly voice: boolean;
  readonly got: (ToWorker | NotesRequest)[] = [];

  constructor(_url: string, options?: { name?: string }) {
    this.voice = options?.name === 'voice';
    workers.push(this);
  }

  postMessage(message: ToWorker | NotesRequest): void {
    if (message.type === 'link') for (const port of message.ports) port.close();
    this.got.push(message);
  }

  addEventListener(): void {
    // nothing fails here by itself
  }

  terminate(): void {
    // nothing to let go of
  }

  says(message: unknown): void {
    this.onmessage?.({ data: message });
  }

  /** The last message of a type it was sent. */
  last<T extends (ToWorker | NotesRequest)['type']>(type: T): Extract<ToWorker | NotesRequest, { type: T }> {
    const message = this.got.findLast((m) => m.type === type);
    assert.ok(message, `no ${type} was sent`);
    return message as Extract<ToWorker | NotesRequest, { type: T }>;
  }
}

/** The page's workers, in the order it started them; its clock; and the voice's sources it started. */
let workers: StandIn[] = [];
const now = { time: 0 };
let voiceStarts: { when: number; offset: number }[] = [];

const param = (): object => ({
  value: 1,
  setValueAtTime: noop,
  linearRampToValueAtTime: noop,
  cancelScheduledValues: noop,
  setTargetAtTime: noop,
});

/** An audio context as far as the page uses it; nothing sounds, and its time is the test's. */
class Context {
  readonly state = 'running';
  readonly sampleRate = 48000;
  readonly destination = this.#node();

  get currentTime(): number {
    return now.time;
  }

  #node(more: object = {}): object {
    return { context: this, connect: noop, disconnect: noop, gain: param(), ...more };
  }

  resume = (): Promise<void> => Promise.resolve();
  getOutputTimestamp = (): object => ({ contextTime: 0, performanceTime: 0 });
  createGain = (): object => this.#node();
  createChannelMerger = (): object => this.#node();
  createChannelSplitter = (): object => this.#node();
  createConvolver = (): object => this.#node({ normalize: true, buffer: null });
  createDelay = (): object => this.#node({ delayTime: param() });
  createDynamicsCompressor = (): object =>
    this.#node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });

  /** A buffer; one the voice is handed over in is known by the rate the voice is rendered at. */
  createBuffer = (channels: number, length: number, rate: number): object => ({
    length,
    sampleRate: rate,
    numberOfChannels: channels,
    duration: length / rate,
    voice: channels === 1 && rate === SAMPLE_RATE,
    getChannelData: () => new Float32Array(length),
  });

  decodeAudioData = (): Promise<object> => Promise.resolve(this.createBuffer(1, 48000, 48000));

  createBufferSource(): object {
    const source = {
      buffer: null as { readonly voice?: boolean } | null,
      context: this,
      playbackRate: param(),
      connect: noop,
      stop: noop,
      start(when: number, offset = 0) {
        if (source.buffer?.voice) voiceStarts.push({ when, offset });
      },
    };
    return source;
  }
}

/** The files a page finds: what is hummed and the piano's samples; no recording of voice or piano. */
const found = (url: string): object => {
  const path = new URL(url).pathname;
  if (path === '/hummed/reduction/reduction.mei')
    return { ok: true, status: 200, text: () => Promise.resolve(mei) };
  if (/^\/hummed\/piano\/p\d+v\d+\.mp3$/.test(path))
    return { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
  return { ok: false, status: 404 };
};

/** Let what has been set going come to rest: promises, as far as they wait for nothing but each other. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
}

/** The clock on by `seconds`, the timers with it. */
async function run(seconds: number): Promise<void> {
  for (let k = 0; k < Math.round(seconds * 100); k++) {
    now.time += 0.01;
    mock.timers.tick(10);
    await settle();
  }
}

const voices = (): StandIn[] => workers.filter((worker) => worker.voice);
const planner = (): StandIn => {
  const [first] = voices();
  assert.ok(first, 'no voice worker was started');
  return first;
};

/** The plan a worker answers a request with, as a worker makes it (of the piece's own clock). */
const planFor = (request: Extract<ToWorker, { type: 'plan' }>): Plan => ({
  ...planOf({ plan: body } as unknown as Level, request.id, request.start, request.until),
  setting: request.setting,
});

/** The sound of a plan's passage from `from` seconds of it up to `to`, in blocks as a worker sends them. */
function sound(worker: StandIn, plan: Plan, from: number, to = Infinity): void {
  const end = plan.endState ?? plan.stateCount;
  const state = (seconds: number): number =>
    Math.min(end, plan.startState + Math.round((seconds * SAMPLE_RATE) / STATE_STEP));
  for (let a = state(from); a < state(to); a += 40) {
    const b = Math.min(state(to), a + 40);
    worker.says({
      type: 'audio',
      id: plan.id,
      start: a * STATE_STEP,
      samples: new Float32Array((b - a) * STATE_STEP),
      spectrogram: null,
    });
  }
  if (state(to) === end) worker.says({ type: 'chunkDone', id: plan.id, from: plan.startState, to: end });
}

/** A playing as the test hears of it. */
interface Heard {
  readonly states: string[];
  readonly ticks: number[];
  settled: string | null;
}

function play(player: PassagePlayer, request: PassageRequest): Heard {
  const heard: Heard = { states: [], ticks: [], settled: null };
  player
    .play(request, {
      onState: (state) => heard.states.push(state),
      onTick: (tick) => heard.ticks.push(tick),
    })
    .then(
      () => {
        heard.settled = 'resolved';
      },
      (error: unknown) => {
        heard.settled = `rejected: ${error instanceof Error ? error.message : String(error)}`;
      },
    );
  return heard;
}

const EMPHASIS: Emphasis = { ids: ['tempo_2160', 'tempo_2880'], factor: 1.5, attenuation: 0.35 };
/** Two passages, brought out: neither is rendered ahead, so the workers render them. */
const A: PassageRequest = { from: 2160, to: 4320, elaboration: 1, emphasis: EMPHASIS };
const B: PassageRequest = { from: 4320, to: 5760, elaboration: 1, emphasis: EMPHASIS };
/** How long a passage lasts in the plan the workers answer with. */
const lasts = (plan: Plan): number =>
  (((plan.endState ?? plan.stateCount) - plan.startState) * STATE_STEP) / SAMPLE_RATE;

describe('the passage player', () => {
  const measured = performance.now.bind(performance);
  beforeEach(() => {
    workers = [];
    voiceStarts = [];
    now.time = 1;
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    // how fast sound comes is reckoned by the test's clock too, not by how busy the machine is
    performance.now = () => now.time * 1000;
    Object.assign(globalThis, {
      location: { href: 'http://localhost/described/' },
      AudioContext: Context,
      Worker: StandIn,
      DOMParser,
      fetch: (url: string) => Promise.resolve(found(url)),
      requestAnimationFrame: (frame: () => void) => setTimeout(frame, 16),
      cancelAnimationFrame: (frame: ReturnType<typeof setTimeout>) => {
        clearTimeout(frame);
      },
    });
  });
  afterEach(() => {
    mock.timers.reset();
    performance.now = measured;
  });

  it('prepares a passage the workers render, plays it to its end and stops, once each', async () => {
    const player = createPassagePlayer();
    const heard = play(player, A);
    await settle();
    assert.deepEqual(heard.states, ['preparing']);
    // asked of the first worker: the setting with what is brought out, the passage and no more
    const request = planner().last('plan');
    assert.deepEqual(request.start, { tick: A.from - LEAD });
    assert.deepEqual(request.until, { tick: A.to });
    assert.deepEqual(request.setting, { elaboration: 1, emphasis: EMPHASIS });
    assert.equal(request.share, 0);
    const plan = planFor(request);
    planner().says(plan);
    await settle();
    assert.deepEqual(heard.states, ['preparing']);
    // its first half second is enough to begin with
    sound(planner(), plan, 0, 0.5);
    await settle();
    assert.deepEqual(heard.states, ['preparing', 'playing']);
    assert.equal(heard.settled, 'resolved');
    assert.ok(voiceStarts.length > 0, 'the voice is handed over');
    sound(planner(), plan, 0.5);
    await run(lasts(plan) - 0.2);
    assert.deepEqual(heard.states, ['preparing', 'playing']);
    await run(1);
    assert.deepEqual(heard.states, ['preparing', 'playing', 'stopped']);
    // the playhead from the passage's first tick to its last, never back
    assert.equal(heard.ticks[0], A.from);
    assert.equal(heard.ticks.at(-1), A.to);
    assert.ok(heard.ticks.every((tick, i) => i === 0 || tick >= heard.ticks[i - 1]));
    // the same passage again is there at once: nothing is asked of the workers
    const asked = planner().got.length;
    const again = play(player, A);
    await settle();
    assert.deepEqual(again.states, ['playing']);
    assert.equal(planner().got.length, asked);
    await run(lasts(plan) + 1);
    assert.deepEqual(again.states, ['playing', 'stopped']);
  });

  it('plays the passage at the piece’s first tick every time, wherever the clock stands', async () => {
    // What the first remark of the described page asks for. Its sound begins on the edge of a 10 ms
    // slot (0.6 s, the silence before the music); placed at the clock's times below (those of a
    // browser at the trials that stalled, and others), its lane began a hair before that, and the
    // passage waited for ever for sound that had come: 'preparing' after 'playing', or 'playing'
    // and nothing after.
    const opening: PassageRequest = { from: 0, to: 1440, elaboration: 0.86, emphasis: EMPHASIS };
    const clocks = [
      1.582,
      1.622,
      1.591,
      1.652,
      1.562,
      ...Array.from({ length: 12 }, (_, k) => 0.7 + k * 0.173),
    ];
    for (const clock of clocks) {
      workers = [];
      voiceStarts = [];
      now.time = clock;
      const player = createPassagePlayer();
      const heard = play(player, opening);
      await settle();
      const plan = planFor(planner().last('plan'));
      planner().says(plan);
      // as it comes: half a second, on which it starts; the rest while it plays
      sound(planner(), plan, 0, 0.5);
      await settle();
      assert.deepEqual(heard.states, ['preparing', 'playing'], `at ${clock}`);
      assert.ok(voiceStarts.length > 0, `the voice is handed over at ${clock}`);
      await run(0.1);
      sound(planner(), plan, 0.5);
      await run(lasts(plan) + 1);
      assert.deepEqual(heard.states, ['preparing', 'playing', 'stopped'], `at ${clock}`);
      assert.equal(heard.ticks.at(-1), opening.to);
    }
  });

  it('stops a passage that is prepared when another is asked for, and plays that one', async () => {
    const player = createPassagePlayer();
    const first = play(player, A);
    await settle();
    const asked = planner().last('plan');
    const second = play(player, B);
    await settle();
    // the first is over, and whoever waited for it is told
    assert.deepEqual(first.states, ['preparing', 'stopped']);
    assert.equal(first.settled, 'resolved');
    assert.deepEqual(second.states, ['preparing']);
    // the workers are asked for the second: a newer request, which they give way to
    const request = planner().last('plan');
    assert.ok(request.id > asked.id);
    assert.deepEqual(request.until, { tick: B.to });
    // what still comes of the first is of no moment
    const late = planFor(asked);
    planner().says(late);
    sound(planner(), late, 0);
    await run(0.2);
    assert.deepEqual(second.states, ['preparing']);
    const plan = planFor(request);
    planner().says(plan);
    sound(planner(), plan, 0);
    await run(lasts(plan) + 1);
    assert.deepEqual(second.states, ['preparing', 'playing', 'stopped']);
    assert.equal(second.settled, 'resolved');
    assert.deepEqual(first.states, ['preparing', 'stopped']);
  });

  it('stops a passage that plays when another is asked for', async () => {
    const player = createPassagePlayer();
    const first = play(player, A);
    await settle();
    const plan = planFor(planner().last('plan'));
    planner().says(plan);
    sound(planner(), plan, 0);
    await run(1);
    assert.deepEqual(first.states, ['preparing', 'playing']);
    const second = play(player, B);
    await settle();
    assert.deepEqual(first.states, ['preparing', 'playing', 'stopped']);
    const next = planFor(planner().last('plan'));
    assert.ok(next.id > plan.id);
    planner().says(next);
    sound(planner(), next, 0);
    await run(lasts(next) + 1);
    assert.deepEqual(second.states, ['preparing', 'playing', 'stopped']);
    // the first says nothing more, and its playhead stays where it was stopped
    assert.deepEqual(first.states, ['preparing', 'playing', 'stopped']);
    assert.ok((first.ticks.at(-1) ?? 0) < A.to);
  });

  it('stops a passage that is prepared, and has the workers stop', async () => {
    const player = createPassagePlayer();
    const heard = play(player, A);
    await settle();
    const asked = planner().last('plan');
    player.stop();
    await settle();
    assert.deepEqual(heard.states, ['preparing', 'stopped']);
    assert.equal(heard.settled, 'resolved');
    for (const worker of voices()) assert.ok(worker.last('stop').id > asked.id);
    // its sound, coming after all, is not played
    const plan = planFor(asked);
    planner().says(plan);
    sound(planner(), plan, 0);
    await run(1);
    assert.deepEqual(heard.states, ['preparing', 'stopped']);
    assert.equal(voiceStarts.length, 0);
    // and the same passage asked for again is rendered again
    const again = play(player, A);
    await settle();
    assert.ok(planner().last('plan').id > asked.id);
    assert.deepEqual(again.states, ['preparing']);
  });

  it('waits where its sound runs out, and goes on from there when more has come', async () => {
    const player = createPassagePlayer();
    const heard = play(player, A);
    await settle();
    const plan = planFor(planner().last('plan'));
    planner().says(plan);
    // not quite a second of it, and then nothing for a while: workers slower than the music
    sound(planner(), plan, 0, 0.9);
    await run(0.5);
    assert.deepEqual(heard.states, ['preparing', 'playing']);
    await run(1);
    assert.deepEqual(heard.states, ['preparing', 'playing', 'preparing']);
    const reached = heard.ticks.at(-1) ?? 0;
    assert.ok(reached > A.from && reached < A.to, `reached ${reached}`);
    await run(2);
    assert.deepEqual(heard.states, ['preparing', 'playing', 'preparing']);
    // the rest comes: on from where it stopped, to the end
    sound(planner(), plan, 0.9);
    await run(lasts(plan) + 1);
    assert.deepEqual(heard.states, ['preparing', 'playing', 'preparing', 'playing', 'stopped']);
    assert.equal(heard.ticks.at(-1), A.to);
    assert.ok(heard.ticks.every((tick, i) => i === 0 || tick >= heard.ticks[i - 1]));
  });

  it('refuses a passage where no worker can render it, and says why', async () => {
    const player = createPassagePlayer();
    const heard = play(player, A);
    await settle();
    // each worker in turn is asked for the plan, and fails
    for (let k = voices().length; k > 0; k--) {
      const failing = voices().findLast((worker) => worker.got.some((m) => m.type === 'plan'));
      assert.ok(failing);
      failing.says({ type: 'error', id: failing.last('plan').id, message: 'no VocalTractLab here' });
      await settle();
    }
    await run(0.1);
    assert.deepEqual(heard.states, ['preparing', 'stopped']);
    assert.match(heard.settled ?? '', /^rejected: the voice could not be rendered: no VocalTractLab here/);
    // the next passage starts workers anew
    const before = voices().length;
    play(player, B);
    await settle();
    assert.ok(voices().length > before);
  });

  it('has the piece performed for the latest asker first, one at a time, and keeps what was performed', async () => {
    const player = createPassagePlayer();
    const answers: string[] = [];
    const ask = (name: string, emphasis?: Emphasis): Promise<unknown> =>
      player.notes(emphasis).then((notes) => {
        answers.push(`${name}: ${notes.size}`);
        return notes;
      });
    const strength = (factor: number): Emphasis => ({ ...EMPHASIS, factor });
    const plain = ask('as it is');
    const failing = ask('1.2', strength(1.2)).catch((error: unknown) => {
      answers.push(`1.2: ${String(error)}`);
    });
    void ask('1.3', strength(1.3));
    void ask('1.4', strength(1.4));
    await settle();
    const performer = workers.find((worker) => !worker.voice);
    assert.ok(performer);
    const requests = (): NotesRequest[] => performer.got.filter((m) => m.type === 'notes');
    const answer = (request: NotesRequest, count: number): void => {
      performer.says({
        type: 'notes',
        id: request.id,
        notes: Array.from({ length: count }, (_, i) => [`n${i}`, { on: i, off: i + 1, velocity: 40 }]),
      });
    };
    // one at a time: the first asked is at work, the others wait
    assert.equal(requests().length, 1);
    assert.equal(requests()[0].emphasis, undefined);
    answer(requests()[0], 476);
    await settle();
    // then the one asked for last
    assert.equal(requests().length, 2);
    assert.equal(requests()[1].emphasis?.factor, 1.4);
    answer(requests()[1], 4);
    await settle();
    assert.equal(requests()[2].emphasis?.factor, 1.3);
    answer(requests()[2], 3);
    await settle();
    assert.equal(requests()[3].emphasis?.factor, 1.2);
    performer.says({ type: 'notes-failed', id: requests()[3].id, message: 'no score' });
    await settle();
    await failing;
    assert.deepEqual(answers, ['as it is: 476', '1.4: 4', '1.3: 3', '1.2: Error: no score']);
    // what was performed is kept; what failed is asked for anew
    assert.equal(await player.notes(), await plain);
    assert.equal(requests().length, 4);
    void player.notes(strength(1.2)).catch(noop);
    await settle();
    assert.equal(requests().length, 5);
  });
});
