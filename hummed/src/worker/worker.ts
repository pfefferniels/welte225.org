// A voice worker: for an elaboration, espressivo performs the exaggerated MPM (on the piece,
// and on its harmonies for the piano's lowest third), the hummer turns that performance into two
// gestural scores, VocalTractLab (WebAssembly) turns them into tract states and then, chunk by
// chunk, into sound, streamed to the page in blocks with their spectrogram columns. The page runs
// several such workers side by side (shared/protocol.ts says who does what): the first prepares a
// setting, with the help of the next two, and answers with the plan; the others are handed what it
// prepared. One more worker only draws the piano's sound as the page hands it over (picture.ts):
// that one loads nothing else.
import { parseCalibration, parseHumStyle } from '../hummer/data.ts';
import { dynamicsRange, readDynamics, turningPoints } from '../hummer/index.ts';
import { chunkOrder } from '../shared/chunks.ts';
import {
  sameSetting,
  VOICE_WORKER,
  type BetweenWorkers,
  type DynamicsMessage,
  type FromWorker,
  type OpenMessage,
  type PianoMessage,
  type PictureColumns,
  type PictureRequest,
  type Setting,
  type Timings,
  type ToWorker,
} from '../shared/protocol.ts';
import { SPECTROGRAM_STYLES, type SpectrogramStyle } from '../shared/spectrogram.ts';
import { SAMPLE_RATE } from '../shared/units.ts';
import type { Reduction } from '../reduction/types.ts';
import { VtlEngine } from '../vtl/engine.ts';
import type { CreateVtl } from '../vtl/module.ts';
import { FIRST_SOUND, renderChunk } from './chunk.ts';
import { harmoniesScore } from './harmonies.ts';
import { shapeOf, stageAt } from './levels.ts';
import { performPiano } from './piano.ts';
import { drawPicture } from './picture.ts';
import {
  copyLevel,
  hum,
  levelFrom,
  makeLevel,
  performDynamics,
  performNotes,
  planOf,
  voiceMpm,
  type HumData,
  type Level,
  type Piano,
} from './prepare.ts';
import { makeSpectrogram, type SpectrogramColumns } from './spectrogram.ts';
import {
  harmoniesAt,
  reductions,
  sungReduction,
  voiceScore,
  type Reductions,
  type Score,
} from './reductions.ts';
import { maxStatesOf, scoreStates } from './voice-states.ts';

interface WorkerScope {
  readonly name: string;
  postMessage(message: FromWorker | PictureColumns, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToWorker | PictureRequest>) => void) | null;
}
const scope = self as unknown as WorkerScope;
const post = (message: FromWorker, transfer: Transferable[] = []): void => {
  scope.postMessage(message, transfer);
};
const now = (): number => performance.now();
const nothing = (): void => undefined;

/** The scores and the data: what the performances and the hummer are made from. */
interface Texts extends HumData {
  readonly msm: string;
  readonly mpm: string;
  /**
   * The harmonic reductions in half and in quarter notes, their MPM and the line sung over them
   * (reductions.ts), made when first needed here.
   */
  readonly reductions: () => Reductions;
}

/** What a worker loads once: the texts, soon there, and VocalTractLab, which takes longer. */
interface Resources {
  readonly texts: Promise<Texts>;
  readonly engine: Promise<VtlEngine>;
}

/** What the page sends once: what is hummed, and how to draw it. */
interface Setup {
  readonly reduction: Reduction;
  readonly style: SpectrogramStyle;
  readonly columns: SpectrogramColumns;
}

/** What the helpers have sent for the request being prepared here; `alone` once there is none to wait for. */
interface Help {
  readonly id: number;
  alone: boolean;
  /** Whether a helper was asked for the dynamics too (there are two). */
  readonly dynamicsAsked: boolean;
  piano?: PianoMessage;
  dynamics?: DynamicsMessage;
  open?: OpenMessage;
}

/** The messages that ask for work that takes time: preparing, rendering, helping. */
type Task = Extract<ToWorker | BetweenWorkers, { readonly type: 'plan' | 'chunk' | 'perform' | 'score' }>;

let resources: Resources | null = null;
/** The levels held here, the latest first: the worker that plans keeps a few, the others their one. */
let levels: Level[] = [];
let keep = 1;
let planning = false;
/** The newest request seen: work for an older one stops. */
let current = 0;
/** The work for the newest request, one task after another. */
let line: Promise<void> = Promise.resolve();
/** The newest picture asked for. */
let picture = 0;
/** The channels to the workers this one prepares settings with: its helpers', or the planner's. */
let peers: readonly MessagePort[] = [];
let help: Help | null = null;
/** Has a preparation that waits (for its helpers, or to be stopped) look again. */
let wake = nothing;

