// VocalTractLab itself (vtl.js): the speaker loads, a score becomes states, the states become sound.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderVoice } from '../src/hummer/index.ts';
import { SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';
import {
  loadCalibration,
  loadEngine,
  loadReduction,
  loadStyle,
  voicePerformance,
} from '../tools/node-support.ts';

describe('VocalTractLab', async () => {
  const engine = await loadEngine();
  const voice = renderVoice({
    ...voicePerformance(1),
    reduction: loadReduction(),
    style: loadStyle(),
    calibration: loadCalibration(),
  });
  const max = Math.ceil(((voice.endMs / 1000) * SAMPLE_RATE) / STATE_STEP) + 10;
  const states = { closed: engine.states(voice.closedScore, max), open: engine.states(voice.openScore, max) };

  it('runs at the rates the page assumes', () => {
    assert.equal(engine.constants.sampleRate, SAMPLE_RATE);
    assert.equal(engine.constants.step, STATE_STEP);
  });

  it('turns both scores into as many states', () => {
    assert.equal(states.open.count, states.closed.count);
    assert.ok(Math.abs((states.closed.count * STATE_STEP) / SAMPLE_RATE - voice.endMs / 1000) < 0.1);
  });

  it('hums the first notes (0.5 to 3 s)', () => {
    const from = Math.round((0.5 * SAMPLE_RATE) / STATE_STEP);
    const to = Math.round((3 * SAMPLE_RATE) / STATE_STEP);
    const blocks = [...engine.synthesize(states, voice.weight, from, to, { blockStates: 40 })];
    const audio = Float32Array.from(blocks.flatMap((b) => Array.from(b.samples)));
    assert.equal(audio.length, (to - from - 1) * STATE_STEP);
    assert.equal(blocks[0]?.firstState, from + 1);
    assert.ok(audio.every(Number.isFinite));
    const rms = Math.sqrt(audio.reduce((s, x) => s + x * x, 0) / audio.length);
    assert.ok(rms > 1e-3, `rms ${rms}`);
  });
});
