import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SPECTROGRAM, SPECTROGRAM_STYLES, isSpectrogramStyleName } from '../src/shared/spectrogram.ts';
import { SAMPLE_RATE } from '../src/shared/units.ts';
import { makeSpectrogram } from '../src/worker/spectrogram.ts';

const tone = (hz: number, amplitude: number): Float32Array =>
  Float32Array.from(
    { length: SAMPLE_RATE },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE),
  );

describe('the spectrogram styles', () => {
  for (const [name, style] of Object.entries(SPECTROGRAM_STYLES)) {
    it(`${name}: draws a 220 Hz tone in its row, dark on white`, () => {
      const column = makeSpectrogram(style)(tone(220, 0.1), 0, 50, 51);
      const darkest = column.indexOf(Math.min(...column));
      const rowOf = (hz: number): number =>
        ((Math.log(style.fmax) - Math.log(hz)) / (Math.log(style.fmax) - Math.log(style.fmin))) *
        (SPECTROGRAM.rows - 1);
      assert.ok(
        Math.abs(darkest - rowOf(220)) < 2,
        `darkest row ${darkest}, expected ${rowOf(220).toFixed(1)}`,
      );
      assert.ok((column[darkest] ?? 255) < 128, 'the tone is dark');
      assert.equal(column[0], 255, 'the top row is white');
    });
  }
  it('knows its names', () => {
    assert.ok(isSpectrogramStyleName('melodic'));
    assert.ok(!isSpectrogramStyleName('toString'));
    assert.ok(!isSpectrogramStyleName(null));
  });
});
