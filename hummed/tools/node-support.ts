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
import type { Calibration, HumStyle } from '../src/hummer/style.ts';
import { readReduction, type XmlElement } from '../src/reduction/mei.ts';
import type { Reduction } from '../src/reduction/types.ts';
import { VtlEngine } from '../src/vtl/engine.ts';
import type { CreateVtl, VtlModule } from '../src/vtl/module.ts';
import { approximateness, DEFAULT_ELABORATION, threshold, shapeAt, stageAt } from '../src/worker/levels.ts';
import { harmoniesScore } from '../src/worker/harmonies.ts';
import {
  harmoniesAt,
  reductions,
  sungReduction,
  voiceScore,
  type Reductions,
  type Score,
} from '../src/worker/reductions.ts';
import type { PianoScore } from '../src/worker/piano.ts';
import { performVoice, type HumData } from '../src/worker/prepare.ts';

/** The hummed/ directory. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

export function loadReduction(path = 'reduction/reduction.mei'): Reduction {
  const doc = new DOMParser().parseFromString(read(path), 'application/xml');
  return readReduction(doc.documentElement as unknown as XmlElement);
}

export const loadStyle = (): HumStyle => parseHumStyle(JSON.parse(read('data/hum-style.json')));
export const loadCalibration = (): Calibration => parseCalibration(JSON.parse(read('data/calibration.json')));

/** The reconstruction the site publishes (../mpm/). */
export const loadScore = (): { msm: string; mpm: string } => ({
  msm: read('../mpm/score.msm'),
  mpm: read('../mpm/performance.mpm'),
});

let made: Reductions | null = null;
/** The harmonic reductions, their MPM and the line over them, as the worker makes them. */
export const loadReductions = (): Reductions =>
  (made ??= reductions(
    harmoniesScore(read('reduction/halves.mei')),
    harmoniesScore(read('reduction/harmonies.mei')),
    loadScore().mpm,
  ));

/** What the piano plays from at an elaboration, as the worker reads it: the piece, the harmonies there, the MPMs. */
export function loadPianoScore(elaboration = DEFAULT_ELABORATION): PianoScore {
  return {
    ...loadScore(),
    harmonies: harmoniesAt(stageAt(elaboration), loadReductions),
    harmoniesMpm: loadReductions().mpm,
  };
}

/** What the voice follows at an elaboration (the piece, or the half notes), and what it sings. */
export function voiceSource(elaboration = DEFAULT_ELABORATION): {
  readonly score: Score;
  readonly reduction: Reduction;
} {
  const stage = stageAt(elaboration);
  return {
    score: voiceScore(stage, loadScore(), loadReductions),
    reduction: sungReduction(stage, loadReduction(), loadReductions),
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
    approximateness: approximateness(elaboration),
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
