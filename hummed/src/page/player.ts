// The transport: the voice played from the stream in short buffers, the piano from its notes (the
// piece's and the harmonies', each into its own bus, both always: the elaboration decides which
// is heard), and a new rendering taking over at the same place in the score once it has sound there.
import type { PianoNote, Setting, StartAt } from '../shared/protocol.ts';
import { SAMPLE_RATE, type Seconds } from '../shared/units.ts';
import type { AudioGraph } from './audio-graph.ts';
import type { PianoSampler } from './piano.ts';
import type { VoiceEvent, VoicePool } from './pool.ts';
import { Rendering } from './rendering.ts';

/** How far ahead sound is scheduled, and in what lengths the voice is handed to the audio graph. */
const LOOKAHEAD: Seconds = 0.6;
const SEGMENT: Seconds = 0.25;
/** How far the old voice may carry on while a new setting renders, at most. */
const MAX_SWITCH_LEAD: Seconds = 1.2;

export interface PlayerView {
  /** A rendering has taken over: its length, its bars. */
  adopted(rendering: Rendering): void;
  /** A short notice, or '' when all is well. */
  status(text: string): void;
  playingChanged(playing: boolean): void;
  /** Something to redraw. */
  changed(): void;
}

export class Player {
  readonly #graph: AudioGraph;
  readonly #piano: PianoSampler;
  readonly #pool: VoicePool;
  readonly #view: PlayerView;
  readonly #renders = new Map<number, Rendering>();
  #nextId = 1;
  #current: Rendering | null = null;
  #pending: { readonly id: number; readonly setting: Setting } | null = null;
  /** The setting last asked for: the pending one's, else the current one's. */
  #wanted: Setting | null = null;
  #playing = false;
  /** Playing, but stopped where the voice has not been rendered yet. */
  #waiting = false;
  #startAt = 0;
  #offset: Seconds = 0;
  #voiceUntil: Seconds = 0;
  #pianoFrom: Seconds = 0;
  #active: AudioScheduledSourceNode[] = [];

  constructor(graph: AudioGraph, piano: PianoSampler, pool: VoicePool, view: PlayerView) {
    this.#graph = graph;
    this.#piano = piano;
    this.#pool = pool;
    this.#view = view;
    setInterval(() => {
      this.#tick();
    }, 50);
  }

  get current(): Rendering | null {
    return this.#current;
  }

  get playing(): boolean {
    return this.#playing;
  }

