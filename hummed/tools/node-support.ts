// What the tools and tests need to run the browser code in Node: VocalTractLab (vtl.js, an
// Emscripten CommonJS module), the MEI reader on an xmldom document, the data, the performance.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';
import { DOMParser } from '@xmldom/xmldom';
import type { PerformanceData } from 'espressivo';
import { parseCalibration, parseHumStyle } from '../src/hummer/data.ts';
import { dynamicsRange, turningPoints, type DynamicsRange, type Turns } from '../src/hummer/performance.ts';
import { voiceStyle, type Calibration, type HumStyle } from '../src/hummer/style.ts';
import { readReduction, type XmlElement } from '../src/reduction/mei.ts';
import type { Voice } from '../src/hummer/index.ts';
import type { Reduction } from '../src/reduction/types.ts';
import { chunkOrder, type Chunk } from '../src/shared/chunks.ts';
import type { Setting } from '../src/shared/protocol.ts';
import { SPECTROGRAM_STYLES } from '../src/shared/spectrogram.ts';
import { STATE_STEP } from '../src/shared/units.ts';
import { VtlEngine } from '../src/vtl/engine.ts';
import type { CreateVtl, VtlModule } from '../src/vtl/module.ts';
import { renderChunk } from '../src/worker/chunk.ts';
import { DEFAULT_ELABORATION, shapeAt, shapeOf, threshold } from '../src/worker/levels.ts';
import { materials, type Materials } from '../src/worker/materials.ts';
import type { Reductions, Score } from '../src/worker/reductions.ts';
import { performPiano, type PianoScore } from '../src/worker/piano.ts';
import {
  hum,
  makeLevel,
  performDynamics,
  performNotes,
  performVoice,
  planOf,
  voiceMpm,
  type HumData,
  type Level,
} from '../src/worker/prepare.ts';
import { maxStatesOf, scoreStates } from '../src/worker/voice-states.ts';

/** The hummed/ directory. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

export function loadReduction(path = 'reduction/reduction.mei'): Reduction {
  const doc = new DOMParser().parseFromString(read(path), 'application/xml');
  return readReduction(doc.documentElement as unknown as XmlElement);
}

/** The hum style the voice sings with: the recording's (data/hum-style.json), as set by ear. */
export const loadStyle = (): HumStyle => voiceStyle(parseHumStyle(JSON.parse(read('data/hum-style.json'))));
export const loadCalibration = (): Calibration => parseCalibration(JSON.parse(read('data/calibration.json')));

/** The reconstruction the site publishes (../mpm/). */
export const loadScore = (): { msm: string; mpm: string } => ({
  msm: read('../mpm/score.msm'),
  mpm: read('../mpm/performance.mpm'),
});

let made: Materials | null = null;
/** What the piano plays and the voice follows, as the worker makes them (materials.ts). */
export const loadMaterials = (): Materials =>
  (made ??= materials({
    ...loadScore(),
    halves: read('reduction/halves.mei'),
    quarters: read('reduction/quarters.mei'),
    accompaniment: read('reduction/harmonies.mei'),
    melody: JSON.parse(read('data/melody.json')) as string[],
  }));

/** The harmonic reductions, their MPM and the lines over them, as the worker makes them. */
export const loadReductions = (): Reductions => loadMaterials().reductions();

/** What the piano plays from at an elaboration, as the worker reads it: the piece as it plays it there, the harmonies there, the MPMs. */
export const loadPianoScore = (elaboration = DEFAULT_ELABORATION): PianoScore =>
  loadMaterials().pianoScore(elaboration).score;

/** What the voice follows at an elaboration (the piece, or a harmonic reduction), and what it sings. */
export function voiceSource(elaboration = DEFAULT_ELABORATION): {
  readonly score: Score;
  readonly reduction: Reduction;
} {
  return {
    score: loadMaterials().voiceScore(elaboration),
    reduction: loadMaterials().sung(elaboration, loadReduction()),
  };
}

/**
 * The voice's performance at an elaboration, as the worker renders it, how loosely it sings, and
 * the MPM's own range of dynamics and turning points.
 */
export function voicePerformance(elaboration = DEFAULT_ELABORATION): {
  performance: PerformanceData;
  dynamics: PerformanceData;
  approximateness: number;
  range: DynamicsRange;
  turns: Turns;
  threshold: number;
} {
  const score = loadScore();
  return {
    ...performVoice(voiceSource(elaboration).score, shapeAt(elaboration)),
    approximateness: shapeAt(elaboration).approximateness,
    range: dynamicsRange(score.mpm),
    turns: turningPoints(score.mpm),
    threshold: threshold(shapeAt(elaboration)),
  };
}

