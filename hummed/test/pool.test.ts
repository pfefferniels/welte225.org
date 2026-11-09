import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkOrder, VoicePool, type PoolWorker, type VoiceEvent } from '../src/page/pool.ts';
import type { FromWorker, Plan, Setting, ToWorker } from '../src/shared/protocol.ts';
import { STATE_STEP } from '../src/shared/units.ts';

/** That the chunks cover [0, count) exactly once. */
function assertCovers(chunks: readonly (readonly [number, number])[], count: number): void {
  const sorted = [...chunks].sort((a, b) => a[0] - b[0]);
  assert.equal(sorted[0]?.[0], 0);
  assert.equal(sorted.at(-1)?.[1], count);
  for (let i = 1; i < sorted.length; i++) assert.equal(sorted[i]?.[0], sorted[i - 1]?.[1]);
}

describe('chunkOrder', () => {
  const plan = { stateCount: 10000, seams: [2000, 5000, 5100, 8000, 9900] };
  it('cuts at the seams, joining chunks that would be too short', () => {
    const chunks = chunkOrder({ ...plan, startState: 0 });
    assert.deepEqual(chunks, [
      [0, 2000],
      [2000, 5000],
      [5000, 8000],
      [8000, 10000],
    ]);
  });
  it('starts where playback starts and comes round to it', () => {
    const chunks = chunkOrder({ ...plan, startState: 6000 });
    assert.deepEqual(chunks[0], [6000, 8000]);
    assert.deepEqual(chunks.at(-1), [5000, 6000]);
    assertCovers(chunks, plan.stateCount);
  });
  it('starts at a seam without splitting', () => {
    const chunks = chunkOrder({ ...plan, startState: 5000 });
    assert.deepEqual(chunks[0], [5000, 8000]);
    assert.equal(chunks.length, 4);
    assertCovers(chunks, plan.stateCount);
  });
  it('renders in one piece without seams', () => {
    assert.deepEqual(chunkOrder({ stateCount: 500, seams: [], startState: 0 }), [[0, 500]]);
  });
});

/** A worker's stand-in: keeps what the pool sends it, and says what the test has it say. */
class StandIn implements PoolWorker {
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  terminated = false;
  readonly #got: ToWorker[] = [];

  postMessage(message: ToWorker): void {
    if (message.type === 'link') for (const port of message.ports) port.close();
    this.#got.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  says(message: FromWorker): void {
    this.onmessage?.({ data: message } as MessageEvent<FromWorker>);
  }

  /** What the pool has sent since this was last asked, each message as its type and what tells it apart. */
  got(): string[] {
    return this.#got.splice(0).map((m) => {
      if (m.type === 'plan') return `plan ${m.id} helped ${m.helped} share ${m.share}`;
      if (m.type === 'chunk') return `chunk ${m.id} ${m.from}-${m.to}`;
      return 'id' in m ? `${m.type} ${m.id}` : m.type;
    });
  }
}

const part = { keys: [], sustain: [], soft: [] };
const setting: Setting = { elaboration: 0.65 };
/** A plan of four chunks: 0-2000, 2000-5000, 5000-8000, 8000-10000. */
const planOf = (id: number, at: Setting = setting): Plan => ({
  type: 'plan',
  id,
  setting: at,
  pianoLevel: 1,
  voiceLevel: 1.1,
  duration: 25,
  bars: [],
  clock: { ticks: [], ms: [] },
  piece: part,
  harmonies: part,
  timings: { espressivo: 0, hummer: 0, gestures: 0 },
  startSeconds: 0,
  startState: 0,
  stateCount: 10000,
  seams: [2000, 5000, 8000],
});
const levelOf = (id: number, at: Setting = setting): FromWorker => ({
  type: 'level',
  id,
  level: {
    plan: planOf(id, at),
    closed: new Float64Array(1),
    glottis: new Float64Array(1),
    open: new Float64Array(1),
    weight: new Float32Array(1),
  },
});
const done = (id: number, from: number, to: number): FromWorker => ({ type: 'chunkDone', id, from, to });
/** The sound of states [from, to), as one message. */
const sound = (id: number, from: number, to: number): FromWorker => ({
  type: 'audio',
  id,
  start: from * STATE_STEP,
  samples: new Float32Array((to - from) * STATE_STEP),
  spectrogram: null,
});

