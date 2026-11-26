// The transport: each setting that sounds is a lane (lane.ts), its voice and its piano through a
// weight of their own. A setting that is ready (library.ts) takes over at once: a short equal-power
// crossfade from whatever sounds, placed so that the two are at the same tick of the score at its
// midpoint and kept short enough for them to stay together where both are heard (alignment.ts). A
// setting that is not is rendered from a little ahead, and crossfades in the same way once it has
// sound there. An instrument over MIDI, which cannot fade, switches at the midpoint.
import { sameSetting, settingKey, type Setting, type StartAt } from '../shared/protocol.ts';
import type { Seconds } from '../shared/units.ts';
import { counterpart, placeCrossfade, SWITCH, type CrossfadeRule, type Placed } from './alignment.ts';
import { CROSSFADE, type AudioGraph } from './audio-graph.ts';
import { Weight } from './blend.ts';
import { Lane } from './lane.ts';
import type { Mix } from './mix.ts';
import type { PianoOutput, PianoPlay } from './outputs.ts';
import type { VoiceEvent, VoicePool } from './pool.ts';
import { Rendering, renderingId, type PianoPartName } from './rendering.ts';

/**
 * How far ahead sound is scheduled. An instrument, which cannot fade and switches from one setting to
 * the next at a crossfade's midpoint, is handed over less far ahead (its own delay apart), and a
 * crossfade begins no sooner than what it has been handed: what was sent for later cannot be taken
 * back. A quarter of a second still leaves the page's thread time to stall without a key coming late.
 */
const LOOKAHEAD: Seconds = 0.6;
const INSTRUMENT_AHEAD: Seconds = 0.25;
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
/** From a start to the first sound, and from a change to its crossfade: time to schedule it. */
const START_MARGIN: Seconds = 0.06;
/** A setting rendered as you listen crossfades in as one ready does, but over as long as 1.5 s. */
const RENDERED_RULE: CrossfadeRule = { ...SWITCH, longest: CROSSFADE };
/** How long the picture blends into the next where the fader moves while paused. */
const PAUSED_BLEND: Seconds = 0.25;

export interface PlayerView {
  /** A rendering has taken over: its length, its bars. */
  adopted(rendering: Rendering): void;
  /** A short notice, or '' when all is well. */
  status(text: string): void;
  playingChanged(playing: boolean): void;
  /** Something to redraw. */
  changed(): void;
}

/** The settings ready to go to at once (library.ts). */
export interface ReadySettings {
  ready(setting: Setting): Rendering | null;
  coming(setting: Setting): boolean;
  keep(rendering: Rendering): void;
  used(rendering: Rendering): void;
}

/** A setting as it is heard at a moment: where it is, how much of it, at which mix. */
export interface Sounding {
  readonly rendering: Rendering;
  readonly t: Seconds;
  /** Its weight: 1 alone, sin and cos of a crossfade's phase between two. */
  readonly weight: number;
  readonly mix: Mix;
}

/**
 * The last crossfade, for whoever watches the page from outside: in context time, and where each
 * rendering was at its midpoint (`out` the one going out, `in` the one coming in, by their ids).
 */
export interface CrossfadeRecord extends Placed {
  readonly out: number;
  readonly in: number;
}

const SILENT: Mix = { hum: 0, harmonies: 0, piece: 0 };
const heardIn = (mix: Mix): PianoPartName[] =>
  (['piece', 'harmonies'] as const).filter((part) => mix[part] > 0);

