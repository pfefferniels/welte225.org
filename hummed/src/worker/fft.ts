/** An in-place radix-2 FFT of a fixed size, with its tables made once. */
export function makeFft(size: number): (input: ArrayLike<number>) => { re: Float64Array; im: Float64Array } {
  const bits = Math.log2(size);
  if (!Number.isInteger(bits)) throw new RangeError(`FFT size ${size} is not a power of two`);
  const reverse = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reverse[i] = r;
  }
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / size);
    sin[i] = Math.sin((-2 * Math.PI * i) / size);
  }
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  return (input) => {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < input.length; i++) re[reverse[i]] = input[i];
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const stride = size / len;
      for (let i = 0; i < size; i += len) {
        for (let j = 0; j < half; j++) {
          const k = j * stride;
          const a = i + j;
          const b = a + half;
          const tr = re[b] * cos[k] - im[b] * sin[k];
          const ti = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
    return { re, im };
  };
}
