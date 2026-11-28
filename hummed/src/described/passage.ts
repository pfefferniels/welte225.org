// A passage of the piece played alone: a stretch of the score between two ticks, at a level of
// elaboration, with the site's piano and inner voice, and, where asked, with instructions of the MPM
// brought out in it (shared/emphasis.ts). A remark on the page plays the passage it is about.
//
// A passage sounds as a setting of the front page does (page/lane.ts): its voice and the piano's
// parts at the levels the table has there, into the same room. With nothing brought out, at a
// setting rendered ahead, it is a stretch of that recording (voice/), found through the plan's clock
// and there at once. Anything else the workers render, the passage and no more (a plan that ends,
// shared/protocol.ts), and it plays as soon as its first sound has come. An MPM brought out goes at
// other tempi, so such a rendering has a clock of its own, through which its passage is placed.
// The piano is the front page's own (page/outputs.ts): a setting's Pianoteq recording where there is
// one of the performance as it is and nothing is brought out, else the sampled grand.
//
// One passage is kept at a time: the recording decoded last, the passage rendered last, and in the
// worker that prepares them one setting (some 27 MB). Asking for another lets go of them.
import { createAudioGraph, type AudioGraph } from '../page/audio-graph.ts';
import { Weight } from '../page/blend.ts';
import { Lane } from '../page/lane.ts';
import { mix as mixAt, voiceElaboration, type Mix } from '../page/mix.ts';
import { BuiltInPiano, type PianoOutput } from '../page/outputs.ts';
import { PianoSampler } from '../page/piano.ts';
import { VoicePool, workerCount, type VoiceEvent } from '../page/pool.ts';
import { Recordings } from '../page/recordings.ts';
import { Rendering, renderingId, type PianoPartName } from '../page/rendering.ts';
import { marginOf } from '../page/timeline.ts';
import { readReduction } from '../reduction/mei.ts';
import { emphasisKey, emphasisOf } from '../shared/emphasis.ts';
import { clip } from '../shared/math.ts';
import { ELABORATION } from '../shared/shape.ts';
import {
  plain,
  settingKey,
  VOICE_WORKER,
  type NotesAnswer,
  type NotesRequest,
  type Setting,
} from '../shared/protocol.ts';
import type { Seconds, Ticks } from '../shared/units.ts';
import {
  findLead,
  ofThisTable,
  parsePlan,
  parseVoiceManifest,
  VOICE_DIRECTORY,
  type VoiceManifest,
} from '../shared/voice-recordings.ts';

/**
 * Instructions to bring out: their xml:ids in performance.mpm, how far (1 to 1.9), and how much is
 * left of everything else ((0, 1]).
 */
export interface Emphasis {
  ids: readonly string[];
  factor: number;
  attenuation: number;
}

/** A passage in ticks of the score, `to` exclusive, at an elaboration from 0 to 1. */
export interface PassageRequest {
  from: number;
  to: number;
  elaboration: number;
  emphasis?: Emphasis | undefined;
}

export interface PassageListeners {
  /** Where the playhead is in the score, in every frame while the passage plays. */
  onTick?(tick: number): void;
  onState?(state: 'preparing' | 'playing' | 'stopped'): void;
}

/** A note as espressivo performs it, in ms on the rendering's own clock. */
export interface PerformedNote {
  on: number;
  off: number;
  velocity: number;
}

export interface PassagePlayer {
  /**
   * Play a passage; a new one stops the one before. Resolves when its sound starts, or when it was
   * stopped before it could; rejects where it cannot be played.
   */
  play(request: PassageRequest, listeners?: PassageListeners): Promise<void>;
  stop(): void;
  /** The whole piece as espressivo performs the MPM, as it is or brought out, by note id. */
  notes(emphasis?: Emphasis): Promise<ReadonlyMap<string, PerformedNote>>;
  /** To be called from a user gesture: opens the audio, and loads what a passage will need. */
  unlock(): void;
}

type State = 'preparing' | 'playing' | 'stopped';

/**
 * How far ahead sound is handed to the audio graph, and how far ahead of the clock a passage
 * starts: as the front page's transport has them (page/player.ts).
 */