/** What the hummer reads beside the performance, as the worker loads it. */
export function loadHumData(): HumData {
  const { mpm } = loadScore();
  return {
    range: dynamicsRange(mpm),
    turns: turningPoints(mpm),
    style: loadStyle(),
    calibration: loadCalibration(),
  };
}

/** vtl.js evaluated as the CommonJS module it is (the package is ESM, so it cannot be required). */
export async function loadVtl(file = join(ROOT, 'vtl.js')): Promise<VtlModule> {
  const module = { exports: {} as unknown };
  type CommonJs = (
    exports: unknown,
    require: NodeJS.Require,
    module: { exports: unknown },
    file: string,
    dir: string,
  ) => void;
  const run = compileFunction(readFileSync(file, 'utf8'), [
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
  ]) as CommonJs;
  run(module.exports, createRequire(file), module, file, ROOT);
  const createVtl = module.exports as CreateVtl;
  return createVtl({ print: () => undefined, printErr: () => undefined });
}

export const loadSpeaker = (): string => read('data/hummer.speaker.xml');

export async function loadEngine(): Promise<VtlEngine> {
  return new VtlEngine(await loadVtl(), loadSpeaker());
}

/**
 * The voice of a plain setting, hummed as a voice worker hums it when it prepares the setting alone
 * (worker.ts: `prepare`): what the voice follows performed with its MPM, the dynamics performed after
 * the notes, the hummer over what is sung there. Needs no VocalTractLab.
 */
export function humAt(elaboration: number): Voice {
  const setting: Setting = { elaboration };
  const shape = shapeOf(setting);
  const score = loadMaterials().voiceScore(elaboration);
  const mpm = voiceMpm(score, shape);
  const performance = performNotes(score, mpm, shape);
  const dynamics = performDynamics(score, mpm);
  return hum(
    { performance, dynamics },
    loadMaterials().sung(elaboration, loadReduction()),
    loadHumData(),
    shape,
  );
}

/**
 * The fingerprint of a voice's gestural scores and opening, as test/voice.test.ts takes it: what
 * VocalTractLab is given, and so what tells a rendering of the voice as it is now.
 */
export const voiceFingerprint = (voice: Pick<Voice, 'closedScore' | 'openScore' | 'weight'>): string =>
  createHash('sha256')
    .update(voice.closedScore)
    .update(voice.openScore)
    .update(new Uint8Array(voice.weight.buffer, voice.weight.byteOffset, voice.weight.byteLength))
    .digest('hex');

/**
 * A plain setting prepared as a voice worker prepares it alone: the voice hummed (`humAt`), the
 * closed score's tract states and then the open one's, the piano's two parts and where its harmonies
 * roll a chord. The timings are left at nothing, so that a level made twice is the same.
 */
export function prepareLevel(engine: VtlEngine, elaboration: number): { voice: Voice; level: Level } {
  const setting: Setting = { elaboration };
  const voice = humAt(elaboration);
  const maxStates = maxStatesOf(voice);
  const closed = scoreStates(engine, voice.closedScore, maxStates, voice.moves);
  const open = scoreStates(engine, voice.openScore, maxStates, voice.moves);
  const { score, rolls } = loadMaterials().pianoScore(elaboration);
  const piano = { ...performPiano(score, shapeOf(setting)), rolls };
  const timings = { espressivo: 0, hummer: 0, gestures: 0 };
  return { voice, level: makeLevel(setting, voice, { closed, open }, piano, timings) };
}

/** No spectrogram columns: what a chunk's sound is does not depend on them. */
const NO_COLUMNS = (): Uint8Array => new Uint8Array(0);

/**
 * A level's whole voice as the voice workers send it when the page plays it from the beginning:
 * every chunk of `chunkOrder` (each settled before it as a worker settles it) rendered with
 * `renderChunk` at the calibration's gain, its samples laid where the page lays them; or only the
 * chunks given, the rest silent.
 */
export function renderLevel(
  engine: VtlEngine,
  level: Level,
  chunks: readonly Chunk[] = chunkOrder(planOf(level, 0, { seconds: 0 })),
): Float32Array {
  const out = new Float32Array((level.plan.stateCount - 1) * STATE_STEP);
  const options = { style: SPECTROGRAM_STYLES.melodic, columns: NO_COLUMNS, gain: loadCalibration().gain };
  for (const [from, to] of chunks)
    for (const part of renderChunk(engine, level, from, to, options))
      if (part) out.set(part.samples, part.start);
  return out;
}
