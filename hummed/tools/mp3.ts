// The voice's recordings as sound files: written as MP3 by ffmpeg (LAME), and read back as a browser
// or ffmpeg decodes them, for `npm run voices` to measure where the decoded sound lies against the
// rendering, and for the tests to check that `alignVoice` finds it.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { SAMPLE_RATE } from '../src/shared/units.ts';

/**
 * LAME's variable bitrate at this quality (`-q:a`, 0 the best): for the humming 41 to 51 kbit/s, 34
 * to 41 dB above the coding noise. One step better gives 1.5 to 2 dB more for an eighth to a sixth
 * more, one worse 2 to 4 dB less for a sixth to a fifth less (see the README).
 */
export const MP3_QUALITY = 4;

/** Whether ffmpeg is there to be run. */
export const hasFfmpeg = (): boolean => !spawnSync('ffmpeg', ['-version']).error;

function ffmpeg(args: readonly string[], input?: Uint8Array): Buffer {
  const result = spawnSync('ffmpeg', ['-v', 'error', ...args], { input, maxBuffer: 1 << 30 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed:\n${result.stderr.toString()}`);
  return result.stdout;
}

/** Samples (mono, at the page's rate) as an MP3, with the encoder's delay and padding in its first frame. */
export function writeMp3(samples: Float32Array, file: string, quality = MP3_QUALITY): void {
  const input = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  ffmpeg(
    ['-y', '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', '-'].concat([
      '-codec:a',
      'libmp3lame',
      '-q:a',
      String(quality),
      file,
    ]),
    input,
  );
}

/** A sound file (or its bytes) as ffmpeg decodes it: mono samples at the page's rate. */
export function decodeWithFfmpeg(file: string | Uint8Array): Float32Array {
  const input = typeof file === 'string' ? ['-i', file] : ['-f', 'mp3', '-i', 'pipe:0'];
  const bytes = ffmpeg(
    [...input, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
    typeof file === 'string' ? undefined : file,
  );
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();
}

/** The bitrates of MPEG-1 Layer III frames (kbit/s), by their index in the header. */
const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

/**
 * An MP3 without the frame that says how long the encoder's delay and padding are (LAME's Xing or
 * Info frame): what a decoder that does not read it decodes, the sound late by the delay.
 */
export function withoutGaplessInfo(mp3: Uint8Array): Uint8Array {
  // after the ID3v2 tag, if there is one: its size in 7-bit bytes
  const tag =
    mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33
      ? 10 + ((mp3[6] << 21) | (mp3[7] << 14) | (mp3[8] << 7) | mp3[9])
      : 0;
  const header = new DataView(mp3.buffer, mp3.byteOffset + tag, 4).getUint32(0);
  if (header >>> 21 !== 0x7ff) throw new Error('no MP3 frame after the tag');
  const bitrate = BITRATES[(header >>> 12) & 0xf] * 1000;
  const length = Math.floor((144 * bitrate) / SAMPLE_RATE) + ((header >>> 9) & 1);
  const frame = new TextDecoder('latin1').decode(mp3.subarray(tag, tag + length));
  if (!frame.includes('Xing') && !frame.includes('Info')) throw new Error('the first frame is not LAME’s');
  const out = new Uint8Array(mp3.length - length);
  out.set(mp3.subarray(0, tag));
  out.set(mp3.subarray(tag + length), tag);
  return out;
}

/** What a browser decoded: how long all of it is, at which rate, and the stretches asked for. */
export interface Decoded {
  readonly length: number;
  readonly channels: number;
  readonly sampleRate: number;
  /** The stretches asked for, in their order: [from, to) each. */
  readonly stretches: readonly Float32Array[];
}

/** The part of Playwright this uses. */
interface Page {
  goto(url: string): Promise<unknown>;
  evaluate<T, A>(fn: (arg: A) => Promise<T>, arg: A): Promise<T>;
}
interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
  version(): string;
}
interface Playwright {
  chromium: { launch(): Promise<Browser> };
}

/** Chromium, decoding as a page does: `decodeAudioData` in an `OfflineAudioContext` at the page's rate. */
export interface ChromiumDecoder {
  readonly version: string;
  /** The file decoded, and of it the stretches asked for (all of it where none are). */
  decode(file: string, stretches?: readonly (readonly [number, number])[]): Promise<Decoded>;
  close(): Promise<void>;
}

/** Chromium by Playwright, where it is installed (it is not a dependency of this project); else null. */
export async function chromiumDecoder(): Promise<ChromiumDecoder | null> {
  let playwright: Playwright;
  try {
    playwright = createRequire(import.meta.url)('playwright') as Playwright;
  } catch {
    return null;
  }
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  return {
    version: `Chromium ${browser.version()}`,
    decode: (file, stretches) =>
      page.evaluate(
        async ({ bytes, rate, stretches }) => {
          const context = new OfflineAudioContext(1, 1, rate);
          const buffer = await context.decodeAudioData(bytes.slice().buffer);
          const sound = buffer.getChannelData(0);
          return {
            length: buffer.length,
            channels: buffer.numberOfChannels,
            sampleRate: buffer.sampleRate,
            stretches: (stretches ?? [[0, sound.length]]).map(([from, to]) => sound.slice(from, to)),
          };
        },
        { bytes: new Uint8Array(readFileSync(file)), rate: SAMPLE_RATE, stretches },
      ),
    close: () => browser.close(),
  };
}

/**
 * The decoded sound put together from stretches of it: silence elsewhere. What `alignVoice` reads
 * of it must be among them.
 */
export function fromStretches(decoded: Decoded, at: readonly (readonly [number, number])[]): Float32Array {
  const out = new Float32Array(decoded.length);
  decoded.stretches.forEach((stretch, i) => {
    const from = Math.min(out.length, at[i][0]);
    out.set(stretch.subarray(0, out.length - from), from);
  });
  return out;
}
