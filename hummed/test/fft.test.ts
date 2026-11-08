import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeFft } from '../src/worker/fft.ts';

describe('makeFft', () => {
  const fft = makeFft(64);
  it('turns an impulse into a flat spectrum', () => {
    const x = new Float64Array(64);
    x[0] = 1;
    const { re, im } = fft(x);
    for (let k = 0; k < 64; k++) assert.ok(Math.abs(Math.hypot(re[k], im[k]) - 1) < 1e-12);
  });
  it('finds a sinusoid in its bin', () => {
    const x = Float64Array.from({ length: 64 }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / 64));
    const { re, im } = fft(x);
    const mags = Array.from({ length: 33 }, (_, k) => Math.hypot(re[k], im[k]));
    assert.equal(mags.indexOf(Math.max(...mags)), 5);
    assert.ok(Math.abs(mags[5] - 32) < 1e-9);
  });
  it('refuses a size that is no power of two', () => {
    assert.throws(() => makeFft(100), RangeError);
  });
});
