// One chunk of the voice as a worker renders it: which tract states (a little before the chunk, to
// settle the voice, and a little past it, for the last spectrogram columns), which samples of them
// are the chunk's, and which columns. The worker posts what this yields; the benchmark collects it.
import type { AudioMessage } from '../shared/protocol.ts';
import { SPECTROGRAM, type SpectrogramStyle } from '../shared/spectrogram.ts';
import { SAMPLE_RATE, STATE_STEP, type Seconds } from '../shared/units.ts';
import type { StatePair, VtlEngine } from '../vtl/engine.ts';
import type { SpectrogramColumns } from './spectrogram.ts';

/**
 * Sound before a chunk that is rendered to settle the voice but not sent: longer where the chunk
 * starts in the middle of the voice (a seek), short where it starts at a silence.
 */
const SETTLE: Seconds = 0.3;
const SETTLE_AT_SEAM: Seconds = 0.05;
/** Tract states per audio block: a tenth of a second of sound. */
export const BLOCK_STATES = 40;
/**
 * A chunk's first sound, which the page needs before it plays from there, goes out before anything
 * else is done: no columns are computed until this much of the chunk has been sent, or all of it.
 */
export const FIRST_SOUND: Seconds = 0.5;

/** What a chunk is rendered from: a level's tract states, the lips' opening and the seams. */
export interface ChunkSource {
  readonly states: StatePair;
  readonly weight: Float32Array;
  /** The tract states where the voice is silent. */
  readonly seams: ReadonlySet<number>;
}

/** The tract states and samples of a chunk. */
export interface ChunkSpan {
  /** The states rendered, [a, b): from before `from`, to settle, to past `to`, for the last columns. */
  readonly a: number;
  readonly b: number;
  /** The samples sent, [keep0, keep1): the chunk's own. */
  readonly keep0: number;
  readonly keep1: number;
  /** The columns sent, [firstColumn, lastColumn): those whose centres fall in the chunk. */
  readonly firstColumn: number;
  readonly lastColumn: number;
}

export function chunkSpan(
  from: number,
  to: number,
  count: number,
  seams: ReadonlySet<number>,
  style: SpectrogramStyle,
): ChunkSpan {
  const { hop } = SPECTROGRAM;
  const settle = from === 0 ? 0 : seams.has(from) ? SETTLE_AT_SEAM : SETTLE;
  const keep0 = from * STATE_STEP;
  const keep1 = Math.min(to * STATE_STEP, (count - 1) * STATE_STEP);
  return {
    a: Math.max(0, from - Math.round((settle * SAMPLE_RATE) / STATE_STEP)),
    b: Math.min(count, to + Math.ceil(style.window / 2 / STATE_STEP) + 1),
    keep0,
    keep1,
    firstColumn: Math.ceil(keep0 / hop),
    lastColumn: Math.ceil(keep1 / hop),
  };
}

/** What a chunk sends at a time: sound, spectrogram columns, or both. */
export type ChunkPart = Pick<AudioMessage, 'start' | 'samples' | 'spectrogram'>;

export interface ChunkOptions {
  readonly style: SpectrogramStyle;
  readonly columns: SpectrogramColumns;
  /** The output gain (the calibration's). */
  readonly gain: number;
}

/**
 * Render the states [from, to): settle the voice a little before `from`, and render on past `to`
 * for the last spectrogram columns, but give only the samples of [from, to) and the columns whose
 * centres fall in them. Yields once per block of the engine: what there is to send of it, or null
 * (while the voice settles), so that the caller can stop between blocks.
 */
export function* renderChunk(
  engine: VtlEngine,
  source: ChunkSource,
  from: number,
  to: number,
  { style, columns, gain }: ChunkOptions,
): Generator<ChunkPart | null> {
  const { hop } = SPECTROGRAM;
  const span = chunkSpan(from, to, source.states.closed.count, source.seams, style);
  const { a, b, keep0, keep1, lastColumn } = span;
  const offset = a * STATE_STEP;
  const local = new Float32Array((b - a) * STATE_STEP);
  const soundFirst = Math.min(keep1, keep0 + Math.round(FIRST_SOUND * SAMPLE_RATE));
  let column = span.firstColumn;
  const part = (start: number, samples: Float32Array, upto: number): ChunkPart | null => {
    const pixels = upto > column ? columns(local, offset, column, upto) : null;
    if (samples.length === 0 && !pixels) return null;
    const spectrogram = pixels ? { column, count: upto - column, pixels } : null;
    if (pixels) column = upto;
    return { start, samples, spectrogram };
  };
  for (const block of engine.synthesize(source.states, source.weight, a, b, { blockStates: BLOCK_STATES })) {
    const at = (block.firstState - 1) * STATE_STEP;
    const samples = block.samples;
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
    local.set(samples, at - offset);
    const filled = at + samples.length;
    const s0 = Math.max(at, keep0);
    const s1 = Math.min(filled, keep1);
    // the columns whose window the rendered sound now covers, once the first sound is out
    const ready =
      s1 < soundFirst ? column : Math.min(lastColumn, Math.floor((filled - style.window / 2) / hop) + 1);
    // a block that is the chunk's as a whole is sent as it is, not copied
    const whole = s0 === at && s1 === filled && samples.byteLength === samples.buffer.byteLength;
    yield part(
      s1 > s0 ? s0 : 0,
      s1 <= s0 ? new Float32Array(0) : whole ? samples : samples.slice(s0 - at, s1 - at),
      ready,
    );
  }
  // at the end of the piece, with silence after it
  const rest = part(0, new Float32Array(0), lastColumn);
  if (rest) yield rest;
}
