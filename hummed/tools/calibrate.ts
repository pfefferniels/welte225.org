// Calibrate the voice: render it at the page's first elaboration (as the page does), measure each
// sung note's level against what the dynamics ask, and store per-note corrections (by xml:id) and
// the output gain in data/calibration.json. Run after changing the reduction, the hum style, the
// voice's pitch line, its exaggeration or the reconstruction:   npm run calibrate [-- rounds]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderVoice, sungLine } from '../src/hummer/index.ts';
import type { Calibration } from '../src/hummer/style.ts';
import { clip, interp } from '../src/shared/math.ts';
import { PAD_MS, SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';
import {
  loadCalibration,
  loadEngine,
  loadReduction,
  loadStyle,
  ROOT,
  voicePerformance,
} from './node-support.ts';
import { readDynamics, readPerformance, repair } from '../src/hummer/performance.ts';
import { Clock } from '../src/hummer/clock.ts';
import { voiceStates } from '../src/worker/voice-states.ts';

const ROUNDS = Number(process.argv[2] ?? '2');
/** The voice's loudness target (dB RMS over its voiced samples) that sets the gain. */
const TARGET_DB = -31;
const LIMIT_DB = 12;

const quantile = (values: readonly number[], q: number): number => {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

const engine = await loadEngine();
const reduction = loadReduction();
const style = loadStyle();
const { performance: voiceData, dynamics, approximateness, range, turns } = voicePerformance();
let calibration: Calibration = loadCalibration();

// the sung notes as the voice holds them, and the dynamics they should follow
const { notes, sustain } = readPerformance(voiceData);
repair(notes);
const curve = readDynamics(dynamics);
const { melody, voice } = sungLine({
  reduction,
  notes,
  sustain,
  clock: new Clock(notes, sustain),
  dynamics: curve,
  turns,
});
const pad = PAD_MS / 1000;

for (let round = 1; round <= ROUNDS; round++) {
  const v = renderVoice({
    performance: voiceData,
    dynamics,
    reduction,
    style,
    calibration,
    approximateness,
    range,
    turns,
  });
  const max = Math.ceil(((v.endMs / 1000) * SAMPLE_RATE) / STATE_STEP) + 10;
  const states = voiceStates(engine, v, max);
  const y = new Float32Array(states.closed.count * STATE_STEP);
  const t0 = performance.now();
  for (const block of engine.synthesize(states, v.weight, 0, states.closed.count, { blockStates: 400 }))
    y.set(block.samples, (block.firstState - 1) * STATE_STEP);
  const seconds = (performance.now() - t0) / 1000;

  // a 40 ms RMS envelope
  const win = Math.round(0.04 * SAMPLE_RATE);
  const envelope = new Float64Array(y.length);
  let acc = 0;
  for (let i = 0; i < y.length; i++) {
    acc += y[i] * y[i];
    if (i >= win) acc -= y[i - win] * y[i - win];
    envelope[i] = Math.sqrt(Math.max(acc, 0) / win) + 1e-9;
  }
  // per note: the 80th percentile of the level it should have, against the one it has
  const errors = new Map<string, number>();
  voice.forEach((note, k) => {
    const d = note.off - note.on;
    const a = note.on + pad + 0.3 * d;
    const b = note.off + pad - 0.15 * d;
    if (b - a < 0.01) return;
    const segment = Array.from(envelope.subarray(Math.floor(a * SAMPLE_RATE), Math.floor(b * SAMPLE_RATE)));
    const m = melody[k];
    const offset = m.velocity - interp(m.onsetMs / 1000, curve.times, curve.values);
    const want: number[] = [];
    for (let t = note.on + 0.3 * d; t < note.off - 0.15 * d; t += d / 20)
      want.push(40 * Math.log10(Math.max(1, interp(t, curve.times, curve.values) + offset) / 127));
    errors.set(m.id, quantile(want, 0.8) - 20 * Math.log10(quantile(segment, 0.8)));
  });
  const all = [...errors.values()];
  const median = quantile(all, 0.5);
  const deviation = all.map((e) => Math.abs(e - median));
  console.log(
    `round ${round}: ${(y.length / SAMPLE_RATE).toFixed(1)} s of voice in ${seconds.toFixed(1)} s; ` +
      `note level against the dynamics before: median ${quantile(deviation, 0.5).toFixed(2)} dB, 90th percentile ${quantile(deviation, 0.9).toFixed(2)} dB`,
  );

  const corrected: Record<string, number> = { ...calibration.notes };
  for (const [id, error] of errors) {
    const before = calibration.notes[id] ?? 0;
    corrected[id] = Math.round(clip(before + error - median, -LIMIT_DB, LIMIT_DB) * 1000) / 1000;
  }
  let peak = 0;
  for (const x of y) peak = Math.max(peak, Math.abs(x));
  let energy = 0;
  let voiced = 0;
  for (const x of y) {
    if (Math.abs(x) > peak * 1e-3) {
      energy += x * x;
      voiced++;
    }
  }
  const gain = Math.round((Math.pow(10, TARGET_DB / 20) / Math.sqrt(energy / voiced)) * 1e4) / 1e4;
  calibration = { gain, notes: corrected };
}

writeFileSync(join(ROOT, 'data/calibration.json'), JSON.stringify(calibration, null, 2) + '\n');
console.log(`gain ${calibration.gain}; written to data/calibration.json`);
