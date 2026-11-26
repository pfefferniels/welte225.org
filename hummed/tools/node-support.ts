// What the tools and tests need to run the browser code in Node: VocalTractLab (vtl.js, an
// Emscripten CommonJS module), the MEI reader on an xmldom document, the data, the performance.
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
import type { Reduction } from '../src/reduction/types.ts';
import { VtlEngine } from '../src/vtl/engine.ts';
import type { CreateVtl, VtlModule } from '../src/vtl/module.ts';
import { DEFAULT_ELABORATION, shapeAt, threshold } from '../src/worker/levels.ts';
import { materials, type Materials } from '../src/worker/materials.ts';
import type { Reductions, Score } from '../src/worker/reductions.ts';
import type { PianoScore } from '../src/worker/piano.ts';
import { performVoice, type HumData } from '../src/worker/prepare.ts';

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
