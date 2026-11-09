// Measure the voice in Node as a worker renders it: the preparation of a setting (espressivo, the
// hummer, VocalTractLab's gestural model), then the whole piece chunk by chunk as the page hands
// the chunks out from the beginning, with the spectrogram's columns. Prints where the time goes,
// how fast the voice comes against real time, and the fingerprints of the sound and of the
// picture, to hold a faster build to the same output:
//   npm run bench [-- --elaboration 0.65] [--vtl <another vtl.js>] [--spectrogram full] [--seconds 30]
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { renderVoice } from '../src/hummer/index.ts';
import { chunkOrder } from '../src/page/pool.ts';
import { isSpectrogramStyleName, SPECTROGRAM, SPECTROGRAM_STYLES } from '../src/shared/spectrogram.ts';
import { SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';
import { VtlEngine } from '../src/vtl/engine.ts';
import type { VtlModule } from '../src/vtl/module.ts';
import { DEFAULT_ELABORATION } from '../src/worker/levels.ts';
import { makeSpectrogram } from '../src/worker/spectrogram.ts';
import { voiceStates } from '../src/worker/voice-states.ts';
import {
  loadCalibration,
  loadReduction,
  loadSpeaker,
  loadStyle,
  loadVtl,
  voicePerformance,
} from './node-support.ts';

const { values } = parseArgs({
  options: {
    elaboration: { type: 'string', default: String(DEFAULT_ELABORATION) },
    vtl: { type: 'string' },
    spectrogram: { type: 'string', default: 'melodic' },
    /** Render only the chunks that begin before this many seconds. */
    seconds: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
});
const elaboration = Number(values.elaboration);
if (!isSpectrogramStyleName(values.spectrogram))
  throw new Error(`no spectrogram style ${values.spectrogram}`);
const style = SPECTROGRAM_STYLES[values.spectrogram];
const limit = values.seconds === undefined ? Infinity : Number(values.seconds);

const now = (): number => performance.now();
const spent = { geometry: 0, acoustics: 0, spectrogram: 0, tubes: 0 };

// VocalTractLab's two parts timed apart
const module = await loadVtl(values.vtl === undefined ? undefined : resolve(values.vtl));
const timed: VtlModule = Object.create(module) as VtlModule;
Object.assign(timed, {
  _vtlFastTractToTube: (...args: Parameters<VtlModule['_vtlFastTractToTube']>) => {
    const t = now();
    const result = module._vtlFastTractToTube(...args);
    spent.geometry += now() - t;
    spent.tubes++;
    return result;
  },
  _vtlSynthesisAddTube: (...args: Parameters<VtlModule['_vtlSynthesisAddTube']>) => {
    const t = now();
    const result = module._vtlSynthesisAddTube(...args);
    spent.acoustics += now() - t;
    return result;
  },
});
const engine = new VtlEngine(timed, loadSpeaker());

const t0 = now();
const performed = voicePerformance(elaboration);
const t1 = now();
const voice = renderVoice({
  ...performed,
  reduction: loadReduction(),
  style: loadStyle(),
  calibration: loadCalibration(),
});
const t2 = now();
const maxStates = Math.ceil(((voice.endMs / 1000) * SAMPLE_RATE) / STATE_STEP) + 10;
const states = voiceStates(engine, voice, maxStates);
const t3 = now();

// the chunks as the page orders them from the beginning, each rendered as the worker renders it
const count = states.closed.count;
const msPerState = (STATE_STEP / SAMPLE_RATE) * 1000;
const seams = voice.seams.map((ms) => Math.round(ms / msPerState)).filter((i) => i > 0 && i < count);
const seamSet = new Set(seams);
const columns = makeSpectrogram(style);
const { hop, rows } = SPECTROGRAM;
const audio = new Float32Array((count - 1) * STATE_STEP);
const picture = new Uint8Array(Math.ceil(((count - 1) * STATE_STEP) / hop) * rows);
const gain = loadCalibration().gain;
let renderedStates = 0;
let firstBlock = 0;
const t4 = now();
for (const [from, to] of chunkOrder({ stateCount: count, seams, startState: 0 })) {
  if ((from * STATE_STEP) / SAMPLE_RATE >= limit) continue;
  const settle = from === 0 ? 0 : seamSet.has(from) ? 0.05 : 0.3;
  const a = Math.max(0, from - Math.round((settle * SAMPLE_RATE) / STATE_STEP));
  const b = Math.min(count, to + Math.ceil(style.window / 2 / STATE_STEP) + 1);
  const offset = a * STATE_STEP;
  const local = new Float32Array((b - a) * STATE_STEP);
  const keep0 = from * STATE_STEP;
  const keep1 = Math.min(to * STATE_STEP, (count - 1) * STATE_STEP);
  const lastColumn = Math.ceil(keep1 / hop);
  let column = Math.ceil(keep0 / hop);
  const draw = (upto: number): void => {
    if (upto <= column) return;
    const t = now();
    picture.set(columns(local, offset, column, upto), column * rows);
    spent.spectrogram += now() - t;
    column = upto;
  };
  for (const block of engine.synthesize(states, voice.weight, a, b, { blockStates: 40 })) {
    const at = (block.firstState - 1) * STATE_STEP;
    const samples = block.samples;
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
    local.set(samples, at - offset);
    const filled = at + samples.length;
    const s0 = Math.max(at, keep0);
    const s1 = Math.min(filled, keep1);
    if (s1 > s0) audio.set(samples.subarray(s0 - at, s1 - at), s0);
    draw(Math.min(lastColumn, Math.floor((filled - style.window / 2) / hop) + 1));
    if (firstBlock === 0) firstBlock = now() - t4;
  }
  draw(lastColumn);
  renderedStates += b - a;
}
const t5 = now();

const sha = (bytes: ArrayBufferView): string =>
  createHash('sha256')
    .update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    .digest('hex');
const seconds = (count * STATE_STEP) / SAMPLE_RATE;
const rendered = (renderedStates * STATE_STEP) / SAMPLE_RATE;
const render = t5 - t4;
const result = {
  elaboration,
  seconds: +seconds.toFixed(2),
  renderedSeconds: +rendered.toFixed(2),
  prepare: {
    espressivo: +(t1 - t0).toFixed(0),
    hummer: +(t2 - t1).toFixed(0),
    gestures: +(t3 - t2).toFixed(0),
  },
  firstBlockMs: +firstBlock.toFixed(1),
  render: {
    total: +render.toFixed(0),
    acoustics: +spent.acoustics.toFixed(0),
    geometry: +spent.geometry.toFixed(0),
    tubes: spent.tubes,
    spectrogram: +spent.spectrogram.toFixed(0),
    other: +(render - spent.acoustics - spent.geometry - spent.spectrogram).toFixed(0),
  },
  timesRealTime: +(rendered / (render / 1000)).toFixed(2),
  audio: sha(audio),
  picture: sha(picture),
};
if (values.json) console.log(JSON.stringify(result));
else console.log(result);
