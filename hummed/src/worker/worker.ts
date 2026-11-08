// A voice worker: for a setting (saturation, elaboration), espressivo performs the exaggerated MPM (on the piece,
// and on its harmonies for the piano's lower half), the hummer turns that performance into two
// gestural scores, VocalTractLab (WebAssembly) turns them into tract states and then, chunk by
// chunk as the page hands them out, into sound, streamed to the page in blocks with their
// spectrogram columns. The page runs several such workers side by side.
import { exaggerateMpm, performMsmToData } from 'espressivo';
import { parseCalibration, parseHumStyle } from '../hummer/data.ts';
import { renderVoice, type Calibration, type HumStyle } from '../hummer/index.ts';
import { interp } from '../shared/math.ts';
import type { FromWorker, Plan, Setting, StartAt, Timings, ToWorker } from '../shared/protocol.ts';
import { SPECTROGRAM, SPECTROGRAM_STYLES, type SpectrogramStyle } from '../shared/spectrogram.ts';
import { PAD_MS, SAMPLE_RATE, STATE_STEP, type Seconds } from '../shared/units.ts';
import type { Reduction } from '../reduction/types.ts';
import { VtlEngine, type StatePair } from '../vtl/engine.ts';
import type { CreateVtl } from '../vtl/module.ts';
import { harmoniesScore } from './harmonies.ts';
import { approximateness, voiceFactors, voiceLead, withSubNoteDynamics } from './levels.ts';
import { performPiano } from './piano.ts';
import { makeSpectrogram, type SpectrogramColumns } from './spectrogram.ts';

interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;
const post = (message: FromWorker, transfer: Transferable[] = []): void => {
  scope.postMessage(message, transfer);
};

/**
 * Sound before a chunk that is rendered to settle the voice but not sent: longer where the chunk
 * starts in the middle of the voice (a seek), short where it starts at a silence.
 */
const SETTLE: Seconds = 0.3;
const SETTLE_AT_SEAM: Seconds = 0.05;
/** Tract states per audio block. */
const BLOCK_STATES = 40;

interface Resources {
  readonly msm: string;
  /** The harmonies as a score (reduction/harmonies.mei, grace notes put back). */
  readonly harmonies: string;
  readonly mpm: string;
  readonly style: HumStyle;
  readonly calibration: Calibration;
  readonly engine: VtlEngine;
}

/** One setting, from the MPM to tract states, kept while it is being rendered. */
interface Level {
  readonly setting: Setting;
  readonly states: StatePair;
  readonly weight: Float32Array;
  readonly seams: ReadonlySet<number>;
  readonly plan: Omit<Plan, 'id' | 'startSeconds' | 'startState'>;
}

let resources: Promise<Resources> | null = null;
let prepared: Level | null = null;
/** The newest request seen: work for an older one stops. */
let current = 0;

async function load(): Promise<Resources> {
  const get = async (url: string): Promise<Response> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response;
  };
  const [msm, harmonies, mpm, speaker, style, calibration] = await Promise.all([
    get('../mpm/score.msm').then((r) => r.text()),
    get('reduction/harmonies.mei').then((r) => r.text()),
    get('../mpm/performance.mpm').then((r) => r.text()),
    get('data/hummer.speaker.xml').then((r) => r.text()),
    get('data/hum-style.json').then((r) => r.json() as Promise<unknown>),
    get('data/calibration.json').then((r) => r.json() as Promise<unknown>),
  ]);
  importScripts('vtl.js');
  const createVtl = (self as unknown as { createVTL: CreateVtl }).createVTL;
  const module = await createVtl({ print: () => undefined, printErr: () => undefined });
  return {
    msm,
    harmonies: harmoniesScore(harmonies),
    mpm,
    style: parseHumStyle(style),
    calibration: parseCalibration(calibration),
    engine: new VtlEngine(module, speaker),
  };
}

