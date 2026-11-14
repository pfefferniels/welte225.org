// One rendering of the voice as it streams in from the worker: its sound, which 10 ms slots of it
// have arrived, its spectrogram, and its place in the score.
import { interp } from '../shared/math.ts';
import { heldNotes, type HeldNote, type PianoPart } from '../shared/piano.ts';
import type { AudioMessage, Plan, Roll, Setting, Timings } from '../shared/protocol.ts';
import { INKS } from '../shared/spectrogram.ts';
import { PAD_MS, SAMPLE_RATE, type Seconds, type Ticks } from '../shared/units.ts';
import { Strip } from './strip.ts';

const SLOT = SAMPLE_RATE / 100;

export type PianoPartName = 'piece' | 'harmonies';
export class Rendering {
  readonly id: number;
  readonly setting: Setting;
  readonly voiceLevel: number;
  readonly duration: Seconds;
  readonly bars: readonly (readonly [Seconds, string])[];
  /** The piano's two parts as the roll plays them. */
  readonly parts: { readonly piece: PianoPart; readonly harmonies: PianoPart };
  /** Where the harmonies roll a chord, and as which of the piece's ornaments. */
  readonly rolls: readonly Roll[];
  readonly timings: Timings;
  readonly startSeconds: Seconds;
  readonly audio: Float32Array;
  /** The voice's spectrogram, as far as it has arrived. */
  readonly strip = new Strip(INKS.hum);
  readonly #clock: Plan['clock'];
  readonly #held = new Map<PianoPartName, readonly HeldNote[]>();
  /** Samples arrived per 10 ms slot. */
  readonly #have: Uint16Array;
  readonly #began = performance.now();
  #samples = 0;
  done = false;

  constructor(plan: Plan) {
    this.id = plan.id;
    this.setting = plan.setting;
    this.voiceLevel = plan.voiceLevel;
    this.duration = plan.duration;
    this.bars = plan.bars;
    this.parts = { piece: plan.piece, harmonies: plan.harmonies };
    this.rolls = plan.rolls;
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
      this.strip.draw(message.spectrogram.column, message.spectrogram.count, message.spectrogram.pixels);
  }

  /** Whether the sound from t0 to t1 has all arrived. */
  rendered(t0: Seconds, t1: Seconds): boolean {
    const a = Math.max(0, Math.floor(t0 * 100));
    const b = Math.min(this.#have.length - 1, Math.ceil(t1 * 100));
    for (let c = a; c < b; c++)
      if (this.#have[c] < Math.min(SLOT, this.audio.length - c * SLOT)) return false;
    return true;
  }

  /** A part's notes as the sampler plays them, held by the sustain pedal. */
  held(part: PianoPartName): readonly HeldNote[] {
    let notes = this.#held.get(part);
    if (!notes) {
      notes = heldNotes(this.parts[part]);
      this.#held.set(part, notes);
    }
    return notes;
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
}
