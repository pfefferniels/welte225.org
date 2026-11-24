// The transport: the voice played from the stream in short buffers, the piano handed to its output
// (outputs.ts: in the page, or on an instrument over MIDI) as it falls due, and a new rendering
// taking over at the same place in the score once it has sound there.
import { sameSetting, type Setting, type StartAt } from '../shared/protocol.ts';
import { SAMPLE_RATE, type Seconds } from '../shared/units.ts';
import { CROSSFADE, fade, type AudioGraph } from './audio-graph.ts';
import type { PianoOutput } from './outputs.ts';
import type { VoiceEvent, VoicePool } from './pool.ts';
import { Rendering } from './rendering.ts';

/** How far ahead sound is scheduled, and in what lengths the voice is handed to the audio graph. */
const LOOKAHEAD: Seconds = 0.6;
const SEGMENT: Seconds = 0.25;
/**
 * How far the old voice carries on while a new setting renders: as long as the settings asked for
 * lately took to have their first sound, and a little more, within these bounds. A setting that
 * came sooner (one the workers had kept) shortens it by a fifth only: the next may be new again,
 * and a rendering that is late for the playhead has to catch up with it.
 */
const MAX_SWITCH_LEAD: Seconds = 1.2;
const MIN_SWITCH_LEAD: Seconds = 0.4;
const SWITCH_MARGIN: Seconds = 0.1;
const SWITCH_EASE = 0.8;
/** From a start to the first sound: time to schedule it. */
const START_MARGIN: Seconds = 0.06;

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
  #piano: PianoOutput;
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
  /** When the pending setting was asked for (0 once timed), and how long the last ones took to be ready. */
  #askedAt = 0;
  #took: Seconds = MAX_SWITCH_LEAD;
  /** The voice's buffers handed to the audio graph, through a fade of their own. */
  #active: AudioScheduledSourceNode[] = [];
  #lane: GainNode | null = null;
  /** The voice of a setting fading out under the next. */
  readonly #fading = new Set<{ readonly lane: GainNode; readonly sources: AudioScheduledSourceNode[] }>();

  constructor(graph: AudioGraph, piano: PianoOutput, pool: VoicePool, view: PlayerView) {
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

  /** Whether the playhead moves on by itself: playing, and not stopped to wait for the voice or the piano. */
  get moving(): boolean {
    return this.#playing && !this.#waiting;
  }

  /** Sound the piano another way; playing goes on from where it is, after a short stop. */
  setPiano(piano: PianoOutput): void {
    const playing = this.#playing;
    if (playing) this.pause();
    this.#piano.stop();
    this.#piano = piano;
    if (playing) this.play();
  }

  /** Start the piano afresh a little ahead, the voice going on (an instrument's part has changed). */
  restartPiano(): void {
    this.#piano.stop();
    const cur = this.#current;
    if (!cur || !this.#playing || this.#waiting) return;
    const t = this.position() + this.#piano.lead + START_MARGIN;
    this.#piano.start(cur, t, this.#contextTime(t));
    this.#pianoFrom = t;
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
    // the piano's sound for the setting loads while the voice is prepared, not after
    this.#piano.preload?.(setting);
    this.#askedAt = performance.now();
    this.#pending = { id, setting };
    this.#wanted = setting;
    for (const key of [...this.#renders.keys()]) if (key !== this.#current?.id) this.#renders.delete(key);
    this.#view.status('Rendering…');
  }

  /** Another setting, from a little ahead: where the playhead will be when it is ready. */
  change(setting: Setting): void {
    const cur = this.#current;
    const base = this.#wanted ?? cur?.setting;
    if (!base || sameSetting(setting, base)) return;
    const wanted = Math.min(MAX_SWITCH_LEAD, Math.max(MIN_SWITCH_LEAD, this.#took + SWITCH_MARGIN));
    const lead = this.#playing && cur ? Math.max(0, Math.min(wanted, cur.aheadOf(this.position()) - 0.3)) : 0;
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
    if (this.#playing) {
      this.#stopAll();
      this.#startFrom(t);
    }
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

  static #stopSources(sources: readonly AudioScheduledSourceNode[]): void {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // not started yet, or already stopped
      }
    }
  }

  /** Stop the voice that plays now; what fades out under it runs on. */
  #stopVoice(): void {
    Player.#stopSources(this.#active);
    this.#active = [];
    const lane = this.#lane;
    if (lane)
      setTimeout(() => {
        lane.disconnect();
      }, 200);
    this.#lane = null;
  }

  /** Stop everything: the voice, what fades out, the piano. */
  #stopAll(): void {
    this.#stopVoice();
    for (const { lane, sources } of this.#fading) {
      Player.#stopSources(sources);
      lane.disconnect();
    }
    this.#fading.clear();
    this.#piano.stop();
  }

  /** Start the current rendering at `t`, fading in over `fadeIn` (a setting taking over). */
  #startFrom(t: Seconds, fadeIn: Seconds = 0): void {
    const cur = this.#current;
    if (!cur) return;
    this.#stopVoice();
    this.#offset = t;
    if (!this.#piano.ready(cur)) {
      // its sound is still loading: wait, as for the voice
      this.#stopAll();
      this.#waiting = true;
      this.#view.status('Loading the piano…');
      return;
    }
    const { context, hum } = this.#graph;
    this.#startAt = context.currentTime + START_MARGIN + this.#piano.lead;
    this.#lane = context.createGain();
    this.#lane.connect(hum);
    if (fadeIn > 0) fade(this.#lane.gain, 'in', this.#startAt, fadeIn);
    this.#voiceUntil = t;
    this.#pianoFrom = t;
    this.#waiting = false;
    this.#piano.start(cur, t, this.#startAt, fadeIn);
    this.#schedule();
  }

  #contextTime(t: Seconds): number {
    return this.#startAt + (t - this.#offset);
  }

  /** Hand the voice of the rendering to the audio graph, as far as it has sound, up to `horizon`. */
  #voiceTo(cur: Rendering, horizon: Seconds): void {
    const { context } = this.#graph;
    const lane = this.#lane;
    if (!lane) return;
    while (this.#voiceUntil < horizon && this.#voiceUntil < cur.duration) {
      const t1 = Math.min(cur.duration, this.#voiceUntil + SEGMENT);
      if (!cur.rendered(this.#voiceUntil, t1)) break;
      const a = Math.floor(this.#voiceUntil * SAMPLE_RATE);
      const b = Math.floor(t1 * SAMPLE_RATE);
      const buffer = context.createBuffer(1, b - a, SAMPLE_RATE);
      buffer.getChannelData(0).set(cur.audio.subarray(a, b));
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(lane);
      source.start(Math.max(context.currentTime, this.#contextTime(this.#voiceUntil)));
      this.#active.push(source);
      this.#voiceUntil = t1;
    }
  }

  #schedule(): void {
    const cur = this.#current;
    if (!this.#playing || !cur || this.#waiting) return;
    const t = this.position();
    const horizon = t + LOOKAHEAD;
    this.#voiceTo(cur, horizon);
    // the piano as far as the voice has sound, and an instrument's delay further where it has
    const ahead = Math.min(cur.duration, horizon + this.#piano.lead);
    const until = cur.rendered(this.#voiceUntil, ahead)
      ? Math.max(this.#voiceUntil, ahead)
      : this.#voiceUntil;
    this.#piano.schedule(cur, this.#pianoFrom, until, (x) => this.#contextTime(x));
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
    if (
      this.#playing &&
      this.#waiting &&
      cur &&
      this.#offset < cur.duration - 0.01 &&
      cur.rendered(this.#offset, this.#offset + 0.5) &&
      this.#piano.ready(cur)
    ) {
      this.#startFrom(this.#offset);
      if (!this.#pending) this.#view.status('');
    }
    this.#schedule();
    if (cur && this.#playing && !this.#waiting && this.position() >= cur.duration - 0.01) {
      this.#offset = cur.duration;
      this.#stopAll();
      // at the end of this rendering with another on its way (a barer one is shorter, and ends
      // sooner): wait for that one, which takes over at the same place, rather than stop
      if (this.#pending) {
        this.#waiting = true;
        this.#view.status('Waiting for VocalTractLab…');
      } else this.#setPlaying(false);
    }
    if (this.#playing) this.#view.changed();
  }

  /** A new rendering takes over at the same place in the score, once it has sound there. */
  #maybeSwitch(): void {
    if (!this.#pending) return;
    const next = this.#renders.get(this.#pending.id);
    if (!next) return;
    // how long it took to have its first sound, and its piano: the next change leads by as much
    const { startSeconds } = next;
    if (this.#askedAt > 0 && next.rendered(startSeconds, startSeconds + 0.4) && this.#piano.ready(next)) {
      const took = (performance.now() - this.#askedAt) / 1000;
      this.#took = Math.min(MAX_SWITCH_LEAD, Math.max(took, SWITCH_EASE * this.#took));
      this.#askedAt = 0;
    }
    const cur = this.#current;
    const pianoReady = (): boolean => {
      const ready = this.#piano.ready(next);
      if (!ready) this.#view.status('Loading the piano…');
      return ready;
    };
    if (!cur) {
      if (next.rendered(0, 0.5) && pianoReady()) this.#adopt(next, 0);
      return;
    }
    let t = next.toSeconds(cur.toTick(this.position()));
    if (t < next.startSeconds - 0.01) {
      // not there yet: wait while the old voice plays on, take over at its start once it has stopped
      if (this.#playing && !this.#waiting) return;
      t = next.startSeconds;
    }
    if (next.rendered(t, t + 0.4) && pianoReady()) this.#adopt(next, t);
  }

  #adopt(next: Rendering, t: Seconds): void {
    const was = this.#current;
    this.#current = next;
    this.#pending = null;
    if (was && was !== next) this.#renders.delete(was.id);
    if (this.#playing && !this.#waiting && was && was !== next) {
      // the old setting runs on through the crossfade, as far as it has sound, and fades out,
      // while the new one fades in from the same place in the score
      const { context } = this.#graph;
      const when = context.currentTime + START_MARGIN + this.#piano.lead;
      const upto = Math.min(was.duration, this.position() + START_MARGIN + CROSSFADE + 0.1);
      this.#voiceTo(was, upto);
      if (this.#piano.fadeOut)
        this.#piano.fadeOut(
          was,
          this.#pianoFrom,
          Math.max(this.#pianoFrom, Math.min(upto, this.#voiceUntil)),
          (x) => this.#contextTime(x),
          when,
          CROSSFADE,
        );
      else this.#piano.stop();
      const lane = this.#lane;
      if (lane) {
        fade(lane.gain, 'out', when, CROSSFADE);
        const going = { lane, sources: this.#active };
        this.#fading.add(going);
        setTimeout(
          () => {
            Player.#stopSources(going.sources);
            lane.disconnect();
            this.#fading.delete(going);
          },
          (when - context.currentTime + CROSSFADE + 0.1) * 1000,
        );
      }
      this.#active = [];
      this.#lane = null;
      this.#startFrom(t, CROSSFADE);
    } else if (this.#playing) {
      // waiting for sound (or nothing playing to fade from): it starts here once it has some
      this.#stopAll();
      this.#offset = t;
      this.#waiting = true;
    } else this.#offset = t;
    this.#view.status('');
    this.#view.adopted(next);
    this.#view.changed();
  }
}
