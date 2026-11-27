// A setting rendered ahead has its voice drawn from its sound as a whole, by the worker that draws the
// piano (picture.ts); one rendered as you listen, chunk by chunk with the sound, by the voice's
// workers (chunk.ts). The two pictures are the same, column for column: a chunk is cut where the voice
// is silent, and rendered on past its end for the columns whose window reaches beyond it. Here the
// sound is made up (a hum with silences), and a stand-in engine hands it out as VocalTractLab would.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkOrder } from '../src/shared/chunks.ts';
import type { PictureColumns } from '../src/shared/protocol.ts';
import { SPECTROGRAM, SPECTROGRAM_STYLES } from '../src/shared/spectrogram.ts';
import { SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';
import type { AudioBlock, StatePair, VtlEngine } from '../src/vtl/engine.ts';
import { renderChunk } from '../src/worker/chunk.ts';
import { arrived, drawPicture, type Arriving } from '../src/worker/picture.ts';
import { makeSpectrogram } from '../src/worker/spectrogram.ts';

const SECONDS = 12;
const COUNT = Math.round((SECONDS * SAMPLE_RATE) / STATE_STEP) + 1;
/** Silences of 0.4 s every 2 s, the voice's seams in their middle. */
const SEAMS = Array.from({ length: SECONDS / 2 - 1 }, (_, k) =>
  Math.round(((2 * (k + 1) + 0.2) * SAMPLE_RATE) / STATE_STEP),
);

/** A hum: a few partials over a gliding pitch, under an envelope that is nothing in the silences. */
function hum(i: number): number {
  const t = i / SAMPLE_RATE;
  const within = t % 2;
  if (t > 2 && within < 0.4) return 0;
  const envelope = Math.sin(Math.PI * Math.min(1, (within - 0.4) / 1.6 + 0.2)) ** 2;
  const f0 = 110 * (1 + 0.2 * Math.sin(2 * Math.PI * 0.3 * t));
  let x = 0;
  for (let h = 1; h <= 6; h++) x += Math.sin(2 * Math.PI * f0 * h * t) / h;
  return 0.2 * envelope * x;
}

/** The sound as VocalTractLab hands it out: a state's samples from its own on, in blocks. */
const engine = {
  *synthesize(
    _states: StatePair,
    _weight: Float32Array,
    from: number,
    to: number,
    options: { blockStates: number },
  ) {
    const end = Math.min(to, COUNT);
    for (let first = from + 1; first < end; first += options.blockStates) {
      const states = Math.min(options.blockStates, end - first);
      const samples = Float32Array.from({ length: states * STATE_STEP }, (_, k) =>
        hum((first - 1) * STATE_STEP + k),
      );
      yield { samples, firstState: first } satisfies AudioBlock;
    }
  },
} as unknown as VtlEngine;

describe("a voice's picture", () => {
  it('is the same drawn from the whole sound as drawn chunk by chunk while it renders', async () => {
    const style = SPECTROGRAM_STYLES.melodic;
    const columns = makeSpectrogram(style);
    const total = Math.ceil((((COUNT - 1) * STATE_STEP) / SAMPLE_RATE) * SPECTROGRAM.columnsPerSecond);
    const live = new Uint8Array(total * SPECTROGRAM.rows);
    const sound = new Float32Array((COUNT - 1) * STATE_STEP);
    const source = {
      states: { closed: { count: COUNT } } as unknown as StatePair,
      weight: new Float32Array(1),
      seams: new Set(SEAMS),
    };
    const chunks = chunkOrder({ stateCount: COUNT, seams: SEAMS, startState: Math.round(COUNT * 0.4) });
    assert.ok(chunks.length >= 4);
    for (const [from, to] of chunks)
      for (const part of renderChunk(engine, source, from, to, { style, columns, gain: 1 })) {
        if (!part) continue;
        sound.set(part.samples, part.start);
        if (part.spectrogram) live.set(part.spectrogram.pixels, part.spectrogram.column * SPECTROGRAM.rows);
      }
    const whole = new Uint8Array(total * SPECTROGRAM.rows);
    // handed over as the page hands it, in pieces of a second, from before the first column on
    // to the end and then from the beginning, the worker drawing as they come
    const from = 700;
    const first = from * SPECTROGRAM.hop - style.window / 2 - SPECTROGRAM.hop;
    const arriving: Arriving = {
      samples: new Float32Array(sound.length),
      first,
      received: 0,
      wake: () => undefined,
    };
    let drawn = 0;
    const drawing = drawPicture(
      {
        type: 'picture',
        id: 1,
        length: sound.length,
        first,
        sampleRate: SAMPLE_RATE,
        spectrogram: 'melodic',
        scale: style.scale,
        from,
      },
      arriving,
      (message: PictureColumns) => {
        whole.set(message.pixels, message.column * SPECTROGRAM.rows);
        drawn += message.count;
      },
      () =>
        new Promise((resolve) =>
          setImmediate(() => {
            resolve(true);
          }),
        ),
    );
    const pieces: [number, number][] = [];
    for (let a = first; a < sound.length; a += SAMPLE_RATE)
      pieces.push([a, Math.min(sound.length, a + SAMPLE_RATE)]);
    for (let a = 0; a < first; a += SAMPLE_RATE) pieces.push([a, Math.min(first, a + SAMPLE_RATE)]);
    let before = 0;
    for (const [a, b] of pieces) {
      // nothing is drawn of what has not come
      await new Promise((resolve) => setImmediate(resolve));
      assert.ok(drawn >= before);
      before = drawn;
      arriving.samples.set(sound.subarray(a, b), a);
      arriving.received += b - a;
      arriving.wake();
    }
    await drawing;
    assert.equal(drawn, total);
    // a column's window is all there before it is drawn
    assert.ok(!arrived({ ...arriving, received: 10 }, 0, 100));
    assert.ok(arrived({ ...arriving, received: 10 }, first, first + 10));
    let differ = 0;
    for (let i = 0; i < whole.length; i++) if (whole[i] !== live[i]) differ++;
    assert.equal(differ, 0);
    // and there is a picture to compare: the hum is drawn
    assert.ok(whole.some((grey) => grey < 128));
  });
});
