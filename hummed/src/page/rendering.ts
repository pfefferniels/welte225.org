// One rendering of the voice as it streams in from the worker: its sound, which 10 ms slots of it
// have arrived, its spectrogram tiles, and its place in the score.
import { interp } from '../shared/math.ts';
import type { AudioMessage, PianoNote, Plan, Timings } from '../shared/protocol.ts';
import { SPECTROGRAM as SPEC } from '../shared/spectrogram.ts';
import { PAD_MS, SAMPLE_RATE, type Seconds, type Ticks } from '../shared/units.ts';

const SLOT = SAMPLE_RATE / 100;
/** Spectrogram columns per tile canvas. */
export const TILE = 2048;

export interface Tile {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly column: ImageData;
}

export class Rendering {
  readonly id: number;
  readonly level: number;
  readonly voiceLevel: number;
  readonly duration: Seconds;
  readonly bars: readonly (readonly [Seconds, string])[];
  readonly piano: readonly PianoNote[];
  readonly timings: Timings;
  readonly startSeconds: Seconds;
  readonly audio: Float32Array;
  readonly tiles: Tile[] = [];
  readonly #clock: Plan['clock'];
  /** Samples arrived per 10 ms slot. */
  readonly #have: Uint16Array;
  readonly #began = performance.now();
  #samples = 0;
  done = false;

  constructor(plan: Plan) {
    this.id = plan.id;
    this.level = plan.level;
    this.voiceLevel = plan.voiceLevel;
    this.duration = plan.duration;
    this.bars = plan.bars;
    this.piano = plan.piano;
    this.timings = plan.timings;
    this.startSeconds = plan.startSeconds;
    this.#clock = plan.clock;
    this.audio = new Float32Array(Math.ceil(plan.duration * SAMPLE_RATE));
    this.#have = new Uint16Array(Math.ceil(plan.duration * 100) + 1);
  }

  receive(message: AudioMessage): void {
    this.audio.set(message.samples, message.start);
    const a = message.start;
    const b = message.start + message.samples.length;
    for (let c = Math.floor(a / SLOT); c <= Math.floor((b - 1) / SLOT); c++)
      this.#have[c] += Math.min(b, (c + 1) * SLOT) - Math.max(a, c * SLOT);
    this.#samples += message.samples.length;
    if (message.spectrogram)
      this.#draw(message.spectrogram.column, message.spectrogram.count, message.spectrogram.pixels);
  }

  /** Whether the sound from t0 to t1 has all arrived. */
  rendered(t0: Seconds, t1: Seconds): boolean {
    const a = Math.max(0, Math.floor(t0 * 100));
    const b = Math.min(this.#have.length - 1, Math.ceil(t1 * 100));
    for (let c = a; c < b; c++)
      if (this.#have[c] < Math.min(SLOT, this.audio.length - c * SLOT)) return false;
    return true;
  }

  /** How far ahead of `t` the sound has arrived without a gap. */
  aheadOf(t: Seconds): Seconds {
    let x = t;
    while (x < this.duration && this.rendered(x, x + 0.1)) x += 0.1;
    return x - t;
  }

  /** How fast the sound is coming, against real time. */
  speed(): number {
    return this.#samples / SAMPLE_RATE / ((performance.now() - this.#began) / 1000);
  }

  /** The score position under a time of this rendering, and back. */
  toTick(t: Seconds): Ticks {
    return interp((t - PAD_MS / 1000) * 1000, this.#clock.ms, this.#clock.ticks);
  }

  toSeconds(tick: Ticks): Seconds {
    return interp(tick, this.#clock.ticks, this.#clock.ms) / 1000 + PAD_MS / 1000;
  }

  #draw(first: number, count: number, pixels: Uint8Array): void {
    for (let k = 0; k < count; k++) {
      const c = first + k;
      const tile = this.#tile(Math.floor(c / TILE));
      const d = tile.column.data;
      for (let r = 0; r < SPEC.rows; r++) {
        const v = pixels[k * SPEC.rows + r];
        d[r * 4] = d[r * 4 + 1] = d[r * 4 + 2] = v;
        d[r * 4 + 3] = 255;
      }
      tile.context.putImageData(tile.column, c % TILE, 0);
    }
  }

  #tile(index: number): Tile {
    const existing = this.tiles[index] as Tile | undefined;
    if (existing) return existing;
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = SPEC.rows;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2D canvas');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, TILE, SPEC.rows);
    const tile = { canvas, context, column: context.createImageData(1, SPEC.rows) };
    this.tiles[index] = tile;
    return tile;
  }
}
