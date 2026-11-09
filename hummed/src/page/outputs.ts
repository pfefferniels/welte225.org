// How the piano sounds: in the page (the Pianoteq recordings, or the sampled grand where a setting has
// none) or on an instrument over MIDI (midi.ts). The player hands either the rendering it plays, from
// where, and what falls due; each sounds it its own way.
import type { Setting } from '../shared/protocol.ts';
import type { Seconds } from '../shared/units.ts';
import type { AudioGraph } from './audio-graph.ts';
import type { PianoSampler, PianoSound } from './piano.ts';
import type { Recordings } from './recordings.ts';
import type { PianoPartName, Rendering } from './rendering.ts';

export interface PianoOutput {
  /** How long before its time a sound has to be handed over (an instrument's own delay). */
  readonly lead: Seconds;
  /**
   * A setting has been asked for: start loading what its piano will need, while the voice is
   * prepared (before there is a rendering to ask `ready` of).
   */
  preload?(setting: Setting): void;
  /** Whether the rendering's piano can start now; asking starts loading what it needs. */
  ready(rendering: Rendering): boolean;
  /** Start at time `t` of the rendering, which sounds at context time `when`. */
  start(rendering: Rendering, t: Seconds, when: number): void;
  /** Hand over what begins in [from, until) of the rendering; `at` is the context time of a time in it. */
  schedule(rendering: Rendering, from: Seconds, until: Seconds, at: (t: Seconds) => number): void;
  /** Silence everything handed over. */
  stop(): void;
}

const PARTS: readonly PianoPartName[] = ['piece', 'harmonies'];

/**
 * The piano in the page, both parts at once into their own buses (the elaboration fades between
 * them): the setting's Pianoteq recordings where they are of the performance as it is, else the sampler.
 */
export class BuiltInPiano implements PianoOutput {
  readonly lead = 0;
  readonly #graph: AudioGraph;
  readonly #sampler: PianoSampler;
  #recordings: Recordings | null = null;
  #sources: AudioScheduledSourceNode[] = [];
  /** Whether the sampler plays the rendering started last (it schedules notes as they come). */
  #sampling = false;
  readonly #warned = new Set<number>();

  constructor(graph: AudioGraph, sampler: PianoSampler) {
    this.#graph = graph;
    this.#sampler = sampler;
  }

  set recordings(recordings: Recordings | null) {
    this.#recordings = recordings;
  }

  /** Whether the rendering is played from a recording (else by the sampler). */
  recorded(rendering: Rendering): boolean {
    const recordings = this.#recordings;
    const entry = recordings?.setting(rendering.setting.elaboration);
    if (!recordings || !entry || recordings.failed(rendering.setting.elaboration)) return false;
    const { piece, harmonies } = rendering.parts;
    if (entry.piece.keys === piece.keys.length && entry.harmonies.keys === harmonies.keys.length) return true;
    if (!this.#warned.has(rendering.setting.elaboration)) {
      this.#warned.add(rendering.setting.elaboration);
      console.warn(
        `The Pianoteq recording of ×${rendering.setting.elaboration} is of another performance: run npm run pianoteq.`,
      );
    }
    return false;
  }

  /** The setting's recordings, where there are any: fetched and decoded while the voice is prepared. */
  preload(setting: Setting): void {
    if (this.#recordings?.setting(setting.elaboration)) this.#recordings.buffers(setting.elaboration);
  }

  ready(rendering: Rendering): boolean {
    if (this.recorded(rendering)) {
      if (this.#recordings?.buffers(rendering.setting.elaboration)) return true;
      // a recording that failed to load leaves the setting to the sampler
      if (!this.#recordings?.failed(rendering.setting.elaboration)) return false;
    }
    return this.#sampler.ready();
  }

  /**
   * A part's sound as this piano plays the rendering, whole, for its picture: the recording, or the
   * sampler playing ahead. Null while it loads; asking starts that.
   */
  sound(rendering: Rendering, part: PianoPartName): Promise<PianoSound> | null {
    const elaboration = rendering.setting.elaboration;
    if (this.recorded(rendering)) {
      const buffer = this.#recordings?.buffers(elaboration)?.[part];
      if (buffer)
        return Promise.resolve({
          samples: buffer.getChannelData(0).slice(),
          sampleRate: buffer.sampleRate,
        });
      if (!this.#recordings?.failed(elaboration)) return null;
    }
    if (!this.#sampler.ready()) return null;
    return this.#sampler.render(rendering.held(part), rendering.duration);
  }

  #bus(part: PianoPartName): GainNode {
    return part === 'piece' ? this.#graph.piano : this.#graph.harmonies;
  }

  start(rendering: Rendering, t: Seconds, when: number): void {
    this.stop();
    const buffers = this.recorded(rendering)
      ? this.#recordings?.buffers(rendering.setting.elaboration)
      : null;
    this.#sampling = !buffers;
    if (buffers) {
      this.#recordings?.playing(rendering.setting.elaboration);
      for (const part of PARTS) {
        const buffer = buffers[part];
        if (t >= buffer.duration) continue;
        const source = this.#graph.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.#bus(part));
        source.start(when, t);
        this.#sources.push(source);
      }
      return;
    }
    // notes already sounding at t (held by the pedal) come in where they are
    for (const part of PARTS)
      for (const note of rendering.held(part))
        if (note.on < t && note.on + note.duration > t + 0.05) this.#play(note, part, when, t - note.on);
  }

  schedule(rendering: Rendering, from: Seconds, until: Seconds, at: (t: Seconds) => number): void {
    if (!this.#sampling) return;
    for (const part of PARTS)
      for (const note of rendering.held(part))
        if (note.on >= from && note.on < until) this.#play(note, part, at(note.on), 0);
    if (this.#sources.length > 400) this.#sources = this.#sources.slice(-300);
  }

  #play(note: Parameters<PianoSampler['play']>[0], part: PianoPartName, when: number, from: Seconds): void {
    const source = this.#sampler.play(note, this.#bus(part), when, from);
    if (source) this.#sources.push(source);
  }

  stop(): void {
    for (const source of this.#sources) {
      try {
        source.stop();
      } catch {
        // not started yet, or already stopped
      }
    }
    this.#sources = [];
  }
}
