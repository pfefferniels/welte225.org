import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { seededRandom } from '../src/shared/math.ts';
import {
  SPECTROGRAM,
  SPECTROGRAM_STYLES,
  isSpectrogramStyleName,
  type SpectrogramStyle,
} from '../src/shared/spectrogram.ts';
import { SAMPLE_RATE } from '../src/shared/units.ts';
import { makeSpectrogram } from '../src/worker/spectrogram.ts';
import { assertGolden } from './golden.ts';

const tone = (hz: number, amplitude: number): Float32Array =>
  Float32Array.from(
    { length: SAMPLE_RATE },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE),
  );

/**
 * Three seconds that try the scales: silence, a voice of twelve harmonics gliding from 180 to
 * 330 Hz and swelling until its strongest partials are full black, over a little noise, then the
 * noise alone, far below what either style draws, and silence again.
 */
function swell(rate: number): Float32Array {
  const random = seededRandom(225);
  const sound = new Float32Array(3 * rate);
  let phase = 0;
  for (let i = 0; i < sound.length; i++) {
    const t = i / rate;
    if (t < 0.4 || t >= 2.8) continue;
    const noise = random.uniform(-1, 1);
    if (t >= 2.2) {
      sound[i] = 1e-5 * noise;
      continue;
    }
    const along = (t - 0.4) / 1.8;
    phase += (2 * Math.PI * (180 + 150 * along)) / rate;
    let voice = 0;
    for (let h = 1; h <= 12; h++) voice += Math.sin(h * phase) / h;
    sound[i] = 0.3 * Math.sin(Math.PI * along) ** 2 * voice + 1e-3 * noise;
  }
  return sound;
}

/**
 * The fingerprint of the swell's 300 columns, asked for as a worker asks: the first from the whole
 * sound, the rest from parts of it that begin later, so that windows reach before the part and
 * past its end.
 */
function fingerprint(style: SpectrogramStyle, rate: number): string {
  const sound = swell(rate);
  const columns = makeSpectrogram(style, rate);
  const hash = createHash('sha256');
  hash.update(columns(sound, 0, 0, 120));
  const offset = Math.round(1.1 * rate);
  hash.update(columns(sound.subarray(offset, Math.round(2.05 * rate)), offset, 120, 200));
  hash.update(columns(sound.subarray(2 * rate), 2 * rate, 200, 201));
  hash.update(columns(sound.subarray(2 * rate), 2 * rate, 201, 300));
  return hash.digest('hex');
}

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
  it('draws sound of another rate in the same rows, a column every hundredth of a second', () => {
    const rate = 48000;
    const style = SPECTROGRAM_STYLES.melodic;
    const sound = Float32Array.from({ length: rate }, (_, i) =>
      i < rate / 2 ? 0 : 0.1 * Math.sin((2 * Math.PI * 220 * i) / rate),
    );
    const columns = makeSpectrogram(style, rate)(sound, 0, 0, 100);
    const column = (c: number): Uint8Array =>
      columns.subarray(c * SPECTROGRAM.rows, (c + 1) * SPECTROGRAM.rows);
    const row = Math.round(
      ((Math.log(style.fmax) - Math.log(220)) / (Math.log(style.fmax) - Math.log(style.fmin))) *
        (SPECTROGRAM.rows - 1),
    );
    assert.equal(Math.min(...column(30)), 255, 'silent before the tone');
    const late = column(80);
    assert.ok(Math.abs(late.indexOf(Math.min(...late)) - row) < 2);
    assert.ok((late[row] ?? 255) < 128);
  });
  // The fingerprints were taken from the columns as they were first written: a radix-2 FFT of the
  // whole frame, and of every row two magnitudes and a logarithm or a power. The transform of
  // the lowest bins alone and the tabulated greys draw the same pixels.
  for (const [name, style] of Object.entries(SPECTROGRAM_STYLES)) {
    it(`${name}: draws the swell pixel for pixel as it did`, () => {
      assertGolden(`spectrogram.${name}`, fingerprint(style, SAMPLE_RATE));
    });
  }
  it("draws the swell at 48 kHz on the piano's scale pixel for pixel as it did", () => {
    const style: SpectrogramStyle = {
      ...SPECTROGRAM_STYLES.melodic,
      scale: { kind: 'amplitude', full: 217, power: 0.7 },
    };
    assertGolden('spectrogram.piano48k', fingerprint(style, 48000));
  });
  it('draws a column the same from a part of the sound that only just holds its window', () => {
    const sound = swell(SAMPLE_RATE);
    for (const style of Object.values(SPECTROGRAM_STYLES)) {
      const columns = makeSpectrogram(style);
      const whole = columns(sound, 0, 90, 110);
      for (let c = 90; c < 110; c++) {
        const from = c * SPECTROGRAM.hop - style.window / 2;
        const part = sound.subarray(from, from + style.window);
        assert.deepEqual(
          columns(part, from, c, c + 1),
          whole.subarray((c - 90) * SPECTROGRAM.rows, (c - 89) * SPECTROGRAM.rows),
        );
      }
    }
  });
  it('leaves the rows above half the sample rate white', () => {
    const rate = 8000;
    const style = SPECTROGRAM_STYLES.full;
    const sound = Float32Array.from(
      { length: rate },
      (_, i) => 0.1 * Math.sin((2 * Math.PI * 220 * i) / rate),
    );
    const column = makeSpectrogram(style, rate)(sound, 0, 50, 51);
    const nyquist = Math.ceil(
      ((Math.log(style.fmax) - Math.log(rate / 2)) / (Math.log(style.fmax) - Math.log(style.fmin))) *
        (SPECTROGRAM.rows - 1),
    );
    assert.ok(nyquist > 5);
    assert.ok(column.subarray(0, nyquist - 1).every((grey) => grey === 255));
    assert.ok(Math.min(...column) < 128, 'the tone is drawn');
  });
  it('makes the columns of a style and rate once', () => {
    const style = SPECTROGRAM_STYLES.melodic;
    assert.equal(makeSpectrogram({ ...style }), makeSpectrogram(style, SAMPLE_RATE));
    assert.notEqual(makeSpectrogram(style, 48000), makeSpectrogram(style));
    assert.notEqual(
      makeSpectrogram({ ...style, scale: { ...style.scale, power: 0.7 } }),
      makeSpectrogram(style),
    );
  });
  it('leaves silence white', () => {
    for (const style of Object.values(SPECTROGRAM_STYLES)) {
      const columns = makeSpectrogram(style)(new Float32Array(SAMPLE_RATE), 0, 0, 100);
      assert.ok(columns.every((grey) => grey === 255));
    }
  });
  it('knows its names', () => {
    assert.ok(isSpectrogramStyleName('melodic'));
    assert.ok(!isSpectrogramStyleName('toString'));
    assert.ok(!isSpectrogramStyleName(null));
  });
});
