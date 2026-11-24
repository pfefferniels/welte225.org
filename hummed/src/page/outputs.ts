// How the piano sounds: in the page (the Pianoteq recordings, or the sampled grand where a setting has
// none) or on an instrument over MIDI (midi.ts). The player hands either the rendering it plays, from
// where, and what falls due; each sounds it its own way.
import { plain, type Setting } from '../shared/protocol.ts';
import { recordingOf } from '../shared/recordings.ts';
import type { Seconds } from '../shared/units.ts';
import { fade, type AudioGraph } from './audio-graph.ts';
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
  /** Start at time `t` of the rendering, which sounds at context time `when`; fading in over `fadeIn`. */
  start(rendering: Rendering, t: Seconds, when: number, fadeIn?: Seconds): void;
  /** Hand over what begins in [from, until) of the rendering; `at` is the context time of a time in it. */
  schedule(rendering: Rendering, from: Seconds, until: Seconds, at: (t: Seconds) => number): void;
  /**
   * Let what plays now run on through a crossfade, as far as `until` of the rendering, and fade out
   * over `seconds` from context time `when` (an output that cannot fade has none: it stops).
   */
  fadeOut?(
    rendering: Rendering,
    from: Seconds,
    until: Seconds,
    at: (t: Seconds) => number,
    when: number,
    seconds: Seconds,
  ): void;
  /** Silence everything handed over. */
  stop(): void;
}

/** What one start of the page's piano plays: each part through a fade of its own into its bus. */
interface Group {
  readonly piece: GainNode;
  readonly harmonies: GainNode;
  sources: AudioScheduledSourceNode[];
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
  /** What plays now, and what fades out under it. */
  #group: Group | null = null;
  readonly #fading = new Set<Group>();
  /** Whether the sampler plays the rendering started last (it schedules notes as they come). */
  #sampling = false;
  /** Whether a setting was recorded from the performance as it is (by its elaboration): looked at once. */
  readonly #current = new Map<number, boolean>();

  constructor(graph: AudioGraph, sampler: PianoSampler) {
    this.#graph = graph;
    this.#sampler = sampler;
  }

  set recordings(recordings: Recordings | null) {
    this.#recordings = recordings;
    this.#current.clear();
  }

  /**
   * Whether the rendering is played from a recording (else by the sampler): one of the elaboration
   * alone, nothing set apart from it in the details.
   */
  recorded(rendering: Rendering): boolean {
    const recordings = this.#recordings;
    const entry = plain(rendering.setting) ? recordings?.setting(rendering.setting.elaboration) : null;
    if (!recordings || !entry || recordings.failed(rendering.setting.elaboration)) return false;
    let current = this.#current.get(entry.elaboration);
    if (current === undefined) {
      const { piece, harmonies } = rendering.parts;
      current = recordingOf(entry.piece, piece) && recordingOf(entry.harmonies, harmonies);
      this.#current.set(entry.elaboration, current);
      if (!current)
        console.warn(
          `The Pianoteq recording of ×${rendering.setting.elaboration} is of another performance: run npm run pianoteq.`,
        );
    }
    return current;
  }

  /** The setting's recordings, where there are any: fetched and decoded while the voice is prepared. */
  preload(setting: Setting): void {
    const entry = plain(setting) ? this.#recordings?.setting(setting.elaboration) : null;
    // not one already found to be of another performance
    if (entry && this.#current.get(entry.elaboration) !== false)
      this.#recordings?.buffers(setting.elaboration);
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

  #newGroup(when: number, fadeIn: Seconds): Group {
    const { context } = this.#graph;
    const group: Group = { piece: context.createGain(), harmonies: context.createGain(), sources: [] };
    group.piece.connect(this.#graph.piano);
    group.harmonies.connect(this.#graph.harmonies);
    if (fadeIn > 0) for (const g of [group.piece, group.harmonies]) fade(g.gain, 'in', when, fadeIn);
    return group;
  }

  #stopGroup(group: Group): void {
    for (const source of group.sources) {
      try {
        source.stop();
      } catch {
        // not started yet, or already stopped
      }
    }
    group.sources = [];
    setTimeout(() => {
      group.piece.disconnect();
      group.harmonies.disconnect();
    }, 200);
  }

  #bus(part: PianoPartName): GainNode {
    this.#group ??= this.#newGroup(this.#graph.context.currentTime, 0);
    return part === 'piece' ? this.#group.piece : this.#group.harmonies;
  }

  #push(source: AudioScheduledSourceNode): void {
    const group = this.#group;
    if (!group) return;
    group.sources.push(source);
    if (group.sources.length > 400) group.sources = group.sources.slice(-300);
  }

  start(rendering: Rendering, t: Seconds, when: number, fadeIn: Seconds = 0): void {
    // what fades out under it runs on; what played before is stopped
    if (this.#group) this.#stopGroup(this.#group);
    this.#group = this.#newGroup(when, fadeIn);
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
        this.#push(source);
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
  }

  fadeOut(
    rendering: Rendering,
    from: Seconds,
    until: Seconds,
    at: (t: Seconds) => number,
    when: number,
    seconds: Seconds,
  ): void {
    const group = this.#group;
    if (!group) return;
    // the sampler's notes through the fade (a recording plays on by itself)
    this.schedule(rendering, from, until, at);
    for (const g of [group.piece, group.harmonies]) fade(g.gain, 'out', when, seconds);
    this.#group = null;
    this.#fading.add(group);
    setTimeout(
      () => {
        this.#stopGroup(group);
        this.#fading.delete(group);
      },
      (when - this.#graph.context.currentTime + seconds + 0.1) * 1000,
    );
  }

  #play(note: Parameters<PianoSampler['play']>[0], part: PianoPartName, when: number, from: Seconds): void {
    const source = this.#sampler.play(note, this.#bus(part), when, from);
    if (source) this.#push(source);
  }

  stop(): void {
    if (this.#group) this.#stopGroup(this.#group);
    this.#group = null;
    for (const group of this.#fading) this.#stopGroup(group);
    this.#fading.clear();
  }
}
