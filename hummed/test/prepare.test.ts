// A setting prepared by several workers, and rendered in chunks: whoever makes a part of it, and
// whichever worker renders a chunk, the result is the same.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { readDynamics } from '../src/hummer/index.ts';
import { chunkOrder } from '../src/shared/chunks.ts';
import { SPECTROGRAM, SPECTROGRAM_STYLES } from '../src/shared/spectrogram.ts';
import { SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';
import { chunkSpan, FIRST_SOUND, renderChunk, type ChunkPart } from '../src/worker/chunk.ts';
import { DEFAULT_ELABORATION } from '../src/worker/levels.ts';
import {
  copyLevel,
  hum,
  levelFrom,
  makeLevel,
  performDynamics,
  performNotes,
  performVoice,
  planOf,
  voiceMpm,
} from '../src/worker/prepare.ts';
import { makeSpectrogram } from '../src/worker/spectrogram.ts';
import { maxStatesOf, scoreStates, voiceStates } from '../src/worker/voice-states.ts';
import { loadEngine, loadHumData, loadReduction, loadScore } from '../tools/node-support.ts';

const sha = (bytes: ArrayBufferView): string =>
  createHash('sha256')
    .update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    .digest('hex');

describe('a setting prepared', async () => {
  const engine = await loadEngine();
  const score = loadScore();
  const data = loadHumData();
  const reduction = loadReduction();
  const performed = performVoice(score, DEFAULT_ELABORATION);
  const voice = hum(performed, reduction, data, DEFAULT_ELABORATION);
  const maxStates = maxStatesOf(voice);
  const states = voiceStates(engine, voice, maxStates);
  const part = { keys: [], sustain: [], soft: [] };
  const level = makeLevel(
    { elaboration: DEFAULT_ELABORATION },
    voice,
    states,
    {
      piece: part,
      harmonies: part,
    },
    { espressivo: 0, hummer: 0, gestures: 0 },
  );
  const style = SPECTROGRAM_STYLES.melodic;
  const options = { style, columns: makeSpectrogram(style), gain: data.calibration.gain };
  const render = (source: typeof level, from: number, to: number): ChunkPart[] =>
    [...renderChunk(engine, source, from, to, options)].filter((p) => p !== null);

  it('hums the same from the dynamics another worker performed', () => {
    const mpm = voiceMpm(score, DEFAULT_ELABORATION);
    // as it arrives from the other worker: read there, copied on the way
    const curve = structuredClone(readDynamics(performDynamics(score, mpm)));
    const other = hum(
      { performance: performNotes(score, mpm), dynamics: curve },
      reduction,
      data,
      DEFAULT_ELABORATION,
    );
    assert.equal(other.closedScore, voice.closedScore);
    assert.equal(other.openScore, voice.openScore);
    assert.equal(sha(other.weight), sha(voice.weight));
    assert.deepEqual(other.seams, voice.seams);
  });

  it('gets the open score’s states the same from a worker that has made nothing else', async () => {
    const other = await loadEngine();
    const open = scoreStates(other, voice.openScore, maxStates, voice.moves);
    assert.equal(open.count, states.open.count);
    assert.equal(sha(open.tract), sha(states.open.tract));
    // the scores differ in the mouth alone: the glottis is the same, and only one is kept
    assert.equal(sha(states.open.glottis), sha(states.closed.glottis));
  });

  it('plans from the place asked for, at the start of a 10 ms slot', () => {
    const plan = planOf(level, 7, { seconds: 12.345 });
    assert.equal(plan.id, 7);
    assert.equal(plan.startSeconds, 12.345);
    assert.equal(plan.startState, Math.floor((1234 * (SAMPLE_RATE / 100)) / STATE_STEP));
    assert.equal(plan.stateCount, states.closed.count);
    const tick = plan.clock.ticks[10];
    const byTick = planOf(level, 8, { tick });
    assert.ok(Math.abs(byTick.startSeconds - (plan.clock.ms[10] / 1000 + 0.6)) < 1e-9);
  });

  it('settles the voice before a chunk: not at the beginning, briefly at a seam, longer elsewhere', () => {
    const count = level.states.closed.count;
    const seam = [...level.seams][3];
    const ahead = Math.ceil(style.window / 2 / STATE_STEP) + 1;
    assert.deepEqual(chunkSpan(0, 1000, count, level.seams, style), {
      a: 0,
      b: 1000 + ahead,
      keep0: 0,
      keep1: 1000 * STATE_STEP,
      firstColumn: 0,
      lastColumn: Math.ceil((1000 * STATE_STEP) / SPECTROGRAM.hop),
    });
    assert.equal(chunkSpan(seam, seam + 1000, count, level.seams, style).a, seam - 20);
    assert.equal(chunkSpan(seam + 1, seam + 1000, count, level.seams, style).a, seam + 1 - 120);
    // the last chunk ends with the last state's sound
    const last = chunkSpan(count - 500, count, count, level.seams, style);
    assert.equal(last.b, count);
    assert.equal(last.keep1, (count - 1) * STATE_STEP);
  });

  it('gives a chunk’s sound and columns once each, the first sound before any column', () => {
    const [from, to] = chunkOrder(planOf(level, 1, { seconds: 4 }))[0];
    const span = chunkSpan(from, to, level.states.closed.count, level.seams, style);
    let sample = span.keep0;
    let column = span.firstColumn;
    for (const part of render(level, from, to)) {
      if (part.samples.length > 0) {
        assert.equal(part.start, sample);
        sample += part.samples.length;
      }
      if (part.spectrogram) {
        assert.ok(sample - span.keep0 >= Math.min(FIRST_SOUND * SAMPLE_RATE, span.keep1 - span.keep0));
        assert.equal(part.spectrogram.column, column);
        assert.equal(part.spectrogram.pixels.length, part.spectrogram.count * SPECTROGRAM.rows);
        column += part.spectrogram.count;
      }
    }
    assert.equal(sample, span.keep1);
    assert.equal(column, span.lastColumn);
  });

  it('renders a chunk the same from a level handed to another worker', () => {
    const { data: copy, transfer } = copyLevel(level);
    assert.equal(transfer.length, 4);
    // as it arrives: its buffers moved, the rest copied
    const handed = levelFrom(structuredClone(copy, { transfer }));
    assert.deepEqual(handed.plan, level.plan);
    assert.deepEqual(handed.seams, level.seams);
    const seam = [...level.seams][1];
    const fingerprint = (parts: readonly ChunkPart[]): string => {
      const hash = createHash('sha256');
      for (const p of parts) {
        hash.update(new Uint8Array(p.samples.buffer, p.samples.byteOffset, p.samples.byteLength));
        if (p.spectrogram) hash.update(p.spectrogram.pixels);
      }
      return hash.digest('hex');
    };
    assert.equal(fingerprint(render(handed, seam, seam + 400)), fingerprint(render(level, seam, seam + 400)));
  });
});
