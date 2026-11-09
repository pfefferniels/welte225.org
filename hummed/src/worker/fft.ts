// The spectrum of a stretch of real sound under a window, as far up as it is wanted: a spectrogram
// column reads only the lowest bins (280 of the 4097 up to half the sample rate in the melodic
// range), and the transform is planned for those.
//
// The sound is real, so its samples go in pairs, one as the real and the next as the imaginary part,
// through a complex FFT of half the size, and the spectrum is untangled from that one's bins k and
// -k. The FFT is decimation in time, and it stops early: at blocks about as long as there are bins
// wanted, each the transform of every eighth pair, say. The stages left would compute every bin of
// ever longer blocks; instead each bin wanted is summed from the blocks directly. Up to there the
// stages are radix 4, and windowing, the bit reversal and the first three stages are one pass over
// the sound.
//
// Its bins differ from a plain FFT's in the last bits, as any two orders of the same sums do.

export interface Spectrum {
  /** The bins from 0 on; the arrays are used again by the next transform. */
  readonly re: Float64Array;
  readonly im: Float64Array;
}

/** e^(-2 pi i j m / length) for j below `count` and m from 1 to `powers`, real and imaginary parts in turn. */
function twiddlesOf(length: number, count: number, powers: number): Float64Array {
  const twiddles = new Float64Array(2 * powers * count);
  for (let j = 0, t = 0; j < count; j++) {
    for (let m = 1; m <= powers; m++) {
      twiddles[t++] = Math.cos((2 * Math.PI * m * j) / length);
      twiddles[t++] = -Math.sin((2 * Math.PI * m * j) / length);
    }
  }
  return twiddles;
}

/**
 * The transform of `size` samples (a power of two, 16 at least) of which the first are weighted by
 * `window` and the rest count as zero, giving the bins below `bins` (at most size/2 + 1). It reads
 * `size` samples from `start` on, all of which must be there.
 */
