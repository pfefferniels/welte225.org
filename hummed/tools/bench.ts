// Measure the voice in Node as a worker renders it, with the worker's own code: the preparation of
// a setting (espressivo for the voice and for the piano's two parts, the hummer, VocalTractLab's
// gestural model), then the whole piece chunk by chunk as the page hands the chunks out from the
// beginning, with the spectrogram's columns. Prints where the time goes, how soon the first sound
// comes, how fast the voice comes against real time, and the fingerprints of the sound and of the
// picture, to hold a faster build to the same output:
//   npm run bench [-- --elaboration 0.65] [--vtl <another vtl.js>] [--spectrogram full] [--seconds 30]
//     [--audio <file>: the sound as raw 32-bit floats, to compare two builds sample by sample]
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chunkOrder } from '../src/shared/chunks.ts';
import { isSpectrogramStyleName, SPECTROGRAM, SPECTROGRAM_STYLES } from '../src/shared/spectrogram.ts';
import { SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';
import { VtlEngine } from '../src/vtl/engine.ts';
import type { VtlModule } from '../src/vtl/module.ts';
import { chunkSpan, FIRST_SOUND, renderChunk } from '../src/worker/chunk.ts';
import { DEFAULT_ELABORATION, shapeAt } from '../src/worker/levels.ts';
import { performPiano } from '../src/worker/piano.ts';
import { hum, makeLevel, performVoice, planOf } from '../src/worker/prepare.ts';
import type { SpectrogramColumns } from '../src/worker/spectrogram.ts';
import { makeSpectrogram } from '../src/worker/spectrogram.ts';
import { maxStatesOf, scoreStates } from '../src/worker/voice-states.ts';
import { loadHumData, loadPianoScore, loadReduction, loadSpeaker, loadVtl } from './node-support.ts';

const { values } = parseArgs({
  options: {
    elaboration: { type: 'string', default: String(DEFAULT_ELABORATION) },
    vtl: { type: 'string' },
    spectrogram: { type: 'string', default: 'melodic' },
    /** Render only the chunks that begin before this many seconds. */
    seconds: { type: 'string' },
    audio: { type: 'string' },
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
const score = loadPianoScore();
const data = loadHumData();
const reduction = loadReduction();

// the preparation, step by step as a worker alone goes through it
const t0 = now();
const performed = performVoice(score, shapeAt(elaboration));
const t1 = now();
const voice = hum(performed, reduction, data, shapeAt(elaboration));
const t2 = now();
const maxStates = maxStatesOf(voice);
const states = {
  closed: scoreStates(engine, voice.closedScore, maxStates, voice.moves),
  open: scoreStates(engine, voice.openScore, maxStates, voice.moves),
};
const t3 = now();
const piano = performPiano(score, shapeAt(elaboration));
const t4 = now();
const level = makeLevel({ elaboration }, voice, states, piano, {
  espressivo: t1 - t0 + (t4 - t3),
  hummer: t2 - t1,
  gestures: t3 - t2,
});

// the chunks as the page orders them from the beginning, each rendered as the worker renders it
const plan = planOf(level, 1, { seconds: 0 });
const count = plan.stateCount;
const { hop, rows } = SPECTROGRAM;
const audio = new Float32Array((count - 1) * STATE_STEP);
const picture = new Uint8Array(Math.ceil(((count - 1) * STATE_STEP) / hop) * rows);
const spectrogram = makeSpectrogram(style);
const columns: SpectrogramColumns = (...args) => {
  const t = now();
  const pixels = spectrogram(...args);
  spent.spectrogram += now() - t;
  return pixels;
};
const options = { style, columns, gain: data.calibration.gain };
let renderedStates = 0;
let firstBlock = 0;
let firstSound = 0;
const t5 = now();
for (const [from, to] of chunkOrder(plan)) {
  if ((from * STATE_STEP) / SAMPLE_RATE >= limit) continue;
  let sent = 0;
  for (const part of renderChunk(engine, level, from, to, options)) {
    if (firstBlock === 0) firstBlock = now() - t5;
    if (!part) continue;
    audio.set(part.samples, part.start);
    sent += part.samples.length;
    if (firstSound === 0 && sent >= FIRST_SOUND * SAMPLE_RATE) firstSound = now() - t5;
    if (part.spectrogram) picture.set(part.spectrogram.pixels, part.spectrogram.column * rows);
  }
  const span = chunkSpan(from, to, count, level.seams, style);
  renderedStates += span.b - span.a;
}
const t6 = now();

const sha = (bytes: ArrayBufferView): string =>
  createHash('sha256')
    .update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    .digest('hex');
if (values.audio !== undefined)
  writeFileSync(resolve(values.audio), new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength));
const seconds = (count * STATE_STEP) / SAMPLE_RATE;
const rendered = (renderedStates * STATE_STEP) / SAMPLE_RATE;
const render = t6 - t5;
const result = {
  elaboration,
  seconds: +seconds.toFixed(2),
  renderedSeconds: +rendered.toFixed(2),
  prepare: {
    espressivo: +(t1 - t0).toFixed(0),
    hummer: +(t2 - t1).toFixed(0),
    gestures: +(t3 - t2).toFixed(0),
    piano: +(t4 - t3).toFixed(0),
  },
  firstBlockMs: +firstBlock.toFixed(1),
  /** Until the first half second of sound is out: what the page needs before it plays. */
  firstSoundMs: +firstSound.toFixed(1),
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
