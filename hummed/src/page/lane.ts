// One setting as it sounds while playing: its voice and its piano, each part through the setting's
// own mix, and all of them through one gain, its weight, which fades the setting in and out. Its time
// runs with the audio clock from where it was placed: `origin` is the context time of its time 0.
import { SAMPLE_RATE, type Seconds } from '../shared/units.ts';
import type { AudioGraph } from './audio-graph.ts';
import { Weight, type Correction, type Point } from './blend.ts';
import type { Mix } from './mix.ts';
import type { PianoOutput, PianoPlay } from './outputs.ts';
import type { Rendering } from './rendering.ts';

/** In what lengths a voice that streams in is handed to the audio graph. */
const SEGMENT: Seconds = 0.25;
/** How long a mix takes to glide to where it is set. */
const GLIDE: Seconds = 0.02;

export class Lane {
  #rendering: Rendering;
  readonly origin: number;
  /** When it begins to sound, in context time. */
  readonly begin: number;
  /** Whether it was started on its own (a start, a seek), not crossfaded in. */
  readonly fresh: boolean;
  readonly weight: Weight;
  readonly #context: BaseAudioContext;
  readonly #mixGains: { readonly hum: GainNode; readonly piece: GainNode; readonly harmonies: GainNode };
  readonly #gain: GainNode;
  readonly #nodes: readonly AudioNode[];
  #mix: Mix;
  #sources: AudioScheduledSourceNode[] = [];
  /** How far the voice has been handed over, and the piano, in the rendering's time. */
  #voiceUntil: Seconds;
  #pianoFrom: Seconds;
  readonly #piano: PianoPlay | null;
  #stopped = false;

  /**
   * The rendering placed so that its time 0 is at context time `origin`, sounding from `begin`,
   * weighed by `weight`, at `mix`; its piano played by `piano` into its own inputs, unless that is
   * an instrument (which the player switches itself).
   */
  constructor(
    graph: AudioGraph,
    rendering: Rendering,
    placed: { readonly origin: number; readonly begin: number; readonly fresh: boolean },
    weight: Weight,
    mix: Mix,
    piano: PianoOutput | null,
  ) {
    const context = graph.context;
    this.#context = context;
    this.#rendering = rendering;
    this.origin = placed.origin;
    this.begin = placed.begin;
    this.fresh = placed.fresh;
    this.weight = weight;
    this.#mix = mix;
    const gain = (value: number): GainNode => {
      const node = context.createGain();
      node.gain.value = value;
      return node;
    };
    this.#mixGains = { hum: gain(mix.hum), piece: gain(mix.piece), harmonies: gain(mix.harmonies) };
    // the three through one gain, the weight: merged as three channels, and parted again after it
    const merger = context.createChannelMerger(3);
    const splitter = context.createChannelSplitter(3);
    this.#gain = gain(weight.at(-Infinity));
    this.#mixGains.hum.connect(merger, 0, 0);
    this.#mixGains.piece.connect(merger, 0, 1);
    this.#mixGains.harmonies.connect(merger, 0, 2);
    merger.connect(this.#gain);
    this.#gain.connect(splitter);
    splitter.connect(graph.hum, 0);
    splitter.connect(graph.piano, 1);
    splitter.connect(graph.harmonies, 2);
    this.#nodes = [
      this.#mixGains.hum,
      this.#mixGains.piece,
      this.#mixGains.harmonies,
      merger,
      this.#gain,
      splitter,
    ];
    const first = weight.points.at(0);
    const rest = weight.points.slice(1);
    if (first) this.#gain.gain.setValueAtTime(first.value, first.time);
    this.#ramp(rest);
    const t = this.begin - this.origin;
    this.#voiceUntil = Math.max(0, t);
    this.#pianoFrom = t;
    this.#piano = piano?.play(rendering, t, this.begin, this.#mixGains) ?? null;
  }

  /** What it plays. */
  get rendering(): Rendering {
    return this.#rendering;
  }