function prepare(r: Resources, hummed: Reduction, setting: Setting): Level {
  const t0 = performance.now();
  const { level, elaboration } = setting;
  const lead = voiceLead(elaboration);
  const { piece, harmonies } = performPiano(r, level);
  const voiceMpm = exaggerateMpm(r.mpm, { factors: voiceFactors(level, lead) }).mpm;
  const voiceData = performMsmToData({ msm: r.msm, mpm: voiceMpm });
  const dynamics = performMsmToData({ msm: r.msm, mpm: withSubNoteDynamics(voiceMpm) });
  const t1 = performance.now();
  const voice = renderVoice({
    performance: voiceData,
    dynamics,
    reduction: hummed,
    style: r.style,
    calibration: r.calibration,
    approximateness: approximateness(elaboration),
  });
  const t2 = performance.now();
  const maxStates = Math.ceil(((voice.endMs / 1000) * SAMPLE_RATE) / STATE_STEP) + 10;
  const states = {
    closed: r.engine.states(voice.closedScore, maxStates),
    open: r.engine.states(voice.openScore, maxStates),
  };
  const t3 = performance.now();
  const timings: Timings = { espressivo: t1 - t0, hummer: t2 - t1, gestures: t3 - t2 };
  const msPerState = (STATE_STEP / SAMPLE_RATE) * 1000;
  const seams = voice.seams
    .map((ms) => Math.round(ms / msPerState))
    .filter((i) => i > 0 && i < states.closed.count);
  return {
    setting,
    states,
    weight: voice.weight,
    seams: new Set(seams),
    plan: {
      type: 'plan',
      setting,
      voiceLevel: level + lead,
      // states i..j sound from i to j−1
      duration: ((states.closed.count - 1) * STATE_STEP) / SAMPLE_RATE,
      bars: voice.bars,
      clock: { ticks: voice.clock.ticks, ms: voice.clock.ms },
      piece,
      harmonies,
      timings,
      stateCount: states.closed.count,
      seams,
    },
  };
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

/** What the page sends once: what is hummed, and how to draw it. */
interface Setup {
  readonly reduction: Reduction;
  readonly style: SpectrogramStyle;
  readonly columns: SpectrogramColumns;
}
let setupDone: (setup: Setup) => void = () => undefined;
const setupReady = new Promise<Setup>((resolve) => {
  setupDone = resolve;
});

function levelOf(r: Resources, setup: Setup, setting: Setting): Level {
  const kept = prepared;
  if (kept?.setting.level === setting.level && kept.setting.elaboration === setting.elaboration) return kept;
  prepared = null;
  const next = prepare(r, setup.reduction, setting);
  prepared = next;
  return next;
}

/** The plan of a level: how long, where its bars and seams are, where the sound starts. */
function plan(L: Level, id: number, start: StartAt): Plan {
  const startSeconds =
    'tick' in start
      ? interp(start.tick, L.plan.clock.ticks, L.plan.clock.ms) / 1000 + PAD_MS / 1000
      : start.seconds;
  // the first state at or before the 10 ms slot of the start: the page counts sound per slot
  const slot = SAMPLE_RATE / 100;
  const startState = Math.max(
    0,
    Math.min(L.plan.stateCount - 1, Math.floor((Math.floor(startSeconds * 100) * slot) / STATE_STEP)),
  );
  return { ...L.plan, id, startSeconds, startState };
}

/**
 * Render the states [from, to): settle the voice a little before `from`, and render on past `to`
 * for the last spectrogram columns, but send only the samples of [from, to) and the columns whose
 * centres fall in them. Stop when a newer request comes.
 */
async function renderChunk(
  r: Resources,
  setup: Setup,
  L: Level,
  id: number,
  from: number,
  to: number,
): Promise<void> {
  const { style, columns } = setup;
  const { hop } = SPECTROGRAM;
  const count = L.states.closed.count;
  const settle = from === 0 ? 0 : L.seams.has(from) ? SETTLE_AT_SEAM : SETTLE;
  const a = Math.max(0, from - Math.round((settle * SAMPLE_RATE) / STATE_STEP));
  const b = Math.min(count, to + Math.ceil(style.window / 2 / STATE_STEP) + 1);
  const offset = a * STATE_STEP;
  const local = new Float32Array((b - a) * STATE_STEP);
  const keep0 = from * STATE_STEP;
  const keep1 = Math.min(to * STATE_STEP, (count - 1) * STATE_STEP);
  const lastColumn = Math.ceil(keep1 / hop);
  let column = Math.ceil(keep0 / hop);
  const gain = r.calibration.gain;
  const send = (start: number, samples: Float32Array, upto: number): void => {
    const pixels = upto > column ? columns(local, offset, column, upto) : null;
    if (samples.length === 0 && !pixels) return;
    post(
      {
        type: 'audio',
        id,
        start,
        samples,
        spectrogram: pixels ? { column, count: upto - column, pixels } : null,
      },
      pixels ? [samples.buffer, pixels.buffer] : [samples.buffer],
    );
    if (pixels) column = upto;
  };
  for (const block of r.engine.synthesize(L.states, L.weight, a, b, { blockStates: BLOCK_STATES })) {
    const at = (block.firstState - 1) * STATE_STEP;
    const samples = block.samples;
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
    local.set(samples, at - offset);
    const filled = at + samples.length;
    const s0 = Math.max(at, keep0);
    const s1 = Math.min(filled, keep1);
    // the columns whose window the rendered sound now covers
    const ready = Math.min(lastColumn, Math.floor((filled - style.window / 2) / hop) + 1);
    send(s1 > s0 ? s0 : 0, s1 > s0 ? samples.slice(s0 - at, s1 - at) : new Float32Array(0), ready);
    await yieldNow();
    if (id !== current) return;
  }
  send(0, new Float32Array(0), lastColumn); // at the end of the piece, with silence after it
  post({ type: 'chunkDone', id, from, to });
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'setup') {
    const style = SPECTROGRAM_STYLES[message.spectrogram];
    setupDone({ reduction: message.reduction, style, columns: makeSpectrogram(style) });
    // load VocalTractLab and the data now, so that the first chunk need only prepare its level
    resources ??= load();
    resources.catch(() => undefined); // a failure is reported with the request that meets it
    return;
  }
  if (message.id < current) return;
  current = message.id;
  if (message.type === 'stop') return;
  void (async () => {
    try {
      resources ??= load();
      const [r, setup] = await Promise.all([resources, setupReady]);
      if (message.id !== current) return;
      const L = levelOf(r, setup, message.setting);
      if (message.id !== current) return;
      if (message.type === 'plan') post(plan(L, message.id, message.start));
      else await renderChunk(r, setup, L, message.id, message.from, message.to);
    } catch (error) {
      post({
        type: 'error',
        id: message.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
};
