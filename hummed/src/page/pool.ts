// The voice is rendered by a few workers side by side. Each takes whole chunks of it, cut where the
// voice is silent (early in a breath), in the order they will be heard from where playback is; a
// worker that finishes one is handed the next. One worker answers for the plan.
import type { Reduction } from '../reduction/types.ts';
import type { FromWorker, Plan, Setting, StartAt, ToWorker } from '../shared/protocol.ts';
import type { SpectrogramStyleName } from '../shared/spectrogram.ts';
import { SAMPLE_RATE, STATE_STEP } from '../shared/units.ts';

/** What the pool tells the player: the workers' messages, and when a rendering is complete. */
export type VoiceEvent =
  Exclude<FromWorker, { readonly type: 'chunkDone' }> | { readonly type: 'done'; readonly id: number };

type Chunk = readonly [from: number, to: number];

/** Chunks shorter than this are joined to the one before: each costs a little settling. */
const MIN_CHUNK_STATES = Math.round((1.5 * SAMPLE_RATE) / STATE_STEP);

/** As many workers as there are cores to spare, at most four, at most two where memory is short. */
export function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
  const count = Math.max(1, Math.min(4, cores - 1));
  return memory !== undefined && memory < 4 ? Math.min(count, 2) : count;
}

/**
 * The chunks of a rendering in the order they are needed: from the start to the end, then from the
 * beginning up to the start. The start splits its chunk if it falls inside one.
 */
export function chunkOrder(plan: Pick<Plan, 'stateCount' | 'seams' | 'startState'>): Chunk[] {
  const cuts = [0];
  for (const seam of [...plan.seams].sort((a, b) => a - b)) {
    const last = cuts[cuts.length - 1] ?? 0;
    if (seam - last >= MIN_CHUNK_STATES && plan.stateCount - seam >= MIN_CHUNK_STATES) cuts.push(seam);
  }
  cuts.push(plan.stateCount);
  const chunks: Chunk[] = cuts.slice(1).map((to, i) => [cuts[i] ?? 0, to]);
  const start = Math.max(0, Math.min(plan.stateCount - 1, plan.startState));
  const k = chunks.findIndex(([from, to]) => from <= start && start < to);
  const [from, to] = chunks[k] ?? [0, plan.stateCount];
  if (start === from) return [...chunks.slice(k), ...chunks.slice(0, k)];
  return [[start, to], ...chunks.slice(k + 1), ...chunks.slice(0, k), [from, start]];
}

interface Job {
  readonly id: number;
  readonly setting: Setting;
  queue: Chunk[];
  /** The chunk each busy worker is rendering. */
  readonly busy: Map<Worker, Chunk>;
}

export class VoicePool {
  readonly #workers: Worker[];
  readonly #listener: (event: VoiceEvent) => void;
  #job: Job | null = null;

  constructor(count: number, listener: (event: VoiceEvent) => void) {
    this.#listener = listener;
    this.#workers = Array.from({ length: count }, () => {
      const worker = new Worker('worker.js');
      worker.onmessage = (event: MessageEvent<FromWorker>) => {
        this.#receive(worker, event.data);
      };
      return worker;
    });
  }

  get size(): number {
    return this.#workers.length;
  }

  setup(reduction: Reduction, spectrogram: SpectrogramStyleName): void {
    this.#postAll({ type: 'setup', reduction, spectrogram });
  }

  /** Render a setting from a place; stops whatever was being rendered before. */
  request(id: number, setting: Setting, start: StartAt): void {
    this.#job = { id, setting, queue: [], busy: new Map() };
    // the first worker answers with the plan; the others stop, and leave it the processor meanwhile
    this.#workers.at(0)?.postMessage({ type: 'plan', id, setting, start } satisfies ToWorker);
    for (const worker of this.#workers.slice(1)) worker.postMessage({ type: 'stop', id } satisfies ToWorker);
  }

  #postAll(message: ToWorker): void {
    for (const worker of this.#workers) worker.postMessage(message);
  }

  #receive(worker: Worker, message: FromWorker): void {
    const job = this.#job;
    switch (message.type) {
      case 'plan':
        if (job?.id !== message.id) return;
        job.queue = chunkOrder(message);
        this.#listener(message);
        for (const w of this.#workers) this.#assign(w, job);
        return;
      case 'chunkDone':
        if (job?.id !== message.id) return;
        job.busy.delete(worker);
        this.#assign(worker, job);
        if (job.queue.length === 0 && job.busy.size === 0) this.#listener({ type: 'done', id: job.id });
        return;
      case 'error': {
        // a worker that fails is let go; its chunk goes to the others, unless none is left
        const chunk = job?.busy.get(worker);
        this.#workers.splice(this.#workers.indexOf(worker), 1);
        worker.terminate();
        if (job && chunk) {
          job.busy.delete(worker);
          job.queue.unshift(chunk);
          for (const w of this.#workers) this.#assign(w, job);
        }
        if (this.#workers.length === 0) this.#listener(message);
        return;
      }
      case 'audio':
        this.#listener(message);
        return;
    }
  }

  #assign(worker: Worker, job: Job): void {
    if (job.busy.has(worker)) return;
    const chunk = job.queue.shift();
    if (!chunk) return;
    job.busy.set(worker, chunk);
    worker.postMessage({
      type: 'chunk',
      id: job.id,
      setting: job.setting,
      from: chunk[0],
      to: chunk[1],
    } satisfies ToWorker);
  }
}