const LOOKAHEAD: Seconds = 2;
const START_MARGIN: Seconds = 0.06;
/** How often what falls due is handed over. */
const HAND_EVERY_MS = 50;
/**
 * A passage's sound begins this much of the score before its first tick (a twenty-fourth of a
 * quarter: some 40 ms at Grünfeld's tempo) and fades in up to it: what is struck on that tick is
 * struck whole, over what rang on from before.
 */
export const LEAD: Ticks = 30;
/**
 * It fades out over this long up to its end, so that nothing struck at the tick after it is heard,
 * whichever piano plays; the room rings on.
 */
const FADE_OUT: Seconds = 0.12;
/** How long after its end a passage counts as playing: the room's tail, while it is heard well. */
const TAIL: Seconds = 0.4;
/** How fast a passage that is stopped goes out, and the room after it. */
const STOP_FADE: Seconds = 0.03;
const ROOM_FADE: Seconds = 0.08;
/** A passage that goes on after waiting for its sound fades in over this long. */
const RESUME_FADE: Seconds = 0.02;
/** How much of a passage rendered as you listen has to be there before it plays. */
const FIRST_SOUND: Seconds = 0.4;
/** How much faster than it plays a passage has to be rendered to play while the rest of it comes. */
const PACE = 1.15;
/**
 * The workers that render: the first prepares a setting with the help of the next two
 * (page/pool.ts), and renders the passage by itself.
 */
const WORKERS = 3;
/** How many performances of the piece are kept for drawing, beside the piece as it is: a slider's worth. */
const NOTES_KEPT = 12;
/** The setting of the table's last point: the piece as Grünfeld plays it, which a page plays first. */
const PIECE = voiceElaboration(ELABORATION.points[ELABORATION.points.length - 1]);

/** A passage in a rendering's time: where its sound begins, its first tick, and its end. */
export interface Stretch {
  readonly begin: Seconds;
  readonly from: Seconds;
  readonly to: Seconds;
}

/** A passage placed through a rendering's clock. */
export function stretchOf(rendering: Pick<Rendering, 'toSeconds'>, from: Ticks, to: Ticks): Stretch {
  const first = rendering.toSeconds(from);
  return {
    begin: Math.min(first, rendering.toSeconds(from - LEAD)),
    from: first,
    to: Math.max(first, rendering.toSeconds(to)),
  };
}

const heardIn = (mix: Mix): PianoPartName[] =>
  (['piece', 'harmonies'] as const).filter((part) => mix[part] > 0);

/**
 * A passage as it sounds: the rendering on a lane of its own that begins at context time `at`, at
 * the rendering's time `from` (the passage's beginning, or where it goes on after waiting for
 * sound), fades in up to the passage's first tick, and is gone at its end. What is handed to the
 * audio graph is the lane's to say (`schedule`): no further than it is heard.
 */
export function laneOf(
  graph: AudioGraph,
  rendering: Rendering,
  stretch: Stretch,
  mix: Mix,
  piano: PianoOutput,
  at: number,
  from: Seconds = stretch.begin,
): Lane {
  const fadeIn = from < stretch.from ? stretch.from - from : from > stretch.begin ? RESUME_FADE : 0;
  const lane = new Lane(
    graph,
    rendering,
    { origin: at - from, begin: at, fresh: true },
    fadeIn > 0 ? Weight.fadingIn(at, fadeIn) : new Weight(at, 1),
    mix,
    piano,
  );
  const fadeOut = clip((stretch.to - from) / 2, 0.005, FADE_OUT);
  lane.fadeOut(lane.at(stretch.to) - fadeOut, fadeOut);
  return lane;
}

/**
 * Whether a rendering can play from `t` to `to` now: all of it has come, or its first sound has and
 * the rest comes fast enough; rendered more slowly than it plays, it has to be as far ahead as it
 * will fall behind.
 */
export function canPlay(rendering: Rendering, t: Seconds, to: Seconds): boolean {
  if (rendering.rendered(t, to)) return true;
  const there = Math.min(to - t, rendering.aheadOf(t));
  return there >= FIRST_SOUND && there >= (to - t) * (1 - Math.min(1, rendering.speed() / PACE));
}