  /**
   * Go on as another rendering that sounds the same (`sound`), with the same mix: what plays plays
   * on, now under its name. Fading from one into the other would add the two up, the same sound.
   */
  relabel(rendering: Rendering): void {
    if (rendering.sound !== this.#rendering.sound) throw new Error('a lane goes on only as the same sound');
    this.#rendering = rendering;
  }

  /** Its time at a context time. */
  position(time: number): Seconds {
    return time - this.origin;
  }

  /** The context time of a time of the rendering. */
  at(t: Seconds): number {
    return this.origin + t;
  }

  get mix(): Mix {
    return this.#mix;
  }

  /** Another mix: its gains glide there. */
  set mix(mix: Mix) {
    this.#mix = mix;
    const now = this.#context.currentTime;
    this.#mixGains.hum.gain.setTargetAtTime(mix.hum, now, GLIDE);
    this.#mixGains.piece.gain.setTargetAtTime(mix.piece, now, GLIDE);
    this.#mixGains.harmonies.gain.setTargetAtTime(mix.harmonies, now, GLIDE);
  }

  #ramp(points: readonly Point[]): void {
    for (const p of points) this.#gain.gain.linearRampToValueAtTime(p.value, p.time);
  }

  /**
   * Fade out from wherever it is at context time `time`, over `length`: another comes in meanwhile,
   * both taken by `corrected` where they are alike.
   */
  fadeOut(time: number, length: Seconds, corrected?: Correction): void {
    const added = this.weight.fadeOut(time, length, corrected);
    this.#gain.gain.cancelScheduledValues(time + 1e-6);
    this.#ramp(added);
  }

  /** Whether it has faded out for good by context time `time`. */
  over(time: number): boolean {
    const end = this.weight.end;
    return end !== null && time > end + 0.05;
  }

  /** How far it is to be handed over by context time `time` and `ahead` beyond: no further than it is heard. */
  #horizon(time: number, ahead: Seconds): Seconds {
    const end = this.weight.end;
    const t = this.position(time) + ahead;
    return Math.min(this.rendering.duration, end === null ? t : Math.min(t, this.position(end) + 0.02));
  }

  /** Whether its voice has been handed over as far as it has sound, short of where it is now. */
  starved(time: number): boolean {
    if (this.rendering.whole) return false;
    return this.#voiceUntil < this.rendering.duration && this.#voiceUntil - this.position(time) < 0.05;
  }

  /**
   * Hand the voice and the piano to the audio graph up to `ahead` beyond where it is at `time`, as
   * far as the voice has sound; the piano an instrument's delay further where it has.
   */
  schedule(time: number, ahead: Seconds, lead: Seconds): void {
    if (this.#stopped) return;
    this.weight.forget(time);
    const rendering = this.rendering;
    const horizon = this.#horizon(time, ahead);
    const whole = rendering.whole;
    if (whole) {
      if (this.#sources.length === 0) {
        // the whole voice from where it begins: one source, its offset that time of the rendering
        const source = this.#context.createBufferSource();
        source.buffer = whole;
        source.connect(this.#mixGains.hum);
        const t = this.begin - this.origin;
        source.start(t >= 0 ? this.begin : this.origin, Math.max(0, t));
        this.#sources.push(source);
      }
      this.#voiceUntil = Math.max(this.#voiceUntil, horizon);
    } else
      while (this.#voiceUntil < horizon && this.#voiceUntil < rendering.duration) {
        const t1 = Math.min(rendering.duration, this.#voiceUntil + SEGMENT);
        if (!rendering.rendered(this.#voiceUntil, t1)) break;
        const a = Math.floor(this.#voiceUntil * SAMPLE_RATE);
        const b = Math.floor(t1 * SAMPLE_RATE);
        const buffer = this.#context.createBuffer(1, b - a, SAMPLE_RATE);
        buffer.getChannelData(0).set(rendering.audio.subarray(a, b));
        const source = this.#context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.#mixGains.hum);
        // each piece where its first sample falls, so that they join sample to sample
        source.start(Math.max(this.#context.currentTime, this.at(a / SAMPLE_RATE)));
        this.#sources.push(source);
        this.#voiceUntil = t1;
      }
    if (this.#sources.length > 400) this.#sources = this.#sources.slice(-300);
    if (!this.#piano) return;
    const ahead2 = Math.min(rendering.duration, this.#horizon(time, ahead + lead));
    const until = whole
      ? ahead2
      : rendering.rendered(this.#voiceUntil, ahead2)
        ? Math.max(this.#voiceUntil, ahead2)
        : this.#voiceUntil;
    this.#piano.schedule(this.#pianoFrom, until, (x) => this.at(x));
    this.#pianoFrom = Math.max(this.#pianoFrom, until);
  }

  /** Silence it and take it out of the audio graph. */
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    for (const source of this.#sources) {
      try {
        source.stop();
      } catch {
        // not started yet, or already stopped
      }
    }
    this.#sources = [];
    this.#piano?.stop();
    const nodes = this.#nodes;
    setTimeout(() => {
      for (const node of nodes) node.disconnect();
    }, 200);
  }
}
