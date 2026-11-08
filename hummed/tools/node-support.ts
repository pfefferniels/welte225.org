// What the tools and tests need to run the browser code in Node: VocalTractLab (vtl.js, an
// Emscripten CommonJS module), the MEI reader on an xmldom document, the data, the performance.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';
import { DOMParser } from '@xmldom/xmldom';
import { exaggerateMpm, performMsmToData, type PerformanceData } from 'espressivo';
import { parseCalibration, parseHumStyle } from '../src/hummer/data.ts';
import type { Calibration, HumStyle } from '../src/hummer/style.ts';
import { readReduction, type XmlElement } from '../src/reduction/mei.ts';
import type { Reduction } from '../src/reduction/types.ts';
import { VtlEngine } from '../src/vtl/engine.ts';
import type { CreateVtl } from '../src/vtl/module.ts';
import {
  approximateness,
  DEFAULT_ELABORATION,
  voiceFactors,
  voiceLead,
  withSubNoteDynamics,
} from '../src/worker/levels.ts';
import { harmoniesScore } from '../src/worker/harmonies.ts';
import type { PianoScore } from '../src/worker/piano.ts';

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

/** What the piano plays from, as the worker reads it: the piece, its harmonies, the MPM. */
export function loadPianoScore(): PianoScore {
  return { ...loadScore(), harmonies: harmoniesScore(read('reduction/harmonies.mei')) };
}

/** The voice's performance at a saturation and an elaboration, as the worker renders it, and how loosely it sings. */
export function voicePerformance(
  level: number,
  elaboration = DEFAULT_ELABORATION,
): { performance: PerformanceData; dynamics: PerformanceData; approximateness: number } {
  const { msm, mpm } = loadScore();
  const voiceMpm = exaggerateMpm(mpm, { factors: voiceFactors(level, voiceLead(elaboration)) }).mpm;
  return {
    performance: performMsmToData({ msm, mpm: voiceMpm }),
    dynamics: performMsmToData({ msm, mpm: withSubNoteDynamics(voiceMpm) }),
    approximateness: approximateness(elaboration),
  };
}

/** vtl.js evaluated as the CommonJS module it is (the package is ESM, so it cannot be required). */
export async function loadEngine(): Promise<VtlEngine> {
  const file = join(ROOT, 'vtl.js');
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
  const vtl = await createVtl({ print: () => undefined, printErr: () => undefined });
  return new VtlEngine(vtl, read('data/hummer.speaker.xml'));
}
