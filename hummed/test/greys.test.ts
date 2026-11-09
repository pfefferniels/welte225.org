import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seededRandom } from '../src/shared/math.ts';
import { PIANO_SCALES, SPECTROGRAM_STYLES, type SpectrogramScale } from '../src/shared/spectrogram.ts';
import { CELLS, greysOf, shadeOf } from '../src/worker/greys.ts';

const scales: Record<string, SpectrogramScale> = {
  'the decibel scale': SPECTROGRAM_STYLES.full.scale,
  "the piano's scale": PIANO_SCALES.melodic,
  'amplitude itself': SPECTROGRAM_STYLES.melodic.scale,
  'the square of the amplitude': { kind: 'amplitude', full: 1, power: 2 },
};

describe('the table of greys', () => {
  for (const [name, scale] of Object.entries(scales)) {
    const shade = shadeOf(scale);
    const greys = greysOf(shade);
    it(`${name}: is white for silence and black for the loudest`, () => {
      assert.equal(greys[0], 255);
      assert.equal(greys[CELLS], 0);
    });
    it(`${name}: gives the grey the shade rounds to, wherever it gives one`, () => {
      const random = seededRandom(255);
      const check = (level: number): void => {
        const grey = greys[(level * CELLS) | 0];
        if (grey >= 0) assert.equal(grey, Math.round(shade(level)), `level ${level}`);
      };
      for (let cell = 0; cell < CELLS; cell++) {
        // the ends of every cell, to the last bit, and a level within it
        check(cell / CELLS);
        check((cell + 1) / CELLS - 2 ** -53);
        check((cell + random.uniform(0, 1)) / CELLS);
      }
      check(1);
    });
    it(`${name}: leaves few cells to the shade`, () => {
      const left = greys.reduce((n, grey) => n + (grey < 0 ? 1 : 0), 0);
      // the grey changes 255 times, once where two cells meet
      assert.ok(left >= 255 && left <= 256, `${left} cells`);
    });
  }
});