function poolOf(count: number): { pool: VoicePool; workers: StandIn[]; events: VoiceEvent[] } {
  const workers: StandIn[] = [];
  const events: VoiceEvent[] = [];
  const pool = new VoicePool(
    count,
    (event) => events.push(event),
    () => {
      const worker = new StandIn();
      workers.push(worker);
      return worker;
    },
  );
  return { pool, workers, events };
}

describe('the pool', () => {
  it('gives the first worker and its two helpers channels to each other', () => {
    const { workers } = poolOf(4);
    assert.deepEqual(
      workers.map((w) => w.got()),
      [['link'], ['link'], ['link'], []],
    );
    assert.deepEqual(poolOf(1).workers[0]?.got(), []);
  });

  it('asks the first worker for the plan and stops the others', () => {
    const { pool, workers } = poolOf(3);
    workers.forEach((w) => w.got());
    pool.request(1, setting, { seconds: 0 });
    assert.deepEqual(
      workers.map((w) => w.got()),
      [['plan 1 helped true share 2'], ['stop 1'], ['stop 1']],
    );
    const alone = poolOf(1);
    alone.pool.request(1, setting, { seconds: 0 });
    assert.deepEqual(alone.workers[0]?.got(), ['plan 1 helped false share 0']);
  });

  it('takes the planner to be on the first chunk, and hands the others theirs with the level', () => {
    const { pool, workers, events } = poolOf(3);
    const [planner, second, third] = workers;
    pool.request(1, setting, { seconds: 0 });
    workers.forEach((w) => w.got());
    planner.says(planOf(1));
    assert.deepEqual(
      events.map((e) => e.type),
      ['plan'],
    );
    // nobody is handed anything yet: the planner knows its chunk, the others have no level
    assert.deepEqual(
      workers.map((w) => w.got()),
      [[], [], []],
    );
    planner.says(levelOf(1));
    assert.deepEqual(second.got(), ['level 1', 'chunk 1 2000-5000']);
    planner.says(levelOf(1));
    assert.deepEqual(third.got(), ['level 1', 'chunk 1 5000-8000']);
    planner.says(done(1, 0, 2000));
    assert.deepEqual(planner.got(), ['chunk 1 8000-10000']);
  });

  it('asks for no copies of a level the workers have, and hands their chunks out with the plan', () => {
    const { pool, workers } = poolOf(3);
    const [planner, second, third] = workers;
    pool.request(1, setting, { seconds: 0 });
    planner.says(planOf(1));
    planner.says(levelOf(1));
    planner.says(levelOf(1));
    workers.forEach((w) => w.got());
    // a seek: the same setting again
    pool.request(2, setting, { seconds: 20 });
    assert.deepEqual(planner.got(), ['plan 2 helped true share 0']);
    planner.says(planOf(2));
    assert.deepEqual(second.got(), ['stop 2', 'chunk 2 2000-5000']);
    assert.deepEqual(third.got(), ['stop 2', 'chunk 2 5000-8000']);
    // another setting: both need its level
    pool.request(3, { elaboration: 0.3 }, { seconds: 20 });
    assert.deepEqual(planner.got(), ['plan 3 helped true share 2']);
  });

  it('hands a worker its next chunk shortly before it finishes the one it is on', () => {
    const { pool, workers, events } = poolOf(1);
    const [worker] = workers;
    pool.request(1, setting, { seconds: 0 });
    worker.says(planOf(1));
    worker.got();
    worker.says(sound(1, 0, 1000));
    assert.deepEqual(worker.got(), [], 'too early: 2.5 s of the chunk are left');
    worker.says(sound(1, 1000, 1400));
    assert.deepEqual(worker.got(), ['chunk 1 2000-5000']);
    worker.says(sound(1, 1400, 2000));
    worker.says(done(1, 0, 2000));
    assert.deepEqual(worker.got(), [], 'it has its next chunk already, and no more than one');
    worker.says(sound(1, 2000, 4500));
    assert.deepEqual(worker.got(), ['chunk 1 5000-8000']);
    worker.says(done(1, 2000, 5000));
    worker.says(sound(1, 5000, 8000));
    assert.deepEqual(worker.got(), ['chunk 1 8000-10000']);
    worker.says(done(1, 5000, 8000));
    assert.equal(events.at(-1)?.type, 'audio');
    worker.says(done(1, 8000, 10000));
    assert.deepEqual(events.at(-1), { type: 'done', id: 1 });
  });

  it('ignores what workers say of a request that is no longer the one', () => {
    const { pool, workers, events } = poolOf(2);
    const [planner, second] = workers;
    pool.request(1, setting, { seconds: 0 });
    pool.request(2, setting, { seconds: 10 });
    workers.forEach((w) => w.got());
    planner.says(planOf(1));
    planner.says(levelOf(1));
    planner.says(done(1, 0, 2000));
    assert.deepEqual(events, []);
    assert.deepEqual(
      workers.map((w) => w.got()),
      [[], []],
    );
    planner.says(planOf(2));
    planner.says(levelOf(2));
    assert.deepEqual(second.got(), ['level 2', 'chunk 2 2000-5000']);
  });

  it('has the next worker plan when the planner fails before the plan', () => {
    const { pool, workers, events } = poolOf(3);
    const [planner, second, third] = workers;
    pool.request(1, setting, { seconds: 0 });
    workers.forEach((w) => w.got());
    planner.says({ type: 'error', id: 1, message: 'no' });
    assert.ok(planner.terminated);
    assert.equal(pool.size, 2);
    assert.deepEqual(second.got(), ['link', 'plan 1 helped true share 1']);
    assert.deepEqual(third.got(), ['link', 'stop 1']);
    assert.deepEqual(events, []);
  });

  it('tells the planner it is alone when its helper fails before the plan', () => {
    const { pool, workers } = poolOf(3);
    const [planner, helper, third] = workers;
    pool.request(1, setting, { seconds: 0 });
    workers.forEach((w) => w.got());
    helper.says({ type: 'error', id: 1, message: 'no' });
    assert.deepEqual(planner.got(), ['link', 'alone 1']);
    assert.deepEqual(third.got(), ['link']);
    // the plan comes all the same, and the one worker left is handed its level and chunk
    planner.says(planOf(1));
    planner.says(levelOf(1));
    assert.deepEqual(third.got(), ['level 1', 'chunk 1 2000-5000']);
  });

  it('hands a failed worker’s chunks to the others', () => {
    const { pool, workers } = poolOf(2);
    const [planner, second] = workers;
    pool.request(1, setting, { seconds: 0 });
    planner.says(planOf(1));
    planner.says(levelOf(1));
    second.says(sound(1, 2000, 4500));
    workers.forEach((w) => w.got());
    // it was on 2000-5000 and had been handed 5000-8000 to go on with
    second.says({ type: 'error', id: 1, message: 'no' });
    planner.says(done(1, 0, 2000));
    assert.deepEqual(planner.got(), ['chunk 1 2000-5000']);
    planner.says(done(1, 2000, 5000));
    assert.deepEqual(planner.got(), ['chunk 1 5000-8000']);
  });

  it('has the others prepare the level themselves when the planner fails after the plan', () => {
    const { pool, workers } = poolOf(3);
    const [planner, second, third] = workers;
    pool.request(1, setting, { seconds: 0 });
    planner.says(planOf(1));
    workers.forEach((w) => w.got());
    planner.says({ type: 'error', id: 1, message: 'no' });
    // the planner's own chunk first, then the next
    assert.deepEqual(second.got(), ['link', 'chunk 1 0-2000']);
    assert.deepEqual(third.got(), ['link', 'chunk 1 2000-5000']);
  });

  it('reports the failure of the last worker', () => {
    const { pool, workers, events } = poolOf(1);
    pool.request(1, setting, { seconds: 0 });
    workers[0]?.says({ type: 'error', id: 1, message: 'no' });
    assert.deepEqual(events, [{ type: 'error', id: 1, message: 'no' }]);
    assert.equal(pool.size, 0);
  });
});
