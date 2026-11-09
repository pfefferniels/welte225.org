// The voice is rendered by a few workers side by side. The first prepares a setting, with the
// second's help, and answers with the plan; each then takes whole chunks of the voice, cut where it
// is silent (early in a breath), in the order they will be heard from where playback is, and a
// worker that is about to finish one is handed the next (shared/protocol.ts).
import type { Reduction } from '../reduction/types.ts';
import { chunkOrder, type Chunk } from '../shared/chunks.ts';
import {
  VOICE_WORKER,
  type AudioMessage,
  type FromWorker,
  type Plan,
  type Setting,
  type StartAt,
  type ToWorker,
} from '../shared/protocol.ts';
import type { SpectrogramStyleName } from '../shared/spectrogram.ts';
import { SAMPLE_RATE, STATE_STEP, type Seconds } from '../shared/units.ts';

export { chunkOrder } from '../shared/chunks.ts';

/** What the pool tells the player: the plan, the sound, a failure, and when a rendering is complete. */
export type VoiceEvent =
  | Plan
  | AudioMessage
  | Extract<FromWorker, { readonly type: 'error' }>
  | { readonly type: 'done'; readonly id: number };

/** What the pool needs of a worker (the tests put stand-ins in their place). */
export interface PoolWorker {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  terminate(): void;
}

/**
 * A worker is handed its next chunk when it has this much sound left to render of the one it is on
 * (some 0.7 s of work), so that it need not wait for this thread, which is often busy drawing, to
 * hear that it has finished. No sooner: until it is handed out, a chunk can go to whichever worker
 * is free first.
 */
const HAND_AHEAD: Seconds = 2;
/** How many workers help the first to prepare a setting: one with the tract states, one with the piano. */
const HELPERS = 2;

const deviceMemory = (): number | undefined =>
  (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;

/** As many workers as there are cores to spare, at most four, at most two where memory is short. */
export function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 2;
  const memory = deviceMemory();
  const count = Math.max(1, Math.min(4, cores - 1));
  return memory !== undefined && memory < 4 ? Math.min(count, 2) : count;
}

/**
 * How many prepared settings the planning worker keeps, some 27 MB each: going back to one of them
 * needs no preparation. The one playing and two before it; one before it where memory is short.
 */
export function levelsKept(): number {
  const memory = deviceMemory();
  return memory !== undefined && memory < 4 ? 2 : 3;
}

interface Job {
  readonly id: number;
  readonly setting: Setting;
  readonly start: StartAt;
  /** The worker asked for the plan. */
  readonly planner: PoolWorker;
  /** Whether the plan has come: only then are there chunks to hand out. */
  planned: boolean;
  queue: Chunk[];
  /** The chunk each busy worker is rendering, and the one it has been handed to go on with. */
  readonly busy: Map<PoolWorker, Chunk>;
  readonly next: Map<PoolWorker, Chunk>;
  /** The workers without a level of the setting: each waits for the planner's copy. */
  readonly waiting: Set<PoolWorker>;
}

export class VoicePool {
  readonly #workers: PoolWorker[];
  readonly #listener: (event: VoiceEvent) => void;
  /** The setting of the level each worker was last handed. */
  readonly #levels = new Map<PoolWorker, number>();
  #job: Job | null = null;

