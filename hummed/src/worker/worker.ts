// The live voice: for an exaggeration level, espressivo performs the exaggerated MPM, the hummer
// turns that performance into two gestural scores, VocalTractLab (WebAssembly) turns them into tract
// states and then into sound, streamed to the page in blocks with their spectrogram columns.
import { exaggerateMpm, performMsmToData } from 'espressivo';
import { parseCalibration, parseHumStyle } from '../hummer/data.ts';
import { readPerformance, renderVoice, repair, type Calibration, type HumStyle } from '../hummer/index.ts';
import { interp } from '../shared/math.ts';
import type { FromWorker, Plan, StartAt, Timings, ToWorker } from '../shared/protocol.ts';
import { SPECTROGRAM } from '../shared/spectrogram.ts';
import { PAD_MS, SAMPLE_RATE, STATE_STEP, type Seconds } from '../shared/units.ts';
import type { Reduction } from '../reduction/types.ts';
import { VtlEngine, type StatePair } from '../vtl/engine.ts';
import type { CreateVtl } from '../vtl/module.ts';
import { pianoFactors, voiceFactors, VOICE_LEAD, withSubNoteDynamics } from './levels.ts';
import { pianoNotes } from './piano.ts';
import { spectrogramColumns } from './spectrogram.ts';

interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;
const post = (message: FromWorker, transfer: Transferable[] = []): void => {
  scope.postMessage(message, transfer);
};

/** Sound before a start point that is rendered to settle the voice but not sent. */
const PREROLL: Seconds = 0.3;
/** Tract states per audio block. */
const BLOCK_STATES = 40;

interface Resources {
  readonly msm: string;
  readonly mpm: string;
  readonly style: HumStyle;
  readonly calibration: Calibration;
  readonly engine: VtlEngine;
}

/** One exaggeration level, from the MPM to tract states, kept for seeking within it. */
interface Level {
  readonly level: number;
  readonly states: StatePair;
  readonly weight: Float32Array;
  readonly plan: Omit<Plan, 'id' | 'startSeconds'>;
}

let resources: Promise<Resources> | null = null;
let prepared: Level | null = null;
let current = 0;

async function load(): Promise<Resources> {
  const get = async (url: string): Promise<Response> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response;
  };
  const [msm, mpm, speaker, style, calibration] = await Promise.all([
    get('../mpm/score.msm').then((r) => r.text()),
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
    mpm,
    style: parseHumStyle(style),
    calibration: parseCalibration(calibration),
    engine: new VtlEngine(module, speaker),
  };
}

