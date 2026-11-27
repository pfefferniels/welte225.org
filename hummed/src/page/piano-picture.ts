// The pictures drawn from sound, by a worker of its own: the piano under the voice in the spectrogram
// (the part that is heard, the harmonies or the piece, from its sound as the page plays it), and the
// voice of a setting rendered ahead (from its decoded sound, in the voice's own rows and scale, as
// the voice's workers draw it while they render). A picture is kept for every setting that sounds,
// and drawn ahead for the settings around the fader, so that a crossfade into one has its picture
// already. The worker draws one at a time, those of settings heard first, each from where the
// playhead is in it to the end and then from the beginning.
import type { PictureColumns, PictureRequest, PictureSamples } from '../shared/protocol.ts';
import {
  INKS,
  PIANO_SCALES,
  SPECTROGRAM,
  SPECTROGRAM_STYLES,
  type SpectrogramScale,
  type SpectrogramStyleName,
} from '../shared/spectrogram.ts';
import type { Seconds } from '../shared/units.ts';
import type { PianoSound } from './piano.ts';
import type { PianoPartName, Rendering } from './rendering.ts';
import { Strip, TILE } from './strip.ts';

/** A part's sound as it is heard; null while it is loading (asked again a little later). */
export type PianoSoundSource = (rendering: Rendering, part: PianoPartName) => Promise<PianoSound> | null;

const RETRY_MS = 300;
/** A picture's sound is handed over in pieces of two seconds, four to a task. */
const PIECE = 2;
const PIECES_AT_ONCE = 4;
/** How far before the playhead a picture begins: the strip shows that much of the past. */
const BEFORE: Seconds = 6;

/** How soon a picture is wanted: it is in view now, or it is drawn ahead for what may come. */
export type Urgency = 'now' | 'ahead';

interface Job {
  readonly key: string;
  /** A voice's picture is drawn before a piano's: it is the one drawn over the other. */
  readonly kind: 'voice' | 'piano';
  readonly strip: Strip;
  /** The renderings it is the picture of: those that sound alike share it. */
  readonly renderings: Set<Rendering>;
  readonly source: () => Promise<PianoSound> | null;
  /**
   * The sound, while it comes and once it is there, kept until the picture is whole (the sampled
   * grand takes long to play ahead, and a picture put back goes on from it).
   */
  asked: Promise<PianoSound> | null;
  sound: PianoSound | null;
  readonly scale: SpectrogramScale;
  /** Where to begin, in the rendering's time: where its playhead is now. */
  from: Seconds;
  urgency: Urgency;
  /** The worker's request for it while it draws, and how many columns have come back. */
  id: number;
  received: number;
  count: number;
  done: boolean;
}

export class PianoPicture {
  readonly #style: SpectrogramStyleName;
  readonly #source: PianoSoundSource;
  readonly #changed: () => void;
  #worker: Worker | null = null;
  /** Another piano: the pictures of the piano are another's. */
  #piano = 0;
  #nextId = 1;
  readonly #jobs = new Map<string, Job>();
  /** The one the worker draws now. */
  #drawing: Job | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;

  constructor(style: SpectrogramStyleName, source: PianoSoundSource, changed: () => void) {
    this.#style = style;
    this.#source = source;
    this.#changed = changed;
  }