const get = async (url: string): Promise<Response> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
};

async function loadTexts(): Promise<Texts> {
  const [msm, halves, harmonies, mpm, style, calibration] = await Promise.all([
    get('../mpm/score.msm').then((r) => r.text()),
    get('reduction/halves.mei').then((r) => r.text()),
    get('reduction/harmonies.mei').then((r) => r.text()),
    get('../mpm/performance.mpm').then((r) => r.text()),
    get('data/hum-style.json').then((r) => r.json() as Promise<unknown>),
    get('data/calibration.json').then((r) => r.json() as Promise<unknown>),
  ]);
  let made: Reductions | null = null;
  return {
    msm,
    // converting the MEI takes a tenth of a second or two, and only where the reductions are needed
    reductions: () => (made ??= reductions(harmoniesScore(halves), harmoniesScore(harmonies), mpm)),
    mpm,
    range: dynamicsRange(mpm),
    turns: turningPoints(mpm),
    style: parseHumStyle(style),
    calibration: parseCalibration(calibration),
  };
}

/**
 * VocalTractLab with the speaker. Its script is fetched as the texts are, without holding this
 * thread up (`importScripts` of its address would, until it has come), and its WebAssembly is
 * compiled in the background: a setting's performance and humming are made meanwhile.
 */
async function loadEngine(): Promise<VtlEngine> {
  const [script, speaker] = await Promise.all([
    get('vtl.js').then((r) => r.blob()),
    get('data/hummer.speaker.xml').then((r) => r.text()),
  ]);
  const url = URL.createObjectURL(script);
  try {
    importScripts(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const createVtl = (self as unknown as { createVTL: CreateVtl }).createVTL;
  const module = await createVtl({ print: () => undefined, printErr: () => undefined });
  return new VtlEngine(module, speaker);
}

function load(): Resources {
  resources ??= { texts: loadTexts(), engine: loadEngine() };
  // a failure is reported with the request that meets it
  resources.texts.catch(nothing);
  resources.engine.catch(nothing);
  return resources;
}

const yieldNow = (() => {
  const channel = new MessageChannel();
  const queue: (() => void)[] = [];
  channel.port1.onmessage = () => queue.shift()?.();
  return () =>
    new Promise<void>((resolve) => {
      queue.push(resolve);
      channel.port2.postMessage(0);
    });
})();

/** Wait until `done` holds; it is looked at again with every message that comes. */
function until(done: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    wake = () => {
      if (!done()) return;
      wake = nothing;
      resolve();
    };
    wake();
  });
}

let setupDone: (setup: Setup) => void = nothing;
const setupReady = new Promise<Setup>((resolve) => {
  setupDone = resolve;
});

const held = (setting: Setting): Level | undefined => levels.find((L) => sameSetting(L.setting, setting));

/** Keep a level, the latest first, and let go of the oldest beyond what this worker holds. */
function hold(L: Level): void {
  const others = levels.filter((other) => !sameSetting(other.setting, L.setting));
  levels = [L, ...others].slice(0, planning ? keep : 1);
}

/** The piano's two parts at a setting, and where its harmonies roll a chord. */
const pianoAt = (texts: Texts, setting: Setting): Piano => {
  const harmonies = harmoniesAt(stageAt(setting.elaboration), texts.reductions);
  const parts = performPiano(
    { msm: texts.msm, mpm: texts.mpm, harmonies: harmonies.msm, harmoniesMpm: harmonies.mpm },
    shapeOf(setting),
  );
  return { ...parts, rolls: harmonies.rolls };
};

/** What the voice follows at a setting: the piece, or the reduction in half notes (reductions.ts). */
const voiceScoreAt = (texts: Texts, setting: Setting): Score =>
  voiceScore(stageAt(setting.elaboration), texts, texts.reductions);

/**
 * Prepare a setting. With helpers (`box.alone` false), the piano's parts, the open score's tract
 * states and, of two helpers, the dynamics come from them while the voice's performance, the hummer
 * and the closed score's states are made here; what no helper sends (there is none, or it failed)
 * is made here too. Gives way to messages between the steps; null when a newer request has come.
 */
