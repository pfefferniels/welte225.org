// A take's sound as a WAV file: written by the page, read by the tools.

export class WavError extends Error {
  override name = 'WavError';
}

/** Mono samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return bytes;
}

/** A WAV file (16-bit PCM or 32-bit float) as mono samples, its channels averaged. */
export function decodeWav(bytes: Uint8Array): {
  readonly samples: Float32Array;
  readonly sampleRate: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new WavError('not a WAV file');
  let format = 0;
  let channels = 1;
  let sampleRate = 0;
  let bits = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') {
      format = view.getUint16(at + 8, true);
      channels = view.getUint16(at + 10, true);
      sampleRate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
    } else if (tag(at) === 'data') {
      const float = format === 3 && bits === 32;
      if (!float && !(format === 1 && bits === 16))
        throw new WavError(`WAV format ${format}/${bits} is not read`);
      const width = bits / 8;
      const frames = Math.floor(Math.min(size, bytes.length - at - 8) / (width * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const p = at + 8 + (i * channels + c) * width;
          sum += float ? view.getFloat32(p, true) : view.getInt16(p, true) / 32768;
        }
        samples[i] = sum / channels;
      }
      return { samples, sampleRate };
    }
    at += 8 + size + (size & 1);
  }
  throw new WavError('the WAV file has no sound');
}

/** Samples at another rate, by straight lines between them (the voice lies far below either rate). */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const out = new Float32Array(Math.floor((samples.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const x = (i * from) / to;
    const k = Math.floor(x);
    const next = samples[Math.min(samples.length - 1, k + 1)];
    out[i] = samples[k] + (x - k) * (next - samples[k]);
  }
  return out;
}