  /** Another piano sounds: its pictures are other ones. */
  forget(): void {
    this.#piano++;
    for (const [key, job] of this.#jobs) if (key.startsWith('piano:')) this.#drop(job);
    this.#next();
  }

  /**
   * The picture of a rendering's part, as far as it has come; null before its first columns.
   * Asking starts it, from where the playhead `t` is in it.
   */
  strip(rendering: Rendering, part: PianoPartName, t: Seconds, urgency: Urgency = 'now'): Strip | null {
    const job = this.#job(rendering, `piano:${rendering.sound}:${part}:${this.#piano}`, () => ({
      kind: 'piano',
      strip: new Strip(INKS.piano),
      source: () => this.#source(rendering, part),
      scale: PIANO_SCALES[this.#style],
    }));
    this.#want(job, t, urgency);
    return job.strip.columns > 0 ? job.strip : null;
  }

  /**
   * A rendering's voice as it is drawn: one that streams in, its own strip, which the workers draw;
   * one rendered ahead, its picture drawn from its sound (asking starts it, from where the playhead
   * `t` is in it), shared with those that sound the same.
   */
  voice(rendering: Rendering, t: Seconds, urgency: Urgency = 'now'): Strip {
    const whole = rendering.whole;
    if (!whole) return rendering.strip;
    const job = this.#job(rendering, `voice:${rendering.sound}`, () => ({
      kind: 'voice',
      strip: new Strip(INKS.hum),
      source: () => Promise.resolve({ buffer: whole, lead: rendering.lead }),
      scale: SPECTROGRAM_STYLES[this.#style].scale,
    }));
    this.#want(job, t, urgency);
    return job.strip;
  }

  /** What the pictures of a rendering take, in bytes (its voice's strip counted with its pictures). */
  bytes(rendering: Rendering): number {
    let tiles = rendering.whole ? 0 : rendering.strip.tiles.length;
    for (const job of this.#jobs.values()) if (job.renderings.has(rendering)) tiles += job.strip.tiles.length;
    return tiles * TILE * SPECTROGRAM.rows * 4;
  }

  /** Let go of the pictures of a rendering that is no longer kept, unless another holds them. */
  drop(rendering: Rendering): void {
    this.keepOnly((r) => r !== rendering);
  }

  /** Let go of the pictures of every rendering but those that `keep` says to keep. */
  keepOnly(keep: (rendering: Rendering) => boolean): void {
    for (const job of [...this.#jobs.values()]) {
      for (const rendering of [...job.renderings]) if (!keep(rendering)) job.renderings.delete(rendering);
      if (job.renderings.size === 0) this.#drop(job);
    }
    this.#next();
  }

  /** The picture under `key`, held by `rendering` too; made as `make` says where there is none yet. */
  #job(rendering: Rendering, key: string, make: () => Pick<Job, 'kind' | 'strip' | 'source' | 'scale'>): Job {
    const job = this.#jobs.get(key) ?? this.#add({ key, renderings: new Set(), ...make() });
    job.renderings.add(rendering);
    return job;
  }

  #add(init: Pick<Job, 'key' | 'kind' | 'strip' | 'renderings' | 'source' | 'scale'>): Job {
    const job: Job = {
      ...init,
      asked: null,
      sound: null,
      from: 0,
      urgency: 'ahead',
      id: 0,
      received: 0,
      count: 0,
      done: false,
    };
    this.#jobs.set(job.key, job);
    return job;
  }

  #drop(job: Job): void {
    this.#jobs.delete(job.key);
    if (this.#drawing === job) this.#drawing = null;
  }

  #want(job: Job, t: Seconds, urgency: Urgency): void {
    if (job.done) return;
    const sooner = urgency === 'now' && job.urgency !== 'now';
    if (job.id === 0) job.from = Math.max(0, t - BEFORE);
    if (sooner) job.urgency = 'now';
    // a picture in view goes before one drawn ahead: the one drawing is put back, to go on later
    const drawing = this.#drawing;
    if (sooner && drawing && drawing !== job && drawing.urgency !== 'now') {
      drawing.id = 0;
      this.#drawing = null;
    }
    this.#next();
  }

  /**
   * Ask for the sounds of the pictures wanted (of those in view all, of those ahead one at a time:
   * the sampled grand plays a part ahead in tens of seconds), and have the worker draw the first
   * whose sound is there: in view before ahead, the voice before the piano.
   */
  #next(): void {
    const rank = (job: Job): number => (job.urgency === 'now' ? 0 : 2) + (job.kind === 'voice' ? 0 : 1);
    const waiting = [...this.#jobs.values()]
      .filter((job) => !job.done && job.id === 0)
      .sort((a, b) => rank(a) - rank(b));
    let askingAhead = waiting.some((job) => job.urgency === 'ahead' && job.asked && !job.sound);
    for (const job of waiting) {
      if (job.asked || (job.urgency === 'ahead' && askingAhead)) continue;
      const asked = job.source();
      if (!asked) {
        // still loading: look again soon, for as long as a picture is wanted
        if (this.#retry === null)
          this.#retry = setTimeout(() => {
            this.#retry = null;
            this.#next();
            this.#changed();
          }, RETRY_MS);
        continue;
      }
      job.asked = asked;
      if (job.urgency === 'ahead') askingAhead = true;
      asked.then(
        (sound) => {
          if (job.asked !== asked) return;
          job.sound = sound;
          this.#next();
        },
        (error: unknown) => {
          console.warn('A picture could not be drawn into the spectrogram.', error);
          this.#drop(job);
          this.#next();
        },
      );
    }
    if (this.#drawing) return;
    const job = waiting.find((j) => j.sound);
    const sound = job?.sound;
    if (!job || !sound) return;
    const id = this.#nextId++;
    job.id = id;
    job.received = 0;
    const rate = sound.buffer.sampleRate;
    const length = Math.max(0, sound.buffer.length - sound.lead);
    job.count = Math.ceil((length / rate) * SPECTROGRAM.columnsPerSecond);
    this.#drawing = job;
    // the sound under the first column's window first, then on to the end, then from the beginning
    const from = Math.floor(job.from * SPECTROGRAM.columnsPerSecond);
    const hop = rate / SPECTROGRAM.columnsPerSecond;
    const half = SPECTROGRAM_STYLES[this.#style].window / 2;
    const first = Math.max(0, Math.min(length, Math.floor(from * hop - half - hop)));
    const request: PictureRequest = {
      type: 'picture',
      id,
      length,
      first,
      sampleRate: rate,
      spectrogram: this.#style,
      scale: job.scale,
      from,
    };
    const worker = this.#drawer();
    worker.postMessage(request);
    void this.#hand(worker, job, id, sound, first, length);
  }

  /**
   * Hand a picture's sound to the worker in pieces, a few to a task, copied as they go (copied whole,
   * a sound of four minutes held the page's thread up for 20 ms); while the picture is still wanted.
   */
  async #hand(
    worker: Worker,
    job: Job,
    id: number,
    sound: PianoSound,
    first: number,
    length: number,
  ): Promise<void> {
    const { buffer, lead } = sound;
    const piece = PIECE * buffer.sampleRate;
    let start = first;
    let wrapped = false;
    for (let n = 1; job.id === id && this.#jobs.has(job.key); n++) {
      if (!wrapped && start >= length) {
        wrapped = true;
        start = 0;
      }
      const end = Math.min(wrapped ? first : length, start + piece);
      if (wrapped && start >= end) return;
      const samples = new Float32Array(end - start);
      // where the sound's first sample lies before the buffer's, silence
      const from = lead + start;
      if (from >= 0) buffer.copyFromChannel(samples, 0, from);
      else if (end + lead > 0) buffer.copyFromChannel(samples.subarray(-from), 0, 0);
      const message: PictureSamples = { type: 'picture-samples', id, start, samples };
      worker.postMessage(message, [samples.buffer]);
      start = end;
      if (n % PIECES_AT_ONCE === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /** The worker, its columns going to the strip they were drawn for. */
  #drawer(): Worker {
    if (this.#worker) return this.#worker;
    const worker = new Worker('worker.js');
    worker.onmessage = (event: MessageEvent<PictureColumns>) => {
      const message = event.data;
      const job = [...this.#jobs.values()].find((j) => j.id === message.id);
      if (!job) return;
      job.strip.draw(message.column, message.count, message.pixels);
      job.received += message.count;
      if (job.received >= job.count) {
        job.done = true;
        job.asked = null;
        job.sound = null;
        if (this.#drawing === job) this.#drawing = null;
        this.#next();
      }
      this.#changed();
    };
    this.#worker = worker;
    return worker;
  }
}