export class Player {
  readonly #graph: AudioGraph;
  #piano: PianoOutput;
  readonly #pool: VoicePool;
  readonly #library: ReadySettings;
  readonly #view: PlayerView;
  /** Renderings that stream in from the workers, by request. */
  readonly #renders = new Map<number, Rendering>();
  #current: Rendering | null = null;
  /** The setting asked for that has not taken over yet: rendered by the workers (its request), or ready soon. */
  #pending: { readonly id: number | null; readonly setting: Setting } | null = null;
  /** The setting last asked for: the pending one's, else the current one's. */
  #wanted: Setting | null = null;
  /** The pool's request now, whose rendering is kept until it is whole or another is asked for. */
  #request: number | null = null;
  #playing = false;
  /** Playing, but stopped where the voice has not been rendered yet. */
  #waiting = false;
  /** Where the playhead is while it does not move. */
  #offset: Seconds = 0;
  /** What sounds: the last is the current rendering's. */
  #lanes: Lane[] = [];
  /** An instrument that cannot fade: what it plays, of which lane, and how far it has been handed over. */
  #instruments: { readonly lane: Lane; readonly play: PianoPlay; from: Seconds; until: number }[] = [];
  /** The mix asked for each setting: the current one's, and the one coming. */
  readonly #mixes = new Map<string, Mix>();
  /** When the pending setting was asked for (0 once timed), and how long the last ones took to be ready. */
  #askedAt = 0;
  #took: Seconds = MAX_SWITCH_LEAD;
  #last: CrossfadeRecord | null = null;
  /** While paused, the picture of the setting before blends into the next's, by the page's clock. */
  #paused: {
    readonly rendering: Rendering;
    readonly t: Seconds;
    readonly mix: Mix;
    readonly at: number;
  } | null = null;

  constructor(
    graph: AudioGraph,
    piano: PianoOutput,
    pool: VoicePool,
    library: ReadySettings,
    view: PlayerView,
  ) {
    this.#graph = graph;
    this.#piano = piano;
    this.#pool = pool;
    this.#library = library;
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

  /** Whether settings blend now: a crossfade under way, or the picture blending while paused. */
  get blending(): boolean {
    if (this.#paused) return performance.now() - this.#paused.at < PAUSED_BLEND * 1000;
    return this.moving && this.#lanes.length > 1;
  }

  /** The last crossfade, as it was placed. */
  get lastCrossfade(): CrossfadeRecord | null {
    return this.#last;
  }

  /** Whether a rendering sounds now, or is the one playing. */
  inUse(rendering: Rendering): boolean {
    return rendering === this.#current || this.#lanes.some((lane) => lane.rendering === rendering);
  }

  /** Whether a setting can take over at once (or as soon as it is decoded), without the workers. */
  canSwitch(setting: Setting): boolean {
    return this.#library.ready(setting) !== null || this.#library.coming(setting);
  }

  /** Sound the piano another way; playing goes on from where it is, after a short stop. */
  setPiano(piano: PianoOutput): void {
    const playing = this.#playing;
    if (playing) this.pause();
    this.#piano.stop();
    this.#piano = piano;
    if (playing) this.play();
  }

  /** Start the instrument afresh a little ahead, the voice going on (the part it plays has changed). */
  restartPiano(): void {
    if (this.#piano.fades) return;
    this.#piano.stop();
    this.#instruments = [];
    const lane = this.#lanes.at(-1);
    if (!lane || !this.#playing || this.#waiting) return;
    this.#startInstrument(lane, lane.at(this.position()) + this.#piano.lead + START_MARGIN);
  }

  position(): Seconds {
    const cur = this.#current;
    const lane = this.#lanes.at(-1);
    if (!cur || !this.#playing || this.#waiting || !lane) return this.#offset;
    const t = lane.position(this.#graph.context.currentTime);
    // a start is scheduled a little ahead, and until then the playhead stays where it is
    return Math.min(cur.duration, Math.max(0, lane.fresh ? Math.max(this.#offset, t) : t));
  }

  /**
   * The settings heard at the playhead, each at its own time there: `t` is where the current one is
   * drawn (carried evenly from frame to frame), the others where they are at the same moment.
   */
  sounding(t: Seconds): Sounding[] {
    const cur = this.#current;
    if (!cur) return [];
    const mix = this.#mixes.get(settingKey(cur.setting)) ?? SILENT;
    const lane = this.#lanes.at(-1);
    if (!this.moving || !lane) {
      const paused = this.#paused;
      if (!paused) return [{ rendering: cur, t, weight: 1, mix }];
      const phase = Math.min(1, (performance.now() - paused.at) / (PAUSED_BLEND * 1000));
      if (phase >= 1) this.#paused = null;
      const before = {
        rendering: paused.rendering,
        t: paused.t,
        weight: Math.cos((phase * Math.PI) / 2),
        mix: paused.mix,
      };
      return [before, { rendering: cur, t, weight: Math.sin((phase * Math.PI) / 2), mix }];
    }
    const time = lane.at(t);
    return this.#lanes.map((l) => ({
      rendering: l.rendering,
      t: l.position(time),
      weight: l.weight.at(time),
      mix: l.mix,
    }));
  }

  /** The mix asked for a setting: the lane playing it glides there; one coming in comes in at it. */
  setMix(setting: Setting, mix: Mix): void {
    const key = settingKey(setting);
    this.#mixes.set(key, mix);
    // the mixes of what sounds and of what is asked for are kept; the others are set again when asked
    const keep = new Set([key, ...this.#lanes.map((l) => settingKey(l.rendering.setting))]);
    if (this.#current) keep.add(settingKey(this.#current.setting));
    for (const k of this.#mixes.keys()) if (!keep.has(k)) this.#mixes.delete(k);
    for (const lane of this.#lanes)
      if (settingKey(lane.rendering.setting) === key && lane.weight.end === null) lane.mix = mix;
    this.#view.changed();
  }

  #mixOf(setting: Setting): Mix {
    return this.#mixes.get(settingKey(setting)) ?? SILENT;
  }

  /** The first setting: at once where it is ready, else from the workers, from the beginning. */
  begin(setting: Setting): void {
    this.#wanted = setting;
    if (!this.canSwitch(setting)) {
      this.request(setting, { seconds: 0 });
      return;
    }
    this.#pending = { id: null, setting };
    this.#maybeSwitch();
  }

  /** What sounds, what plays, and what is coming in. */
  renderings(): Rendering[] {
    const all = this.#lanes.map((lane) => lane.rendering);
    if (this.#current) all.push(this.#current);
    const pending = this.#pending?.id;
    const coming = pending === null || pending === undefined ? undefined : this.#renders.get(pending);
    if (coming) all.push(coming);
    return all;
  }

  /** Ask the workers for a setting, starting where given. */
  request(setting: Setting, start: StartAt): void {
    const id = renderingId();
    this.#pool.request(id, setting, start);
    // the piano's sound for the setting loads while the voice is prepared, not after
    this.#piano.preload?.(setting);
    this.#askedAt = performance.now();
    this.#pending = { id, setting };
    this.#wanted = setting;
    this.#request = id;
    for (const key of [...this.#renders.keys()]) if (key !== this.#current?.id) this.#renders.delete(key);
    this.#view.status('Rendering…');
  }

  /**
   * Another setting: at once where it is ready; else from a little ahead, where the playhead will
   * be when the workers have it ready.
   */
  change(setting: Setting): void {
    const cur = this.#current;
    const base = this.#wanted ?? cur?.setting;
    if (!base || sameSetting(setting, base)) return;
    if (this.canSwitch(setting)) {
      this.#pending = { id: null, setting };
      this.#wanted = setting;
      this.#maybeSwitch();
      return;
    }
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
      if (message.id === this.#request) this.#renders.set(message.id, new Rendering(message));
      return;
    }
    const rendering = this.#renders.get(message.id);
    if (!rendering) return;
    if (message.type === 'done') {
      rendering.done = true;
      // whole: the library keeps it, to go back to at once
      this.#library.keep(rendering);
      if (rendering !== this.#current) this.#renders.delete(message.id);
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
    this.#paused = null;
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
    const pending = this.#pending;
    // the voice not there yet is rendered from there; one ready soon takes over by itself
    if (!cur.rendered(t, t + 0.3) && pending?.id !== null)
      this.request(pending?.setting ?? cur.setting, pending ? { tick: cur.toTick(t) } : { seconds: t });
    this.#offset = t;
    this.#paused = null;
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
    this.#paused = null;
    this.#view.changed();
  }

  #setPlaying(playing: boolean): void {
    this.#playing = playing;
    this.#view.playingChanged(playing);
  }

  /** Stop everything: every lane, the instrument. */
  #stopAll(): void {
    for (const lane of this.#lanes) lane.stop();
    this.#lanes = [];
    this.#instruments = [];
    this.#piano.stop();
  }

  /** Start the current rendering on its own at `t`, a little ahead. */
  #startFrom(t: Seconds): void {
    const cur = this.#current;
    if (!cur) return;
    this.#stopAll();
    this.#offset = t;
    if (!this.#piano.ready(cur, heardIn(this.#mixOf(cur.setting)))) {
      // its sound is still loading: wait, as for the voice
      this.#waiting = true;
      this.#view.status('Loading the piano…');
      return;
    }
    const { context } = this.#graph;
    const begin = context.currentTime + START_MARGIN + this.#piano.lead;
    const lane = new Lane(
      this.#graph,
      cur,
      { origin: begin - t, begin, fresh: true },
      new Weight(begin, 1),
      this.#mixOf(cur.setting),
      this.#piano.fades ? this.#piano : null,
    );
    this.#lanes = [lane];
    this.#library.used(cur);
    this.#waiting = false;
    if (!this.#piano.fades) this.#startInstrument(lane, begin);
    this.#schedule();
  }

  /** The instrument plays a lane's rendering from context time `at`. */
  #startInstrument(lane: Lane, at: number): void {
    const t = lane.position(at);
    this.#instruments.push({
      lane,
      play: this.#piano.play(lane.rendering, t, at, null),
      from: t,
      until: Infinity,
    });
  }

  #schedule(): void {
    const cur = this.#current;
    if (!this.#playing || !cur || this.#waiting) return;
    const time = this.#graph.context.currentTime;
    const lead = this.#piano.lead;
    for (const lane of [...this.#lanes])
      if (lane.over(time) && lane !== this.#lanes.at(-1)) {
        lane.stop();
        this.#lanes = this.#lanes.filter((l) => l !== lane);
      } else lane.schedule(time, LOOKAHEAD, lead);
    // an instrument: the lane it plays, a little ahead, up to where the next takes over
    for (const inst of this.#instruments) {
      const until = Math.min(
        inst.lane.rendering.duration,
        inst.lane.position(time) + INSTRUMENT_AHEAD + lead,
        inst.lane.position(inst.until),
      );
      if (until > inst.from) inst.play.schedule(inst.from, until, (x) => inst.lane.at(x));
      inst.from = Math.max(inst.from, until);
    }
    this.#instruments = this.#instruments.filter(
      (inst) => inst.lane.at(inst.from) < inst.until - 1e-6 || inst === this.#instruments.at(-1),
    );
    const lane = this.#lanes.at(-1);
    if (lane?.starved(time)) {
      // the voice has not been rendered this far yet
      this.#offset = this.position();
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
      this.#piano.ready(cur, heardIn(this.#mixOf(cur.setting)))
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
    if (this.#playing || this.#paused) this.#view.changed();
  }

  /** A setting asked for takes over: one ready at once, one rendered once it has sound there. */
  #maybeSwitch(): void {
    const pending = this.#pending;
    if (!pending) return;
    const cur = this.#current;
    if (pending.id === null) {
      const next = this.#library.ready(pending.setting);
      if (!next) {
        // not decoded after all: the workers render it
        if (!this.#library.coming(pending.setting)) {
          this.#pending = null;
          this.#wanted = cur?.setting ?? null;
          this.change(pending.setting);
        }
        return;
      }
      if (!this.#piano.ready(next, heardIn(this.#mixOf(next.setting)))) {
        this.#view.status('Loading the piano…');
        return;
      }
      const t = cur ? Math.min(next.duration, counterpart(cur.clock, next.clock, this.position())) : 0;
      this.#adopt(next, t, SWITCH);
      return;
    }
    const next = this.#renders.get(pending.id);
    if (!next) return;
    // how long it took to have its first sound, and its piano: the next change leads by as much
    const { startSeconds } = next;
    const heard = heardIn(this.#mixOf(next.setting));
    if (
      this.#askedAt > 0 &&
      next.rendered(startSeconds, startSeconds + 0.4) &&
      this.#piano.ready(next, heard)
    ) {
      const took = (performance.now() - this.#askedAt) / 1000;
      this.#took = Math.min(MAX_SWITCH_LEAD, Math.max(took, SWITCH_EASE * this.#took));
      this.#askedAt = 0;
    }
    const pianoReady = (): boolean => {
      const ready = this.#piano.ready(next, heard);
      if (!ready) this.#view.status('Loading the piano…');
      return ready;
    };
    if (!cur) {
      if (next.rendered(0, 0.5) && pianoReady()) this.#adopt(next, 0, RENDERED_RULE);
      return;
    }
    let t = counterpart(cur.clock, next.clock, this.position() + START_MARGIN + this.#piano.lead);
    if (t < next.startSeconds - 0.01) {
      // not there yet: wait while the old voice plays on, take over at its start once it has stopped
      if (this.#playing && !this.#waiting) return;
      t = next.startSeconds;
    }
    if (next.rendered(t, t + 0.4) && pianoReady()) this.#adopt(next, t, RENDERED_RULE);
  }

  #adopt(next: Rendering, t: Seconds, rule: CrossfadeRule): void {
    const was = this.#current;
    this.#current = next;
    this.#pending = null;
    this.#wanted = next.setting;
    if (was && was !== next && was.id !== this.#request) this.#renders.delete(was.id);
    this.#library.used(next);
    if (this.#playing && !this.#waiting && was && was !== next && this.#lanes.length > 0)
      this.#crossfade(next, rule);
    else if (this.#playing) {
      // waiting for sound (or nothing playing to fade from): it starts here once it has some
      this.#stopAll();
      this.#offset = t;
      this.#waiting = true;
    } else {
      // paused: the picture blends into the next's
      if (was && was !== next)
        this.#paused = {
          rendering: was,
          t: this.#offset,
          mix: this.#mixOf(was.setting),
          at: performance.now(),
        };
      this.#offset = t;
    }
    this.#view.status('');
    this.#view.adopted(next);
    this.#view.changed();
  }

  /**
   * Crossfade from what sounds into `next`: every lane fades out from where it is, while `next`
   * comes in, at the same tick as the current one at the midpoint.
   */
  #crossfade(next: Rendering, rule: CrossfadeRule): void {
    const lane = this.#lanes.at(-1);
    if (!lane) return;
    const { context } = this.#graph;
    let at = context.currentTime + START_MARGIN + this.#piano.lead;
    // an instrument switches at the midpoint, after all it has been handed over
    const inst = this.#instruments.at(-1);
    if (inst) at = Math.max(at, inst.lane.at(inst.from));
    const fade = placeCrossfade(lane.rendering.clock, lane.origin, next.clock, at, rule);
    const { mid } = fade;
    for (const l of this.#lanes) l.fadeOut(at, fade.length);
    const incoming = new Lane(
      this.#graph,
      next,
      { origin: fade.origin, begin: at, fresh: false },
      Weight.fadingIn(at, fade.length),
      this.#mixOf(next.setting),
      this.#piano.fades ? this.#piano : null,
    );
    this.#lanes.push(incoming);
    if (inst) {
      // the old one handed over up to the midpoint, its keys let up there; the new one from there
      inst.until = mid;
      const until = inst.lane.position(mid);
      if (until > inst.from) inst.play.schedule(inst.from, until, (x) => inst.lane.at(x));
      inst.from = Math.max(inst.from, until);
      inst.play.stop(mid);
      this.#startInstrument(incoming, mid);
    }
    this.#last = { ...fade, out: lane.rendering.id, in: next.id };
    this.#schedule();
  }
}