export function makeSpectrum(
  size: number,
  window: ArrayLike<number>,
  bins: number,
): (samples: ArrayLike<number>, start: number) => Spectrum {
  const half = size >> 1;
  const bits = Math.log2(half);
  if (!Number.isInteger(bits) || bits < 3) throw new RangeError(`FFT size ${size} is not a power of two`);
  if (window.length > size) throw new RangeError(`a window of ${window.length} in an FFT of ${size}`);
  if (!(bins >= 1 && bins <= half + 1)) throw new RangeError(`${bins} bins of an FFT of ${size}`);

  // The first pass takes the pairs of samples eight at a time, in bit-reversed order: the pairs
  // n + (0, 4, 2, 6, 1, 5, 3, 7) half/8 of the half-size FFT.
  const eighth = size >> 3;
  const groups = half >> 3;
  const source = new Int32Array(groups);
  const weights = new Float64Array(2 * half);
  for (let g = 0; g < groups; g++) {
    let n = 0;
    for (let b = 3; b < bits; b++) n |= ((g >> (b - 3)) & 1) << (bits - 1 - b);
    source[g] = 2 * n;
    [0, 4, 2, 6, 1, 5, 3, 7].forEach((pair, p) => {
      for (let i = 0; i < 2; i++) {
        const sample = 2 * n + pair * eighth + i;
        weights[16 * g + 2 * p + i] = sample < window.length ? window[sample] : 0;
      }
    });
  }

  // The blocks the stages build: the shortest of 8, 32, 128, ... pairs that holds the bins asked
  // for (so that the stages come in twos), or the longest there is.
  let block = 8;
  while (block < bins && 4 * block <= half) block <<= 2;
  const stages: { readonly length: number; readonly twiddles: Float64Array }[] = [];
  for (let length = 32; length <= block; length <<= 2)
    stages.push({ length, twiddles: twiddlesOf(length, length >> 2, 3) });

  // Bin k of the half-size FFT is the sum of bin k of every block (k modulo the block's length),
  // each turned by e^(-2 pi i k n / half), where n is the first pair of the block: its number
  // bit-reversed.
  const blocks = half / block;
  const turns = new Float64Array(2 * (blocks - 1) * bins);
  for (let k = 0, t = 0; k < bins; k++) {
    for (let r = 1; r < blocks; r++) {
      let n = 0;
      for (let b = 1; b < blocks; b <<= 1) n = (n << 1) | (r & b ? 1 : 0);
      turns[t++] = Math.cos((2 * Math.PI * k * n) / half);
      turns[t++] = -Math.sin((2 * Math.PI * k * n) / half);
    }
  }
  /** The turn between the even and the odd samples' spectra in each bin: e^(-2 pi i k / size). */
  const turn = twiddlesOf(size, bins, 1);

  /** The half-size FFT, real and imaginary parts in turn. */
  const z = new Float64Array(2 * half);
  const re = new Float64Array(bins);
  const im = new Float64Array(bins);
  const spectrum: Spectrum = { re, im };
  const s2 = 2 * eighth;
  const s3 = 3 * eighth;
  const s4 = 4 * eighth;
  const s5 = 5 * eighth;
  const s6 = 6 * eighth;
  const s7 = 7 * eighth;
  const h = Math.SQRT1_2;

  return (samples, start) => {
    for (let g = 0, w = 0; g < groups; g++, w += 16) {
      const s = start + source[g];
      // the eight pairs under the window
      const p0r = samples[s] * weights[w];
      const p0i = samples[s + 1] * weights[w + 1];
      const p1r = samples[s + s4] * weights[w + 2];
      const p1i = samples[s + s4 + 1] * weights[w + 3];
      const p2r = samples[s + s2] * weights[w + 4];
      const p2i = samples[s + s2 + 1] * weights[w + 5];
      const p3r = samples[s + s6] * weights[w + 6];
      const p3i = samples[s + s6 + 1] * weights[w + 7];
      const p4r = samples[s + eighth] * weights[w + 8];
      const p4i = samples[s + eighth + 1] * weights[w + 9];
      const p5r = samples[s + s5] * weights[w + 10];
      const p5i = samples[s + s5 + 1] * weights[w + 11];
      const p6r = samples[s + s3] * weights[w + 12];
      const p6i = samples[s + s3 + 1] * weights[w + 13];
      const p7r = samples[s + s7] * weights[w + 14];
      const p7i = samples[s + s7 + 1] * weights[w + 15];
      // blocks of two
      const a0r = p0r + p1r;
      const a0i = p0i + p1i;
      const a1r = p0r - p1r;
      const a1i = p0i - p1i;
      const a2r = p2r + p3r;
      const a2i = p2i + p3i;
      const a3r = p2r - p3r;
      const a3i = p2i - p3i;
      const a4r = p4r + p5r;
      const a4i = p4i + p5i;
      const a5r = p4r - p5r;
      const a5i = p4i - p5i;
      const a6r = p6r + p7r;
      const a6i = p6i + p7i;
      const a7r = p6r - p7r;
      const a7i = p6i - p7i;
      // blocks of four: the second of each pair turned by 1 or -i
      const b0r = a0r + a2r;
      const b0i = a0i + a2i;
      const b2r = a0r - a2r;
      const b2i = a0i - a2i;
      const b1r = a1r + a3i;
      const b1i = a1i - a3r;
      const b3r = a1r - a3i;
      const b3i = a1i + a3r;
      const b4r = a4r + a6r;
      const b4i = a4i + a6i;
      const b6r = a4r - a6r;
      const b6i = a4i - a6i;
      const b5r = a5r + a7i;
      const b5i = a5i - a7r;
      const b7r = a5r - a7i;
      const b7i = a5i + a7r;
      // the block of eight: the second four turned by 1, e^(-i pi/4), -i, e^(-3i pi/4)
      const t5r = h * (b5r + b5i);
      const t5i = h * (b5i - b5r);
      const t7r = h * (b7i - b7r);
      const t7i = -h * (b7r + b7i);
      z[w] = b0r + b4r;
      z[w + 1] = b0i + b4i;
      z[w + 2] = b1r + t5r;
      z[w + 3] = b1i + t5i;
      z[w + 4] = b2r + b6i;
      z[w + 5] = b2i - b6r;
      z[w + 6] = b3r + t7r;
      z[w + 7] = b3i + t7i;
      z[w + 8] = b0r - b4r;
      z[w + 9] = b0i - b4i;
      z[w + 10] = b1r - t5r;
      z[w + 11] = b1i - t5i;
      z[w + 12] = b2r - b6i;
      z[w + 13] = b2i + b6r;
      z[w + 14] = b3r - t7r;
      z[w + 15] = b3i - t7i;
    }
    for (const stage of stages) radix4(z, stage.length, stage.twiddles);
    // Bin k of the sound is E + turn O, where E and O are the spectra of its even and its odd
    // samples: (Z[k] + Z[-k]*) / 2 and (Z[k] - Z[-k]*) / 2i of the half-size FFT. Z[k] and Z[-k]*
    // are summed from the blocks, with the same turns.
    const mask = block - 1;
    const step = 2 * block;
    for (let k = 0, t = 0; k < bins; k++) {
      let a = 2 * (k & mask);
      let b = 2 * ((block - k) & mask);
      let pr = z[a];
      let pi = z[a + 1];
      let qr = z[b];
      let qi = -z[b + 1];
      for (let r = 1; r < blocks; r++, t += 2) {
        a += step;
        b += step;
        const c = turns[t];
        const s = turns[t + 1];
        pr += z[a] * c - z[a + 1] * s;
        pi += z[a] * s + z[a + 1] * c;
        qr += z[b] * c + z[b + 1] * s;
        qi += z[b] * s - z[b + 1] * c;
      }
      const or = 0.5 * (pi - qi);
      const oi = 0.5 * (qr - pr);
      const c = turn[2 * k];
      const s = turn[2 * k + 1];
      re[k] = 0.5 * (pr + qr) + (c * or - s * oi);
      im[k] = 0.5 * (pi + qi) + (c * oi + s * or);
    }
    return spectrum;
  };
}

