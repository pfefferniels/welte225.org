import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seededRandom } from '../src/shared/math.ts';
import { makeSpectrum } from '../src/worker/fft.ts';

/** Bin k of `size` samples from `start` on under the window, summed term by term. */
function dft(
  samples: ArrayLike<number>,
  start: number,
  window: ArrayLike<number>,
  size: number,
  k: number,
): [number, number] {
  let re = 0;
  let im = 0;
  for (let n = 0; n < window.length; n++) {
    const x = samples[start + n] * window[n];
    re += x * Math.cos((2 * Math.PI * k * n) / size);
    im -= x * Math.sin((2 * Math.PI * k * n) / size);
  }
  return [re, im];
}

const ones = (length: number): Float64Array => new Float64Array(length).fill(1);

describe('makeSpectrum', () => {
  it('turns an impulse into a flat spectrum', () => {
    const x = new Float64Array(64);
    x[0] = 1;
    const { re, im } = makeSpectrum(64, ones(64), 33)(x, 0);
    assert.equal(re.length, 33);
    for (let k = 0; k <= 32; k++) assert.ok(Math.abs(Math.hypot(re[k], im[k]) - 1) < 1e-12);
  });
  it('finds a sinusoid in its bin', () => {
    const x = Float64Array.from({ length: 64 }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / 64));
    const { re, im } = makeSpectrum(64, ones(64), 33)(x, 0);
    const mags = Array.from({ length: 33 }, (_, k) => Math.hypot(re[k], im[k]));
    assert.equal(mags.indexOf(Math.max(...mags)), 5);
    assert.ok(Math.abs(mags[5] - 32) < 1e-9);
  });
  it('gives the bins of the sum it stands for, however many are asked for', () => {
    const random = seededRandom(64);
    for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
      const half = size / 2;
      // few bins, about as many as a block of the FFT holds, and all there are
      for (const bins of new Set([1, 2, 7, 8, 9, half / 4 + 1, half / 2, half - 1, half, half + 1])) {
        // a window as long as the FFT, a shorter one that is zero-padded, and odd lengths
        for (const length of [size, half, size - 3, 5]) {
          const window = Float64Array.from({ length }, () => random.uniform(0, 1));
          const sound = Float32Array.from({ length: size + 11 }, () => random.uniform(-1, 1));
          const start = Math.floor(random.uniform(0, 12));
          const { re, im } = makeSpectrum(size, window, bins)(sound, start);
          assert.equal(re.length, bins);
          for (let k = 0; k < bins; k++) {
            const [r, i] = dft(sound, start, window, size, k);
            const off = Math.hypot(re[k] - r, im[k] - i);
            assert.ok(off < 1e-9, `size ${size}, ${bins} bins, window ${length}, bin ${k}: off by ${off}`);
          }
        }
      }
    }
  });
  it("gives a column's bins: 8192 samples under a Hann window, the lowest 280 bins", () => {
    const random = seededRandom(8192);
    const hann = Float64Array.from(
      { length: 8192 },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 8191),
    );
    const sound = Float32Array.from({ length: 9000 }, () => random.uniform(-1, 1));
    const { re, im } = makeSpectrum(8192, hann, 280)(sound, 441);
    for (let k = 0; k < 280; k++) {
      const [r, i] = dft(sound, 441, hann, 8192, k);
      assert.ok(Math.hypot(re[k] - r, im[k] - i) < 1e-9, `bin ${k}`);
    }
  });
  it('leaves silence at zero', () => {
    const { re, im } = makeSpectrum(256, ones(256), 100)(new Float32Array(256), 0);
    assert.ok(re.every((x) => x === 0) && im.every((x) => x === 0));
  });
  it('refuses a size that is no power of two, a window longer than it, and bins it has not', () => {
    assert.throws(() => makeSpectrum(100, ones(100), 10), RangeError);
    assert.throws(() => makeSpectrum(8, ones(8), 4), RangeError);
    assert.throws(() => makeSpectrum(64, ones(65), 10), RangeError);
    assert.throws(() => makeSpectrum(64, ones(64), 34), RangeError);
    assert.throws(() => makeSpectrum(64, ones(64), 0), RangeError);
  });
});