async function prepare(r: Resources, setup: Setup, box: Help, setting: Setting): Promise<Level | null> {
  const { id } = box;
  const spent = { espressivo: 0, hummer: 0, gestures: 0 } satisfies Timings;
  const timed = <T>(step: keyof Timings, work: () => T): T => {
    const t = now();
    const result = work();
    spent[step] += now() - t;
    return result;
  };
  const stopped = async (): Promise<boolean> => {
    await yieldNow();
    return id !== current;
  };
  const texts = await r.texts;
  if (id !== current) return null;
  const shape = shapeOf(setting);
  const score = voiceScoreAt(texts, setting);
  const mpm = timed('espressivo', () => voiceMpm(score, shape));
  const performance = timed('espressivo', () => performNotes(score, mpm, shape));
  await until(() => id !== current || box.alone || !box.dynamicsAsked || box.dynamics !== undefined);
  if (await stopped()) return null;
  const dynamics = box.dynamics?.curve ?? timed('espressivo', () => performDynamics(score, mpm));
  const performed = { performance, dynamics };
  const sung = sungReduction(stageAt(setting.elaboration), setup.reduction, texts.reductions);
  const voice = timed('hummer', () => hum(performed, sung, texts, shape));
  const maxStates = maxStatesOf(voice);
  if (!box.alone)
    peers.at(0)?.postMessage({
      type: 'score',
      id,
      score: voice.openScore,
      maxStates,
      moves: voice.moves,
    } satisfies BetweenWorkers);
  const engine = await r.engine;
  if (await stopped()) return null;
  const closed = timed('gestures', () => scoreStates(engine, voice.closedScore, maxStates, voice.moves));
  await until(() => id !== current || box.alone || (box.piano !== undefined && box.open !== undefined));
  if (id !== current) return null;
  const open =
    box.open ?? timed('gestures', () => scoreStates(engine, voice.openScore, maxStates, voice.moves));
  const piano = box.piano ?? timed('espressivo', () => pianoAt(texts, setting));
  const timings = {
    espressivo: spent.espressivo + (box.piano?.ms ?? 0) + (box.dynamics?.ms ?? 0),
    hummer: spent.hummer,
    gestures: spent.gestures + (box.open?.ms ?? 0),
  };
  return makeLevel(setting, voice, { closed, open }, piano, timings);
}

/**
 * Render a chunk of a level and post it block by block; stop when a newer request comes. Once the
 * chunk's first sound is out (what the page needs before it plays from there), `afterFirstSound`.
 */
async function render(
  r: Resources,
  setup: Setup,
  L: Level,
  id: number,
  from: number,
  to: number,
  afterFirstSound = nothing,
): Promise<void> {
  const [texts, engine] = await Promise.all([r.texts, r.engine]);
  if (id !== current) return;
  const options = { style: setup.style, columns: setup.columns, gain: texts.calibration.gain };
  let sent = 0;
  let first = true;
  for (const part of renderChunk(engine, L, from, to, options)) {
    if (part) {
      sent += part.samples.length;
      post(
        { type: 'audio', id, ...part },
        part.spectrogram ? [part.samples.buffer, part.spectrogram.pixels.buffer] : [part.samples.buffer],
      );
    }
    if (first && sent >= FIRST_SOUND * SAMPLE_RATE) {
      first = false;
      afterFirstSound();
    }
    await yieldNow();
    if (id !== current) return;
  }
  if (first) afterFirstSound();
  post({ type: 'chunkDone', id, from, to });
}

/** The level a plan or a chunk is of: the one held, or prepared now. */
async function levelFor(r: Resources, setup: Setup, box: Help, setting: Setting): Promise<Level | null> {
  const L = held(setting) ?? (await prepare(r, setup, box, setting));
  if (L) hold(L);
  return L;
}