/**
 * The context time of what is heard now: the clock as the sound card has come to it, carried on by
 * the page's own clock, so that a playhead moves evenly and with the sound; the context's time
 * where the browser does not say.
 */
function heardTime(context: AudioContext): number {
  const { contextTime, performanceTime } = context.getOutputTimestamp();
  if (!contextTime || !performanceTime) return context.currentTime;
  return Math.min(context.currentTime, contextTime + (performance.now() - performanceTime) / 1000);
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function get(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
}

/** What sounds: the audio graph and the piano, once a gesture has opened them. */
interface Stage {
  readonly graph: AudioGraph;
  readonly piano: BuiltInPiano;
  /** The Pianoteq recordings, once it is known whether there are any. */
  recordings: Recordings | null;
  known: boolean;
  /** Why the sampled grand cannot play, where its samples did not load. */
  failed: unknown;
}

/** The workers that render what was not rendered ahead. */
interface Voices {
  readonly pool: VoicePool;
  /** Why they cannot render, once they cannot. */
  failed: string | null;
}

/** A setting rendered ahead, decoded: the last one asked for. */
interface Recorded {
  readonly elaboration: number;
  readonly loading: Promise<Rendering | null>;
  /** The rendering once it is decoded; null while it is not, and where there is none. */
  rendering: Rendering | null;
}

/** A passage the workers render, or have rendered: the last one asked for. */
interface Live {
  /** The setting and the stretch. */
  readonly key: string;
  readonly id: number;
  readonly voices: Voices;
  /** The rendering, once the plan has come: its sound streams in. */
  rendering: Rendering | null;
}

/** A passage that was asked for, until it is over. */
interface Playing {
  readonly from: Ticks;
  readonly to: Ticks;
  readonly setting: Setting;
  readonly listeners: PassageListeners;
  state: State | null;
  /** Stopped, or over: nothing more is done for it. */
  over: boolean;
  lane: Lane | null;
  /** What runs for it: timers, frames. */
  readonly running: (() => void)[];
}

class Passages implements PassagePlayer {
  /** Where the front page's files lie (hummed/). */
  readonly #base: string;
  #stage: Stage | null = null;
  #voices: Voices | null = null;
  #manifest: Promise<VoiceManifest | null> | null = null;
  #recorded: Recorded | null = null;
  #live: Live | null = null;
  #playing: Playing | null = null;
  /** Whether a stop has taken the room down with the passage: the next brings it back. */
  #hushed = false;
  /** Whoever waits for something to come: a plan, sound, a stop. */
  readonly #waiting = new Set<() => void>();
  /**
   * The worker that performs the piece for drawing; what is asked of it, of which it is sent one at
   * a time, the last asked first (a slider asks faster than it performs, and wants the latest); and
   * the performances kept.
   */
  #performer: Worker | null = null;
  readonly #asked = new Map<
    number,
    { resolve: (notes: ReadonlyMap<string, PerformedNote>) => void; reject: (error: Error) => void }
  >();
  readonly #toPerform: NotesRequest[] = [];
  #performing = false;
  readonly #notes = new Map<string, Promise<ReadonlyMap<string, PerformedNote>>>();
  #lastAsked = 0;

  constructor(base: string) {
    this.#base = base;
  }

  unlock(): void {
    void this.#open().graph.context.resume();
    // what a passage will need, meanwhile: the workers load VocalTractLab, and the recording of the
    // piece is decoded
    this.#workers();
    if (!this.#recorded) this.#decoded(PIECE);
  }

  async play(request: PassageRequest, listeners: PassageListeners = {}): Promise<void> {
    const { from, to } = request;
    if (!(to > from) || !Number.isFinite(to - from) || !Number.isFinite(request.elaboration))
      throw new RangeError('a passage runs from a tick to a later one, at an elaboration from 0 to 1');
    this.#end();
    const stage = this.#open();
    // within the gesture that asked for it
    void stage.graph.context.resume();
    const elaboration = voiceElaboration(request.elaboration);
    const emphasis = emphasisOf(request.emphasis);
    const playing: Playing = {
      from,
      to,
      setting: emphasis ? { elaboration, emphasis } : { elaboration },
      listeners,
      state: null,
      over: false,
      lane: null,
      running: [],
    };
    this.#playing = playing;
    try {
      const rendering = await this.#prepared(playing, stage);
      if (rendering) this.#start(playing, stage, rendering, stretchOf(rendering, from, to).begin);
    } catch (error) {
      this.#over(playing);
      throw error;
    }
  }

  stop(): void {
    this.#end();
    // nothing more is rendered of a passage nobody hears; one that is whole stays, to be heard again
    if (!this.#live?.rendering?.done) this.#abandon();
    const graph = this.#stage?.graph;
    if (!graph) return;
    // the room with it: its tail would ring on for a second
    const { gain } = graph.master;
    const at = graph.context.currentTime + marginOf(graph.context);
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(gain.value, at);
    gain.linearRampToValueAtTime(0, at + ROOM_FADE);
    this.#hushed = true;
  }

  notes(emphasis?: Emphasis): Promise<ReadonlyMap<string, PerformedNote>> {
    const asked = emphasisOf(emphasis);
    const key = asked ? emphasisKey(asked) : '';
    let notes = this.#notes.get(key);
    // asked for again, it is the last to be let go of
    this.#notes.delete(key);
    if (!notes) {
      const request: NotesRequest = {
        type: 'notes',
        id: ++this.#lastAsked,
        ...(asked && { emphasis: asked }),
      };
      const performed = new Promise<ReadonlyMap<string, PerformedNote>>((resolve, reject) => {
        this.#asked.set(request.id, { resolve, reject });
        this.#toPerform.push(request);
        this.#perform();
      });
      // one that failed is asked for anew
      performed.catch(() => {
        if (this.#notes.get(key) === performed) this.#notes.delete(key);
      });
      notes = performed;
    }
    this.#notes.set(key, notes);
    // the piece as it is stays; of those brought out, the ones asked for last
    for (const other of [...this.#notes.keys()])
      if (this.#notes.size > NOTES_KEPT + 1 && other !== '' && other !== key) this.#notes.delete(other);
    return notes;
  }

  /** The audio graph and the piano; the first ask makes them (the context sounds once a gesture resumes it). */
  #open(): Stage {
    if (this.#stage) return this.#stage;
    const graph = createAudioGraph();
    const sampler = new PianoSampler(
      graph.context,
      (error) => {
        stage.failed = error;
      },
      this.#base,
    );
    const stage: Stage = {
      graph,
      piano: new BuiltInPiano(sampler),
      recordings: null,
      known: false,
      failed: null,
    };
    this.#stage = stage;
    Recordings.load(graph.context, this.#base)
      .then(
        (recordings) => {
          stage.recordings = recordings;
          stage.piano.recordings = recordings;
        },
        (error: unknown) => {
          console.warn('The Pianoteq recordings could not be read; the sampled grand plays.', error);
        },
      )
      .finally(() => {
        stage.known = true;
        this.#woken();
      });
    // the sampled grand plays wherever no recording does: its samples load now
    sampler.ready();
    return stage;
  }

  /** The workers; the first ask starts them, and they load what they need at once. */
  #workers(): Voices {
    if (this.#voices) return this.#voices;
    const failed = (reason: string): void => {
      voices.failed = reason;
      if (this.#voices === voices) this.#voices = null;
      this.#woken();
    };
    const voices: Voices = {
      pool: new VoicePool(
        Math.min(WORKERS, workerCount()),
        (event) => {
          if (event.type === 'error') failed(event.message);
          else this.#came(event);
        },
        () => {
          const worker = new Worker(`${this.#base}worker.js`, { name: VOICE_WORKER });
          worker.addEventListener('error', (event) => {
            failed(event.message || 'a voice worker could not start');
          });
          return worker;
        },
      ),
      failed: null,
    };
    this.#voices = voices;
    // what is hummed, as the front page reads it; the first worker keeps one prepared setting
    get(`${this.#base}reduction/reduction.mei`)
      .then((response) => response.text())
      .then((mei) => {
        const reduction = new DOMParser().parseFromString(mei, 'application/xml');
        voices.pool.setup(readReduction(reduction.documentElement), 'melodic', 1);
      })
      .catch((error: unknown) => {
        failed(messageOf(error));
      });
    return voices;
  }

  /** What the workers send of the passage they render. */
  #came(event: Exclude<VoiceEvent, { readonly type: 'error' }>): void {
    const live = this.#live;
    if (live?.id !== event.id) return;
    if (event.type === 'plan') live.rendering = new Rendering(event);
    // its picture is not drawn here
    else if (event.type === 'audio') live.rendering?.receive({ ...event, spectrogram: null });
    else if (live.rendering) live.rendering.done = true;
    this.#woken();
  }

  #woken(): void {
    for (const wake of [...this.#waiting]) wake();
  }

  /** Wait until something comes, or a moment at the most (what loads without a word: the piano's samples). */
  #pause(): Promise<void> {
    return new Promise((resolve) => {
      const wake = (): void => {
        clearTimeout(timer);
        this.#waiting.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, 30);
      this.#waiting.add(wake);
    });
  }

  /** The voices rendered ahead, if there are any of the table the page has. */
  #voiceManifest(): Promise<VoiceManifest | null> {
    this.#manifest ??= get(`${this.#base}${VOICE_DIRECTORY}manifest.json`)
      .then(async (response) => {
        const manifest = parseVoiceManifest(await response.json());
        return manifest && ofThisTable(manifest) ? manifest : null;
      })
      .catch((error: unknown) => {
        console.warn('The voice rendered ahead could not be read; it is rendered as you listen.', error);
        return null;
      });
    return this.#manifest;
  }

  /**
   * A setting rendered ahead, decoded as the front page decodes it (page/library.ts): at the rate it
   * was rendered at, the rendering's first sample found in the decoded sound. Null where there is
   * none, or it does not load: the workers render the passage then.
   */
  async #decode(elaboration: number): Promise<Rendering | null> {
    const manifest = await this.#voiceManifest();
    const voice = manifest?.settings.find(
      (s) => Math.round(s.elaboration * 100) === Math.round(elaboration * 100),
    );
    if (!manifest || !voice) return null;
    try {
      const directory = this.#base + VOICE_DIRECTORY;
      const [sound, plan] = await Promise.all([
        get(directory + voice.file).then((response) => response.arrayBuffer()),
        get(directory + voice.plan).then((response) => response.json() as Promise<unknown>),
      ]);
      const whole = await new OfflineAudioContext(1, 1, manifest.sampleRate).decodeAudioData(sound);
      const measured = voice.align['lead'];
      const lead =
        findLead(whole.getChannelData(0), voice)?.lead ??
        (typeof measured === 'number' ? Math.round(measured) : 0);
      return new Rendering(
        { ...parsePlan(plan), id: renderingId(), startSeconds: 0, startState: 0 },
        whole,
        `recorded:${voice.file}`,
        lead,
      );
    } catch (error) {
      console.warn(`The voice rendered ahead at ${elaboration} did not load; it is rendered.`, error);
      return null;
    }
  }

  /** The recording of a setting, decoded; another setting's is let go of. */
  #decoded(elaboration: number): Recorded {
    if (this.#recorded?.elaboration === elaboration) return this.#recorded;
    const recorded: Recorded = { elaboration, loading: this.#decode(elaboration), rendering: null };
    void recorded.loading.then((rendering) => {
      recorded.rendering = rendering;
    });
    this.#recorded = recorded;
    return recorded;
  }

  /** Let go of the passage the workers rendered, and have them stop if they are still at it. */
  #abandon(): void {
    const live = this.#live;
    if (!live) return;
    this.#live = null;
    if (!live.rendering?.done) this.#voices?.pool.stop(renderingId());
  }

  /**
   * The rendering a passage plays from, once it can: the recording of its setting, or what the
   * workers render of it, with enough of its sound there and its piano ready. Null where the
   * passage was stopped meanwhile.
   */
  async #prepared(playing: Playing, stage: Stage): Promise<Rendering | null> {
    const { setting, from, to } = playing;
    const heard = heardIn(mixAt(setting.elaboration));
    const key = `${settingKey(setting)} ${from} ${to}`;
    const ready = (rendering: Rendering): boolean => {
      const stretch = stretchOf(rendering, from, to);
      if (!stage.known || !canPlay(rendering, stretch.begin, stretch.to)) return false;
      if (!stage.piano.ready(rendering, heard)) {
        const { failed } = stage;
        stage.failed = null;
        if (failed) throw new Error(`the piano's samples did not load: ${messageOf(failed)}`);
        return false;
      }
      // a context no gesture has resumed yet does not sound
      return stage.graph.context.state === 'running';
    };
    // the same passage as the workers rendered last: what has come of it is there
    let live = this.#live?.key === key ? this.#live : null;
    if (!live) this.#abandon();
    const recorded = !live && plain(setting) ? this.#decoded(setting.elaboration) : null;
    let rendering = live?.rendering ?? recorded?.rendering ?? null;
    if (rendering && ready(rendering)) return rendering;
    this.#state(playing, 'preparing');
    rendering ??= (await recorded?.loading) ?? null;
    while (!playing.over) {
      // neither rendered ahead nor on its way: the workers render it, from a little before it
      if (!rendering && !live) {
        live = { key, id: renderingId(), voices: this.#workers(), rendering: null };
        this.#live = live;
        live.voices.pool.request(live.id, setting, { tick: from - LEAD }, { tick: to });
      }
      rendering ??= live?.rendering ?? null;
      if (rendering && ready(rendering)) return rendering;
      if (live) this.#stillRendered(live);
      await this.#pause();
    }
    return null;
  }

  /** That the workers are still there for a passage they render; else it is let go of, and why is said. */
  #stillRendered(live: Live): void {
    const { failed } = live.voices;
    if (failed === null || live.rendering?.done) return;
    if (this.#live === live) this.#live = null;
    throw new Error(`the voice could not be rendered: ${failed}`);
  }

  /** Start a passage's sound a little ahead, from the rendering's time `t`, and say where it is while it plays. */
  #start(playing: Playing, stage: Stage, rendering: Rendering, t: Seconds): void {
    const { graph } = stage;
    const { context } = graph;
    const { from, to, listeners } = playing;
    const stretch = stretchOf(rendering, from, to);
    const begin = context.currentTime + START_MARGIN;
    if (this.#hushed) {
      // the room, back from where a stop left it
      const { gain } = graph.master;
      gain.cancelScheduledValues(context.currentTime);
      gain.setValueAtTime(gain.value, context.currentTime);
      gain.linearRampToValueAtTime(1, begin);
      this.#hushed = false;
    }
    // one setting's recordings of the piano are kept decoded
    stage.recordings?.keep([playing.setting.elaboration]);
    const lane = laneOf(graph, rendering, stretch, mixAt(playing.setting.elaboration), stage.piano, begin, t);
    const end = lane.at(stretch.to);
    playing.lane = lane;
    const hand = (): void => {
      const time = context.currentTime;
      lane.schedule(time, LOOKAHEAD, 0);
      if (time >= end) this.#finish(playing, lane, end);
      else if (time < end - FADE_OUT && lane.starved(time)) this.#wait(playing, stage, rendering, lane);
    };
    const timer = setInterval(hand, HAND_EVERY_MS);
    let frame = 0;
    const follow = (): void => {
      frame = requestAnimationFrame(follow);
      const at = lane.position(heardTime(context));
      if (at < stretch.to) listeners.onTick?.(clip(rendering.toTick(at), from, to));
    };
    playing.running.push(() => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
    });
    hand();
    this.#state(playing, 'playing');
    // unless whoever listens has stopped it at the word
    if (playing.lane === lane && listeners.onTick) follow();
  }

  /** The passage has come to its end: its sound is gone, the room rings on a little, then it is over. */
  #finish(playing: Playing, lane: Lane, end: number): void {
    this.#rest(playing);
    lane.stop(end + STOP_FADE);
    playing.lane = null;
    playing.listeners.onTick?.(playing.to);
    const timer = setTimeout(() => {
      this.#over(playing);
    }, TAIL * 1000);
    playing.running.push(() => {
      clearTimeout(timer);
    });
  }

  /**
   * The sound has not come as far as the passage has played (the workers are slower than it plays):
   * it stops there, and goes on from there once enough has come.
   */
  #wait(playing: Playing, stage: Stage, rendering: Rendering, lane: Lane): void {
    const t = lane.position(stage.graph.context.currentTime);
    this.#rest(playing);
    this.#quiet(lane, stage.graph.context);
    playing.lane = null;
    this.#state(playing, 'preparing');
    const resume = async (): Promise<void> => {
      const { to } = stretchOf(rendering, playing.from, playing.to);
      while (!playing.over && !canPlay(rendering, t, to)) {
        const live = this.#live;
        if (live?.rendering === rendering) this.#stillRendered(live);
        await this.#pause();
      }
      if (!playing.over) this.#start(playing, stage, rendering, t);
    };
    resume().catch((error: unknown) => {
      console.warn('The passage could not go on.', error);
      this.#over(playing);
    });
  }

  /** Stop what runs for a passage: its timers and frames. */
  #rest(playing: Playing): void {
    for (const stop of playing.running.splice(0)) stop();
  }

  #state(playing: Playing, state: State): void {
    if (playing.state === state) return;
    playing.state = state;
    playing.listeners.onState?.(state);
  }

  /** A passage is over: by itself, stopped, or failed. */
  #over(playing: Playing): void {
    if (playing.over) return;
    playing.over = true;
    this.#rest(playing);
    if (this.#playing === playing) this.#playing = null;
    this.#state(playing, 'stopped');
    // whoever prepares it gives up
    this.#woken();
  }

  /** Take a lane's sound out at once, without a click. */
  #quiet(lane: Lane, context: AudioContext): void {
    const at = context.currentTime + marginOf(context);
    lane.fadeOut(at, STOP_FADE);
    lane.stop(at + STOP_FADE + 0.01);
  }

  /** Stop the passage that plays or is prepared. */
  #end(): void {
    const playing = this.#playing;
    if (!playing) return;
    const context = this.#stage?.graph.context;
    if (playing.lane && context) this.#quiet(playing.lane, context);
    playing.lane = null;
    this.#over(playing);
  }

  /** Send the worker the performance asked for last, once it is free. */
  #perform(): void {
    if (this.#performing) return;
    const request = this.#toPerform.pop();
    if (!request) return;
    this.#performing = true;
    try {
      this.#performerOf().postMessage(request);
    } catch (error) {
      this.#unperformed(messageOf(error));
    }
  }

  /** Nothing asked for is performed: the worker is gone, or cannot be started. */
  #unperformed(reason: string): void {
    this.#performer?.terminate();
    this.#performer = null;
    this.#performing = false;
    this.#toPerform.length = 0;
    for (const [id, asked] of [...this.#asked]) {
      this.#asked.delete(id);
      asked.reject(new Error(reason));
    }
  }

  /** The worker that performs the piece for drawing: one that loads the score and the MPM alone. */
  #performerOf(): Worker {
    if (this.#performer) return this.#performer;
    const worker = new Worker(`${this.#base}worker.js`);
    worker.onmessage = ({ data }: MessageEvent<NotesAnswer>) => {
      const asked = this.#asked.get(data.id);
      this.#asked.delete(data.id);
      if (data.type === 'notes') asked?.resolve(new Map(data.notes));
      else asked?.reject(new Error(data.message));
      this.#performing = false;
      this.#perform();
    };
    worker.onerror = (event) => {
      if (this.#performer === worker)
        this.#unperformed(event.message || 'the worker that performs the piece could not start');
    };
    this.#performer = worker;
    return worker;
  }
}

/**
 * The player of passages. The front page's files are where the site has them, in /hummed/ (as its
 * own page names them, `<base href="/hummed/">`), whichever page this is on.
 */
export function createPassagePlayer(): PassagePlayer {
  return new Passages(new URL('/hummed/', location.href).href);
}