  position(): Seconds {
    const cur = this.#current;
    if (!cur || !this.#playing || this.#waiting) return this.#offset;
    return Math.min(
      cur.duration,
      this.#offset + Math.max(0, this.#graph.context.currentTime - this.#startAt),
    );
  }

  /** Ask the workers for a setting, starting where given. */
  request(setting: Setting, start: StartAt): void {
    const id = this.#nextId++;
    this.#pool.request(id, setting, start);
    this.#pending = { id, setting };
    this.#wanted = setting;
    for (const key of [...this.#renders.keys()]) if (key !== this.#current?.id) this.#renders.delete(key);
    this.#view.status('Rendering…');
  }

  /** Another setting, from a little ahead: where the playhead will be when it is ready. */
  change(setting: Setting): void {
    const cur = this.#current;
    const base = this.#wanted ?? cur?.setting;
    if (!base || Math.abs(setting.elaboration - base.elaboration) < 1e-9) return;
    const lead =
      this.#playing && cur ? Math.max(0, Math.min(MAX_SWITCH_LEAD, cur.aheadOf(this.position()) - 0.3)) : 0;
    const t = cur ? Math.min(cur.duration, this.position() + lead) : 0;
    this.request(setting, { tick: cur ? cur.toTick(t) : 0 });
  }

  receive(message: VoiceEvent): void {
    if (message.type === 'error') {
      this.#view.status(`VocalTractLab stopped: ${message.message}`);
      return;
    }
    if (message.type === 'plan') {
      this.#renders.set(message.id, new Rendering(message));
      return;
    }
    const rendering = this.#renders.get(message.id);
    if (!rendering) return;
    if (message.type === 'done') {
      rendering.done = true;
      return;
    }
    rendering.receive(message);
    if (this.#pending?.id === message.id) this.#maybeSwitch();
    if (this.#current === rendering) this.#view.changed();
  }

  play(): void {
    const cur = this.#current;
    if (!cur) return;
    if (this.#offset >= cur.duration - 0.05) this.#offset = 0;
    void this.#graph.context.resume();
    this.#setPlaying(true);
    this.#startFrom(this.#offset);
  }

  pause(): void {
    this.#offset = this.position();
    this.#waiting = false;
    this.#stopAll();
    this.#setPlaying(false);
    this.#view.changed();
  }

  toggle(): void {
    if (this.#playing) this.pause();
    else this.play();
  }

  /** Go to a time; if the voice is not there yet, it is rendered from there. */
  seek(t: Seconds): void {
    const cur = this.#current;
    if (!cur) return;
    t = Math.max(0, Math.min(cur.duration, t));
    if (!cur.rendered(t, t + 0.3)) this.request(this.#wanted ?? cur.setting, { seconds: t });
    this.#offset = t;
    if (this.#playing) this.#startFrom(t);
    this.#view.changed();
  }

  /** Move the paused playhead without asking for sound (while dragging the strip). */
  scrub(t: Seconds): void {
    const cur = this.#current;
    if (!cur || this.#playing) return;
    this.#offset = Math.max(0, Math.min(cur.duration, t));
    this.#view.changed();
  }

  #setPlaying(playing: boolean): void {
    this.#playing = playing;
    this.#view.playingChanged(playing);
  }

  #stopAll(): void {
    for (const source of this.#active) {
      try {
        source.stop();
      } catch {
        // not started yet, or already stopped
      }
    }
    this.#active = [];
  }

  #startFrom(t: Seconds): void {
    const cur = this.#current;
    if (!cur) return;
    this.#stopAll();
    this.#offset = t;
    this.#startAt = this.#graph.context.currentTime + 0.06;
    this.#voiceUntil = t;
    this.#pianoFrom = t;
    this.#waiting = false;
    // notes already sounding at t (held by the pedal) come in where they are
    for (const [notes, output] of this.#pianoParts(cur))
      for (const note of notes) {
        if (note.on < t && note.on + note.duration > t + 0.05) {
          const source = this.#piano.play(note, output, this.#startAt, t - note.on);
          if (source) this.#active.push(source);
        }
      }
    this.#schedule();
  }

  /** The piano's two parts: the piece, and its harmonies. */
  #pianoParts(cur: Rendering): readonly (readonly [readonly PianoNote[], AudioNode])[] {
    return [
      [cur.piano, this.#graph.piano],
      [cur.harmonies, this.#graph.harmonies],
    ];
  }

  #contextTime(t: Seconds): number {
    return this.#startAt + (t - this.#offset);
  }

  #schedule(): void {
    const cur = this.#current;
    if (!this.#playing || !cur || this.#waiting) return;
    const { context, hum } = this.#graph;
    const t = this.position();
    const horizon = t + LOOKAHEAD;
    while (this.#voiceUntil < horizon && this.#voiceUntil < cur.duration) {
      const t1 = Math.min(cur.duration, this.#voiceUntil + SEGMENT);
      if (!cur.rendered(this.#voiceUntil, t1)) break;
      const a = Math.floor(this.#voiceUntil * SAMPLE_RATE);
      const b = Math.floor(t1 * SAMPLE_RATE);
      const buffer = context.createBuffer(1, b - a, SAMPLE_RATE);
      buffer.getChannelData(0).set(cur.audio.subarray(a, b));
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(hum);
      source.start(this.#contextTime(this.#voiceUntil));
      this.#active.push(source);
      this.#voiceUntil = t1;
    }
    const until = Math.min(horizon, this.#voiceUntil);
    for (const [notes, output] of this.#pianoParts(cur))
      for (const note of notes) {
        if (note.on >= this.#pianoFrom && note.on < until) {
          const source = this.#piano.play(note, output, this.#contextTime(note.on), 0);
          if (source) this.#active.push(source);
        }
      }
    this.#pianoFrom = Math.max(this.#pianoFrom, until);
    if (this.#active.length > 400) this.#active = this.#active.slice(-300);
    if (this.#voiceUntil < cur.duration && this.#voiceUntil - t < 0.05) {
      // the voice has not been rendered this far yet
      this.#offset = t;
      this.#waiting = true;
      this.#stopAll();
      this.#view.status('Waiting for VocalTractLab…');
    }
  }

  #tick(): void {
    const cur = this.#current;
    if (this.#pending) this.#maybeSwitch();
    if (this.#playing && this.#waiting && cur?.rendered(this.#offset, this.#offset + 0.5)) {
      this.#startFrom(this.#offset);
      if (!this.#pending) this.#view.status('');
    }
    this.#schedule();
    if (cur && this.#playing && !this.#waiting && this.position() >= cur.duration - 0.01) {
      this.#offset = cur.duration;
      this.#stopAll();
      this.#setPlaying(false);
    }
    if (this.#playing) this.#view.changed();
  }

  /** A new rendering takes over at the same place in the score, once it has sound there. */
  #maybeSwitch(): void {
    if (!this.#pending) return;
    const next = this.#renders.get(this.#pending.id);
    if (!next) return;
    const cur = this.#current;
    if (!cur) {
      if (next.rendered(0, 0.5)) this.#adopt(next, 0);
      return;
    }
    let t = next.toSeconds(cur.toTick(this.position()));
    if (t < next.startSeconds - 0.01) {
      // not there yet: wait while the old voice plays on, take over at its start once it has stopped
      if (this.#playing && !this.#waiting) return;
      t = next.startSeconds;
    }
    if (next.rendered(t, t + 0.4)) this.#adopt(next, t);
  }

  #adopt(next: Rendering, t: Seconds): void {
    const was = this.#current;
    this.#current = next;
    this.#pending = null;
    if (was && was !== next) this.#renders.delete(was.id);
    const { context, master } = this.#graph;
    if (this.#playing) {
      master.gain.setTargetAtTime(0, context.currentTime, 0.01);
      setTimeout(() => {
        this.#startFrom(t);
        master.gain.setTargetAtTime(1, context.currentTime + 0.05, 0.02);
      }, 40);
    } else this.#offset = t;
    this.#view.status('');
    this.#view.adopted(next);
    this.#view.changed();
  }
}
