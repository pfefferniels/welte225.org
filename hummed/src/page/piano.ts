// The roll (or its harmonies) on a sampled grand: every third pitch from A1, four velocity layers,
// transposed to the note. Loaded only when the page needs it: where no Pianoteq rendering of a level
// is there to play.
import type { HeldNote } from '../shared/piano.ts';
import { SAMPLE_RATE, type Seconds } from '../shared/units.ts';
import { marginOf, startPlace } from './timeline.ts';

const BASES = [33, 36, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81] as const;
const LAYERS = [3, 5, 7, 9] as const;
/** The samples' level against the voice's. */
export const SAMPLER_LEVEL = 1.4632;
const RELEASE = 0.12;

const nearest = <T extends number>(options: readonly T[], target: number): T =>
  options.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));

/**
 * A sound, whole, as a picture is drawn from it: a buffer, and where the sound's first sample is in
 * it (a voice decoded with the decoder's lead).
 */
export interface PianoSound {
  readonly buffer: AudioBuffer;
  readonly lead: number;
}

/** How many notes are handed to the offline context at a time, between which the page's thread gives way. */
const NOTES_AT_ONCE = 200;

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
   * The notes played ahead of time, faster than they sound, for the picture of what will be heard.
   * They are handed over a few hundred at a time: the struck-again versions have thousands, and
   * all at once held the page's thread up for a tenth of a second.
   */
  async render(notes: readonly HeldNote[], duration: Seconds): Promise<PianoSound> {
    const offline = new OfflineAudioContext(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
    for (let i = 0; i < notes.length; i += NOTES_AT_ONCE) {
      for (const note of notes.slice(i, i + NOTES_AT_ONCE)) this.play(note, offline.destination, note.on, 0);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { buffer: await offline.startRendering(), lead: 0 };
  }

  /**
   * Play a note into `output` (in its audio context) at context time `when`, from `from` seconds
   * into it; null while its sample is missing. A note whose place has passed (the page's thread was
   * held up) comes in where it is by now, later and further into it, as one held by the pedal comes
   * in at a seek: its strike is not heard late, it is not heard. One that is over by then is left out.
   */
  play(note: HeldNote, output: AudioNode, when: number, from: number): AudioBufferSourceNode | null {
    const base = nearest(BASES, note.pitch);
    const layer = nearest(LAYERS, Math.max(1, Math.min(16, Math.round((note.velocity / 127) * 15) + 1)));
    const buffer = this.#samples.get(`${base}:${layer}`);
    if (!buffer) return null;
    const context = output.context;
    const start = startPlace(when, from, context.currentTime, marginOf(context));
    const left = note.duration - start.offset;
    if (left <= 0) return null;
    const source = context.createBufferSource();
    const envelope = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, (note.pitch - base) / 12);
    const amp = (note.velocity / 127) * SAMPLER_LEVEL;
    envelope.gain.setValueAtTime(amp, start.when);
    envelope.gain.setValueAtTime(amp, start.when + left);
    envelope.gain.linearRampToValueAtTime(0, start.when + left + RELEASE);
    source.connect(envelope);
    envelope.connect(output);
    source.start(start.when, start.offset * source.playbackRate.value);
    source.stop(start.when + left + RELEASE + 0.03);
    return source;
  }
}