/**
 * A radix-4 stage: every block of `length` from its four quarters, each a transform already. A
 * place in the block has the same twiddles in every block, so the blocks are the inner loop.
 */
function radix4(z: Float64Array, length: number, twiddles: Float64Array): void {
  const quarter = length >> 1; // in numbers, two to a bin
  for (let j = 0, t = 0; j < quarter; j += 2, t += 6) {
    const w1r = twiddles[t];
    const w1i = twiddles[t + 1];
    const w2r = twiddles[t + 2];
    const w2i = twiddles[t + 3];
    const w3r = twiddles[t + 4];
    const w3i = twiddles[t + 5];
    for (let i0 = j; i0 < z.length; i0 += 2 * length) {
      const i1 = i0 + quarter;
      const i2 = i1 + quarter;
      const i3 = i2 + quarter;
      const ar = z[i0];
      const ai = z[i0 + 1];
      const x1r = z[i1];
      const x1i = z[i1 + 1];
      const x2r = z[i2];
      const x2i = z[i2 + 1];
      const x3r = z[i3];
      const x3i = z[i3 + 1];
      // the second quarter turned by w^2j, the third by w^j, the fourth by w^3j
      const br = x1r * w2r - x1i * w2i;
      const bi = x1r * w2i + x1i * w2r;
      const cr = x2r * w1r - x2i * w1i;
      const ci = x2r * w1i + x2i * w1r;
      const dr = x3r * w3r - x3i * w3i;
      const di = x3r * w3i + x3i * w3r;
      const pr = ar + br;
      const pi = ai + bi;
      const mr = ar - br;
      const mi = ai - bi;
      const qr = cr + dr;
      const qi = ci + di;
      const nr = cr - dr;
      const ni = ci - di;
      z[i0] = pr + qr;
      z[i0 + 1] = pi + qi;
      z[i1] = mr + ni;
      z[i1 + 1] = mi - nr;
      z[i2] = pr - qr;
      z[i2 + 1] = pi - qi;
      z[i3] = mr - ni;
      z[i3 + 1] = mi + nr;
    }
  }
}
