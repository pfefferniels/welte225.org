// The piano under the voice in the spectrogram: the part that is heard (the harmonies or the piece),
// drawn from its sound as the page plays it, by a worker of its own. One picture is kept: that of
// the rendering and the part shown.
import type { PictureColumns, PictureRequest } from '../shared/protocol.ts';
import { INKS, PIANO_SCALES, SPECTROGRAM, type SpectrogramStyleName } from '../shared/spectrogram.ts';
import type { Seconds } from '../shared/units.ts';
import type { PianoSound } from './piano.ts';
import type { PianoPartName, Rendering } from './rendering.ts';
import { Strip } from './strip.ts';

/** A part's sound as it is heard; null while it is loading (asked again a little later). */
export type PianoSoundSource = (rendering: Rendering, part: PianoPartName) => Promise<PianoSound> | null;

const RETRY_MS = 300;

export class PianoPicture {
  readonly #style: SpectrogramStyleName;
  readonly #source: PianoSoundSource;
  readonly #changed: () => void;
  #worker: Worker | null = null;
  /** What the picture is of: the rendering, the part, and the piano that sounds them. */
  #key = '';
  #piano = 0;
  #id = 0;
  #asked = false;
  #strip: Strip | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;

  constructor(style: SpectrogramStyleName, source: PianoSoundSource, changed: () => void) {
    this.#style = style;
    this.#source = source;
    this.#changed = changed;
  }

  /** Another piano sounds: its picture is another. */
  forget(): void {
    this.#piano++;
  }

  /**
   * The picture of a rendering's part, as far as it has come; null before its first columns.
   * Asking starts it, from where the playhead is.
   */
  strip(rendering: Rendering, part: PianoPartName, t: Seconds): Strip | null {
    const key = `${rendering.id}:${part}:${this.#piano}`;
    if (key !== this.#key) {
      this.#key = key;
      this.#id++;
      this.#asked = false;
      this.#strip = null;
    }
    if (!this.#asked) this.#ask(rendering, part, t);
    return this.#strip;
  }

  #ask(rendering: Rendering, part: PianoPartName, t: Seconds): void {
    const sound = this.#source(rendering, part);
    if (!sound) {
      // still loading: look again soon, for as long as the picture is asked for
      if (this.#retry !== null) return;
      this.#retry = setTimeout(() => {
        this.#retry = null;
        this.#changed();
      }, RETRY_MS);
      return;
    }
    this.#asked = true;
    const id = this.#id;
    sound.then(
      ({ samples, sampleRate }) => {
        if (id !== this.#id) return;
        const strip = new Strip(INKS.piano);
        this.#strip = strip;
        const request: PictureRequest = {
          type: 'picture',
          id,
          samples,
          sampleRate,
          spectrogram: this.#style,
          scale: PIANO_SCALES[this.#style],
          from: Math.floor(t * SPECTROGRAM.columnsPerSecond),
        };
        this.#drawer(strip).postMessage(request, [samples.buffer]);
      },
      (error: unknown) => {
        console.warn('The piano could not be drawn into the spectrogram.', error);
      },
    );
  }

  /** The worker, with its columns going to the strip of the picture asked for last. */
  #drawer(strip: Strip): Worker {
    this.#worker ??= new Worker('worker.js');
    const id = this.#id;
    this.#worker.onmessage = (event: MessageEvent<PictureColumns>) => {
      const message = event.data;
      if (message.id !== id || id !== this.#id) return;
      strip.draw(message.column, message.count, message.pixels);
      this.#changed();
    };
    return this.#worker;
  }
}