  constructor(
    count: number,
    listener: (event: VoiceEvent) => void,
    create: () => PoolWorker = () => new Worker('worker.js', { name: VOICE_WORKER }),
  ) {
    this.#listener = listener;
    this.#workers = Array.from({ length: count }, () => {
      const worker = create();
      worker.onmessage = (event) => {
        this.#receive(worker, event.data);
      };
      return worker;
    });
    this.#link();
  }

  get size(): number {
    return this.#workers.length;
  }

  setup(reduction: Reduction, spectrogram: SpectrogramStyleName): void {
    for (const worker of this.#workers)
      worker.postMessage({ type: 'setup', reduction, spectrogram, keep: levelsKept() });
  }

  /** Render a setting from a place; stops whatever was being rendered before. */
  request(id: number, setting: Setting, start: StartAt): void {
    const planner = this.#workers.at(0);
    if (!planner) return;
    const others = this.#workers.slice(1);
    const waiting = new Set(others.filter((worker) => this.#levels.get(worker) !== setting.elaboration));
    this.#job = {
      id,
      setting,
      start,
      planner,
      planned: false,
      queue: [],
      busy: new Map(),
      next: new Map(),
      waiting,
    };
    // the first worker answers with the plan; the others stop, and leave it the processor meanwhile,
    // but for the second, which the first asks to help
    planner.postMessage({
      type: 'plan',
      id,
      setting,
      start,
      helped: others.length > 0,
      share: waiting.size,
    });
    for (const worker of others) worker.postMessage({ type: 'stop', id });
  }

  /** The first worker prepares settings with the help of the next two: give them channels to each other. */
  #link(): void {
    const planner = this.#workers.at(0);
    const helpers = this.#workers.slice(1, 1 + HELPERS);
    if (!planner || helpers.length === 0) return;
    const channels = helpers.map(() => new MessageChannel());
    const ports = channels.map((channel) => channel.port1);
    planner.postMessage({ type: 'link', ports }, ports);
    helpers.forEach((helper, i) => {
      const port = channels[i].port2;
      helper.postMessage({ type: 'link', ports: [port] }, [port]);
    });
  }

  #receive(worker: PoolWorker, message: FromWorker): void {
    const job = this.#job;
    switch (message.type) {
      case 'plan': {
        if (job?.id !== message.id) return;
        job.queue = chunkOrder(message);
        job.planned = true;
        // the worker that planned has gone on to the first chunk by itself
        const first = job.queue.shift();
        if (first) job.busy.set(worker, first);
        this.#listener(message);
        for (const w of this.#workers) this.#assign(w, job);
        return;
      }
      case 'audio': {
        this.#listener(message);
        if (job?.id !== message.id) return;
        // nearly through its chunk: the one to go on with
        const chunk = job.busy.get(worker);
        if (!chunk || job.next.has(worker) || message.samples.length === 0) return;
        const left = chunk[1] * STATE_STEP - (message.start + message.samples.length);
        if (left <= HAND_AHEAD * SAMPLE_RATE) this.#hand(worker, job, job.next);
        return;
      }
      case 'chunkDone': {
        if (job?.id !== message.id) return;
        // on to the chunk it was handed already, or the next there is
        const next = job.next.get(worker);
        job.next.delete(worker);
        if (next) job.busy.set(worker, next);
        else job.busy.delete(worker);
        this.#assign(worker, job);
        if (job.queue.length === 0 && job.busy.size === 0) this.#listener({ type: 'done', id: job.id });
        return;
      }
      case 'level': {
        // a copy of the level for a worker without it, and with it that worker's first chunk
        if (job?.id !== message.id) return;
        const next = [...job.waiting].at(0);
        if (!next) return;
        job.waiting.delete(next);
        this.#levels.set(next, job.setting.elaboration);
        const { closed, glottis, open, weight } = message.level;
        next.postMessage(message, [closed.buffer, glottis.buffer, open.buffer, weight.buffer]);
        this.#assign(next, job);
        return;
      }
      case 'error':
        this.#failed(worker, message);
        return;
    }
  }

  /** A worker that fails is let go; what it was doing goes to the others, unless none is left. */
  #failed(worker: PoolWorker, message: Extract<FromWorker, { readonly type: 'error' }>): void {
    const index = this.#workers.indexOf(worker);
    if (index < 0) return;
    this.#workers.splice(index, 1);
    this.#levels.delete(worker);
    worker.terminate();
    if (this.#workers.length === 0) {
      this.#listener(message);
      return;
    }
    // one of those that prepare together: the first that are left do from now on
    if (index <= HELPERS) this.#link();
    const job = this.#job;
    if (!job) return;
    const chunks = [job.busy.get(worker), job.next.get(worker)].filter((chunk) => chunk !== undefined);
    job.busy.delete(worker);
    job.next.delete(worker);
    job.waiting.delete(worker);
    if (!job.planned) {
      // before the plan: without the planner, the next worker plans instead; without a helper
      // (which may have been helping), the planner does the rest itself
      if (worker === job.planner) this.request(job.id, job.setting, job.start);
      else if (index <= HELPERS) job.planner.postMessage({ type: 'alone', id: job.id });
      return;
    }
    job.queue.unshift(...chunks);
    // no copies of the level come from a planner that is gone: the others prepare it themselves
    if (worker === job.planner) job.waiting.clear();
    for (const w of this.#workers) this.#assign(w, job);
  }

  /** Hand a worker that is free the next chunk there is. */
  #assign(worker: PoolWorker, job: Job): void {
    if (job.planned && !job.waiting.has(worker) && !job.busy.has(worker)) this.#hand(worker, job, job.busy);
  }

  #hand(worker: PoolWorker, job: Job, as: Map<PoolWorker, Chunk>): void {
    const chunk = job.queue.shift();
    if (!chunk) return;
    as.set(worker, chunk);
    worker.postMessage({
      type: 'chunk',
      id: job.id,
      setting: job.setting,
      from: chunk[0],
      to: chunk[1],
    });
  }
}
