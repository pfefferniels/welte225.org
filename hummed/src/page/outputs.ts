// How the piano sounds: in the page (the Pianoteq recordings, or the sampled grand where a setting has
// none) or on an instrument over MIDI (midi.ts). The player hands either a rendering to play, from
// where, and what falls due; each sounds it its own way. The page's piano plays each setting that
// sounds into that setting's own inputs, which fade with its voice; an instrument plays one setting
// at a time, and switches from one to the next.
import { plain, type Setting } from '../shared/protocol.ts';
import { recordingOf } from '../shared/recordings.ts';
import type { Seconds } from '../shared/units.ts';
import type { PianoSampler, PianoSound } from './piano.ts';
import type { Recordings } from './recordings.ts';
import type { PianoPartName, Rendering } from './rendering.ts';

/** Where a setting's piano is heard: an input for each part, which the setting's mix and fade follow. */
export interface PianoInputs {
  readonly piece: AudioNode;
  readonly harmonies: AudioNode;
}

/** A rendering's piano as it plays. */
export interface PianoPlay {
  /** Hand over what begins in [from, until) of the rendering; `at` is the context time of a time in it. */
  schedule(from: Seconds, until: Seconds, at: (t: Seconds) => number): void;
  /** Silence it: at once, or at a context time (where what was handed over reaches no further). */
  stop(at?: number): void;
}

export interface PianoOutput {
  /** How long before its time a sound has to be handed over (an instrument's own delay). */
  readonly lead: Seconds;
  /**
   * Whether several renderings can sound at once, each fading (the page's piano), or only one, which
   * switches to the next (an instrument).
   */
  readonly fades: boolean;
  /**
   * A setting has been asked for: start loading what its piano will need, while the voice is
   * prepared (before there is a rendering to ask `ready` of).
   */
  preload?(setting: Setting): void;
  /** Whether the rendering's piano can start now with these parts heard; asking starts loading what it needs. */
  ready(rendering: Rendering, heard: readonly PianoPartName[]): boolean;
  /**
   * Play the rendering from its time `t`, heard at context time `when`, into a setting's inputs
   * (an instrument, which is heard elsewhere, has none).
   */
  play(rendering: Rendering, t: Seconds, when: number, into: PianoInputs | null): PianoPlay;
  /**
   * A part's sound as one buffer, where this piano plays it from one (a recording decoded): what a
   * crossfade measures how alike two settings sound by. Null where it plays notes as they come.
   */
  buffer?(rendering: Rendering, part: PianoPartName): AudioBuffer | null;
  /** Silence everything handed over. */
  stop(): void;
}

const PARTS: readonly PianoPartName[] = ['piece', 'harmonies'];

/**
 * The piano in the page, both parts at once into a setting's two inputs (its mix sets which is
 * heard): the setting's Pianoteq recordings where they are of the performance as it is, else the
 * sampler.
 */
export class BuiltInPiano implements PianoOutput {
  readonly lead = 0;
  readonly fades = true;
  readonly #sampler: PianoSampler;
  #recordings: Recordings | null = null;
  /** What plays now. */
  readonly #playing = new Set<PianoPlay>();
  /** Whether a setting was recorded from the performance as it is (by its elaboration): looked at once. */
  readonly #current = new Map<number, boolean>();

  constructor(sampler: PianoSampler) {
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

  /** The setting's recordings, where there are any: fetched while the voice is prepared. */
  preload(setting: Setting): void {
    const entry = plain(setting) ? this.#recordings?.setting(setting.elaboration) : null;
    // not one already found to be of another performance
    if (entry && this.#current.get(entry.elaboration) !== false)
      this.#recordings?.fetchAhead(setting.elaboration);
  }

  ready(rendering: Rendering, heard: readonly PianoPartName[]): boolean {
    const e = rendering.setting.elaboration;
    if (this.recorded(rendering)) {
      const all = heard.every((part) => this.#recordings?.part(e, part));
      if (all) return true;
      // a recording that failed to load leaves the setting to the sampler
      if (!this.#recordings?.failed(e)) return false;
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
      const buffer = this.#recordings?.part(elaboration, part);
      if (buffer)
        return Promise.resolve({ samples: buffer.getChannelData(0), sampleRate: buffer.sampleRate });
      if (!this.#recordings?.failed(elaboration)) return null;
    }
    if (!this.#sampler.ready()) return null;
    return this.#sampler.render(rendering.held(part), rendering.duration);
  }

  buffer(rendering: Rendering, part: PianoPartName): AudioBuffer | null {
    if (!this.recorded(rendering) || this.#recordings?.failed(rendering.setting.elaboration)) return null;
    return this.#recordings?.part(rendering.setting.elaboration, part) ?? null;
  }

  /** What a rendering's decoded recordings take, in bytes. */
  bytes(rendering: Rendering): number {
    return this.recorded(rendering) ? (this.#recordings?.bytes(rendering.setting.elaboration) ?? 0) : 0;
  }

  play(rendering: Rendering, t: Seconds, when: number, into: PianoInputs | null): PianoPlay {
    if (!into) return { schedule: () => undefined, stop: () => undefined };
    const sampler = this.#sampler;
    const recordings = this.#recordings;
    const recorded = this.recorded(rendering);
    const e = rendering.setting.elaboration;
    let sources: AudioScheduledSourceNode[] = [];
    const push = (source: AudioScheduledSourceNode | null): void => {
      if (!source) return;
      sources.push(source);
      if (sources.length > 400) sources = sources.slice(-300);
    };
    /** The recorded parts playing; one decoded later (switched on in the details) comes in then. */
    const started = new Set<PianoPartName>();
    const startPart = (part: PianoPartName, at: number, from: Seconds): void => {
      const buffer = recordings?.part(e, part);
      if (!buffer || started.has(part)) return;
      started.add(part);
      if (from >= buffer.duration) return;
      const source = into[part].context.createBufferSource();
      source.buffer = buffer;
      source.connect(into[part]);
      // from its place, even where that is before its time (a crossfade that begins at the start)
      source.start(Math.max(at, at - from), Math.max(0, from));
      push(source);
    };
    const playNote = (
      note: Parameters<PianoSampler['play']>[0],
      part: PianoPartName,
      at: number,
      from: Seconds,
    ): void => {
      push(sampler.play(note, into[part], at, from));
    };
    const sampling = !recorded || (recordings?.failed(e) ?? true);
    if (!sampling) for (const part of PARTS) startPart(part, when, t);
    // notes already sounding at t (held by the pedal) come in where they are
    else
      for (const part of PARTS)
        for (const note of rendering.held(part))
          if (note.on < t && note.on + note.duration > t + 0.05) playNote(note, part, when, t - note.on);
    const play: PianoPlay = {
      schedule: (from, until, at) => {
        if (!sampling) {
          for (const part of PARTS) startPart(part, at(from), from);
          return;
        }
        for (const part of PARTS)
          for (const note of rendering.held(part))
            if (note.on >= from && note.on < until) playNote(note, part, at(note.on), 0);
      },
      stop: (at) => {
        for (const source of sources) {
          try {
            source.stop(at);
          } catch {
            // not started yet, or already stopped
          }
        }
        if (at === undefined) sources = [];
        this.#playing.delete(play);
      },
    };
    this.#playing.add(play);
    return play;
  }

  stop(): void {
    for (const play of [...this.#playing]) play.stop();
  }
}