function prepare(r: Resources, hummed: Reduction, level: number): Level {
  const t0 = performance.now();
  const piano = pianoFactors(level);
  const pianoData = performMsmToData({
    msm: r.msm,
    mpm: piano ? exaggerateMpm(r.mpm, { factors: piano }).mpm : r.mpm,
  });
  const voiceMpm = exaggerateMpm(r.mpm, { factors: voiceFactors(level) }).mpm;
  const voiceData = performMsmToData({ msm: r.msm, mpm: voiceMpm });
  const dynamics = performMsmToData({ msm: r.msm, mpm: withSubNoteDynamics(voiceMpm) });
  const t1 = performance.now();
  const voice = renderVoice({
    performance: voiceData,
    dynamics,
    reduction: hummed,
    style: r.style,
    calibration: r.calibration,
  });
  const t2 = performance.now();
  const maxStates = Math.ceil(((voice.endMs / 1000) * SAMPLE_RATE) / STATE_STEP) + 10;
  const states = {
    closed: r.engine.states(voice.closedScore, maxStates),
    open: r.engine.states(voice.openScore, maxStates),
  };
  const t3 = performance.now();
  const { notes, sustain } = readPerformance(pianoData);
  repair(notes);
  const timings: Timings = { espressivo: t1 - t0, hummer: t2 - t1, gestures: t3 - t2 };
  return {
    level,
    states,
    weight: voice.weight,
    plan: {
      type: 'plan',
      level,
      voiceLevel: level + VOICE_LEAD,
      // states i..j sound from i to j−1
      duration: ((states.closed.count - 1) * STATE_STEP) / SAMPLE_RATE,
      bars: voice.bars,
      clock: { ticks: voice.clock.ticks, ms: voice.clock.ms },
      piano: pianoNotes(notes, sustain),
      timings,
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

/** Render from the start to the end, then from the beginning up to the start; stop when a newer request comes. */
async function render(
  r: Resources,
  hummed: Reduction,
  id: number,
  level: number,
  start: StartAt,
): Promise<void> {
  if (prepared?.level !== level) {
    prepared = null;
    prepared = prepare(r, hummed, level);
  }
  const L = prepared;
  if (id !== current) return;
  const startSeconds =
    'tick' in start
      ? interp(start.tick, L.plan.clock.ticks, L.plan.clock.ms) / 1000 + PAD_MS / 1000
      : start.seconds;
  post({ ...L.plan, id, startSeconds });

  const audio = new Float32Array(Math.ceil(L.plan.duration * SAMPLE_RATE));
  const gain = r.calibration.gain;
  const count = L.states.closed.count;
  // the first state at or before the 10 ms slot of the start: the page counts sound per slot
  const slot = SAMPLE_RATE / 100;
  const first = Math.max(
    0,
    Math.min(count - 1, Math.floor((Math.floor(startSeconds * 100) * slot) / STATE_STEP)),
  );
  const preroll = Math.round((PREROLL * SAMPLE_RATE) / STATE_STEP);
  // states from..to sound up to to−1, so the wrap-around runs one state further, to meet the start
  const passes = [
    { from: Math.max(0, first - preroll), keepFrom: first, to: count },
    { from: 0, keepFrom: 0, to: first > 0 ? first + 1 : 0 },
  ];
  for (const { from, keepFrom, to } of passes) {
    if (to <= from) continue;
    let column = Math.floor((keepFrom * STATE_STEP) / SPECTROGRAM.hop);
    for (const block of r.engine.synthesize(L.states, L.weight, from, to, { blockStates: BLOCK_STATES })) {
      const skip = Math.max(0, keepFrom - (block.firstState - 1)) * STATE_STEP; // the preroll is not sent
      if (skip < block.samples.length) {
        const samples = block.samples.slice(skip);
        const at = (block.firstState - 1) * STATE_STEP + skip;
        for (let i = 0; i < samples.length; i++) samples[i] *= gain;
        audio.set(samples, at);
        const upto = Math.floor((at + samples.length - SPECTROGRAM.window / 2) / SPECTROGRAM.hop);
        const pixels = upto > column ? spectrogramColumns(audio, column, upto) : null;
        post(
          {
            type: 'audio',
            id,
            start: at,
            samples,
            spectrogram: pixels ? { column, count: upto - column, pixels } : null,
          },
          pixels ? [samples.buffer, pixels.buffer] : [samples.buffer],
        );
        if (pixels) column = upto;
      }
      await yieldNow();
      if (id !== current) return;
    }
    if (keepFrom === 0 && first > 0) {
      // where the two passes meet: the first drew its first columns without the sound before
      const upto = Math.min(
        Math.floor(audio.length / SPECTROGRAM.hop),
        Math.floor((first * STATE_STEP) / SPECTROGRAM.hop) +
          Math.ceil(SPECTROGRAM.window / 2 / SPECTROGRAM.hop),
      );
      if (upto > column) {
        const pixels = spectrogramColumns(audio, column, upto);
        post(
          {
            type: 'audio',
            id,
            start: 0,
            samples: new Float32Array(0),
            spectrogram: { column, count: upto - column, pixels },
          },
          [pixels.buffer],
        );
      }
    }
  }
  post({ type: 'done', id });
}

let setupDone: (r: Reduction) => void = () => undefined;
const reductionReady = new Promise<Reduction>((resolve) => {
  setupDone = resolve;
});

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'setup') {
    setupDone(message.reduction);
    return;
  }
  current = message.id;
  void (async () => {
    try {
      resources ??= load();
      const [r, hummed] = await Promise.all([resources, reductionReady]);
      if (message.id !== current) return;
      await render(r, hummed, message.id, message.level, message.start);
    } catch (error) {
      post({
        type: 'error',
        id: message.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
};