/** Do a task; `reply` is the channel a helper answers on. */
async function work(message: Task, box: Help, reply: MessagePort | undefined): Promise<void> {
  const { id } = message;
  if (id !== current) return;
  const r = load();
  switch (message.type) {
    case 'plan': {
      const setup = await setupReady;
      const L = await levelFor(r, setup, box, message.setting);
      if (!L || id !== current) return;
      const plan = planOf(L, id, message.start);
      post(plan);
      // the chunk that is heard first, at once; then a copy of the level for each worker without it
      const [from, to] = chunkOrder(plan)[0];
      await render(r, setup, L, id, from, to, () => {
        for (let i = 0; i < message.share; i++) {
          const { data, transfer } = copyLevel(L);
          post({ type: 'level', id, level: data }, transfer);
        }
      });
      return;
    }
    case 'chunk': {
      const setup = await setupReady;
      const L = await levelFor(r, setup, box, message.setting);
      if (!L || id !== current) return;
      await render(r, setup, L, id, message.from, message.to);
      return;
    }
    case 'perform': {
      const texts = await r.texts;
      if (id !== current) return;
      const t = now();
      if (message.what === 'piano') {
        const piano = pianoAt(texts, message.setting);
        reply?.postMessage({ type: 'piano', id, ...piano, ms: now() - t } satisfies BetweenWorkers);
      } else {
        const score = voiceScoreAt(texts, message.setting);
        const mpm = voiceMpm(score, shapeOf(message.setting));
        const curve = readDynamics(performDynamics(score, mpm));
        reply?.postMessage({ type: 'dynamics', id, curve, ms: now() - t } satisfies BetweenWorkers);
      }
      return;
    }
    case 'score': {
      const engine = await r.engine;
      if (id !== current) return;
      const t = now();
      const { count, tract } = scoreStates(engine, message.score, message.maxStates, message.moves);
      reply?.postMessage({ type: 'open', id, count, tract, ms: now() - t } satisfies BetweenWorkers, [
        tract.buffer,
      ]);
      return;
    }
  }
}

/**
 * A task has come. A setting that is not held here will be prepared: with helpers, ask them to
 * perform before anything else, so that they begin at once: the last the piano, and of two the
 * first the dynamics. The tasks of one request are done in the order they come (a worker is handed
 * its next chunk before it has finished the last); a newer request's start at once, and the older
 * one's give up as they come round.
 */
function take(message: Task, newer: boolean, reply: MessagePort | undefined): void {
  const helped = message.type === 'plan' && message.helped && peers.length > 0 && !held(message.setting);
  const box: Help = { id: message.id, alone: !helped, dynamicsAsked: helped && peers.length > 1 };
  if (helped) {
    help = box;
    const ask = (what: 'piano' | 'dynamics'): BetweenWorkers => ({
      type: 'perform',
      id: message.id,
      setting: message.setting,
      what,
    });
    peers.at(-1)?.postMessage(ask('piano'));
    if (box.dynamicsAsked) peers.at(0)?.postMessage(ask('dynamics'));
  }
  const start = (): Promise<void> => work(message, box, reply);
  line = (newer ? start() : line.then(start)).catch((error: unknown) => {
    post({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

/** A message with a request's id, from the page or (`from`) from a worker this one prepares with. */
function receive(
  message: Exclude<ToWorker, { readonly type: 'setup' | 'link' }> | BetweenWorkers,
  from?: MessagePort,
): void {
  if (message.id < current) return;
  const newer = message.id > current;
  current = message.id;
  switch (message.type) {
    case 'stop':
      break;
    case 'alone':
      if (help?.id === message.id) help.alone = true;
      break;
    case 'piano':
      if (help?.id === message.id) help.piano = message;
      break;
    case 'dynamics':
      if (help?.id === message.id) help.dynamics = message;
      break;
    case 'open':
      if (help?.id === message.id) help.open = message;
      break;
    case 'level':
      hold(levelFrom(message.level));
      break;
    default:
      // the worker that is asked for plans is the one that keeps levels
      if (message.type === 'plan') planning = true;
      take(message, newer, from);
  }
  // a preparation that waits sees what has come: a helper's part, or a newer request
  wake();
}

scope.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case 'picture':
      picture = message.id;
      void drawPicture(
        message,
        (columns, transfer) => {
          scope.postMessage(columns, transfer);
        },
        async () => {
          await yieldNow();
          return picture === message.id;
        },
      );
      return;
    case 'setup': {
      const style = SPECTROGRAM_STYLES[message.spectrogram];
      keep = message.keep;
      setupDone({ reduction: message.reduction, style, columns: makeSpectrogram(style) });
      load();
      return;
    }
    case 'link':
      for (const port of peers) port.close();
      peers = message.ports;
      for (const port of peers)
        port.onmessage = (other: MessageEvent<BetweenWorkers>) => {
          receive(other.data, port);
        };
      return;
    default:
      receive(message);
  }
};

// a voice worker loads VocalTractLab and the data as soon as it is there, so that the first request
// need only prepare its level; the worker that draws the piano's picture never does
if (scope.name === VOICE_WORKER) load();
