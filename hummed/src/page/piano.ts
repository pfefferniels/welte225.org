// The roll (or its harmonies) on a sampled grand: every third pitch from A1, four velocity layers,
// transposed to the note. Loaded only when the page needs it: where no Pianoteq rendering of a level
// is there to play.
import type { HeldNote } from '../shared/piano.ts';

const BASES = [33, 36, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81] as const;
const LAYERS = [3, 5, 7, 9] as const;
/** The samples' level against the voice's. */
const LEVEL = 3.6754;
const RELEASE = 0.12;

const nearest = <T extends number>(options: readonly T[], target: number): T =>
  options.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));

export class PianoSampler {
  readonly #context: AudioContext;
  readonly #samples = new Map<string, AudioBuffer>();
  readonly #failed: (error: unknown) => void;
  #loading: Promise<void> | null = null;
  #loaded = false;

  constructor(context: AudioContext, failed: (error: unknown) => void) {
    this.#context = context;
    this.#failed = failed;
  }

  /** Whether the samples are there; the first ask loads them. */
  ready(): boolean {
    if (this.#loading === null)
      this.#loading = this.#load().then(
        () => {
          this.#loaded = true;
        },
        (error: unknown) => {
          this.#loading = null;
          this.#failed(error);
        },
      );
    return this.#loaded;
  }

  /** Every sample (piano/p<pitch>v<layer>.mp3). */
  async #load(): Promise<void> {
    await Promise.all(
      BASES.flatMap((base) =>
        LAYERS.map(async (layer) => {
          const response = await fetch(`piano/p${base}v${layer}.mp3`);
          if (!response.ok) throw new Error(`piano sample ${base}/${layer}: ${response.status}`);
          const buffer = await this.#context.decodeAudioData(await response.arrayBuffer());
          this.#samples.set(`${base}:${layer}`, buffer);
        }),
      ),
    );
  }

  /**
   * Play a note into `output` at context time `when`, from `from` seconds into it; null while its
   * sample is missing.
   */
  play(note: HeldNote, output: AudioNode, when: number, from: number): AudioBufferSourceNode | null {
    const base = nearest(BASES, note.pitch);
    const layer = nearest(LAYERS, Math.max(1, Math.min(16, Math.round((note.velocity / 127) * 15) + 1)));
    const buffer = this.#samples.get(`${base}:${layer}`);
    if (!buffer) return null;
    const source = this.#context.createBufferSource();
    const envelope = this.#context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, (note.pitch - base) / 12);
    const amp = (note.velocity / 127) * LEVEL;
    const left = Math.max(0, note.duration - from);
    envelope.gain.setValueAtTime(amp, when);
    envelope.gain.setValueAtTime(amp, when + left);
    envelope.gain.linearRampToValueAtTime(0, when + left + RELEASE);
    source.connect(envelope);
    envelope.connect(output);
    source.start(when, from * source.playbackRate.value);
    source.stop(when + left + RELEASE + 0.03);
    return source;
  }
}
