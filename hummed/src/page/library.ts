// The settings the page has ready: each one whole, so that the fader can go to it at once and the
// page crossfade into it without waiting. A setting is ready when its voice was rendered ahead
// (voice/, `npm run voices`, of the table the page has) and is decoded here, or when the workers
// have rendered it whole as the visitor listened. The compressed files are fetched ahead; decoded
// are the setting the fader is at and its neighbours, more of them on the side it travels to, as far
// as a memory budget allows; beyond that the settings heard last are kept, and the one heard longest
// ago goes first.
import { settingKey, type Setting } from '../shared/protocol.ts';
import { SAMPLE_RATE } from '../shared/units.ts';
import {
  findLead,
  ofThisTable,
  parsePlan,
  parseVoiceManifest,
  VOICE_DIRECTORY,
  type RecordedVoice,
  type VoiceManifest,
} from '../shared/voice-recordings.ts';
import { Rendering, renderingId } from './rendering.ts';

const MB = 1024 * 1024;

/**
 * The budget for what is decoded: the voices, the piano's recordings of them, their pictures. A
 * second of a setting takes 172 kB of voice (mono, 32-bit, 44.1 kHz), as much again for the part of
 * the piano heard (188 kB at 48 kHz), and 141 kB for each of its two pictures in the spectrogram
 * (100 columns of 360 rows, 4 bytes a pixel): the longest setting (the piece struck again on every
 * sixteenth, 3:55) takes 147 MB, the shortest (the half notes, 1:12) 45 MB. With 640 MB a computer
 * keeps the setting playing and three around it where they are long, thirteen where they are short;
 * its browser holds that easily (the voice's workers hold some 110 MB of their own, and the page
 * held up to 300 MB before, a rendering, its pictures and two settings' recordings). Where memory is
 * 4 GB, half of that. A phone's browser closes a page that holds much more than 200 to 300 MB, and
 * the workers may have to render there too: with 192 MB it keeps the setting playing and, where they
 * are short, the next three on the side the fader goes to; where they are long, only the one
 * playing, and the next is rendered.
 */
export function budget(memory: number | undefined, phone: boolean): number {
  if (phone || (memory !== undefined && memory < 4)) return 192 * MB;
  if (memory !== undefined && memory < 8) return 320 * MB;
  return 640 * MB;
}

/** What a second of a setting costs decoded: its voice, its piano's part heard, its two pictures. */
export const bytesPerSecond = (pianoRate: number): number =>
  SAMPLE_RATE * 4 + pianoRate * 4 + 2 * 100 * 360 * 4;

/** How far to either side of the fader settings are decoded: more on the side it travels to. */
export const AHEAD = 3;
export const BEHIND = 2;

/**
 * The settings in the order they are wanted: the fader's own, then its neighbours among `rendered`
 * outward, the one next on the side it travels to before the one behind, up to `AHEAD` ahead and
 * `BEHIND` behind. Not travelling, it is as if it went up. `also` (where wandering goes next)
 * comes after the nearest two.
 */
export function wanted(
  rendered: readonly number[],
  at: number,
  direction: 1 | -1 | 0,
  also: readonly number[] = [],
): number[] {
  const i = rendered.reduce((best, e, k) => (Math.abs(e - at) < Math.abs(rendered[best] - at) ? k : best), 0);
  const d = direction === 0 ? 1 : direction;
  const order = [i];
  for (let k = 1; k <= Math.max(AHEAD, BEHIND); k++) {
    if (k <= AHEAD) order.push(i + d * k);
    if (k <= BEHIND) order.push(i - d * k);
    if (k === 1) for (const e of also) order.push(rendered.indexOf(e));
  }
  const seen = new Set<number>();
  return order
    .filter((k) => k >= 0 && k < rendered.length && !seen.has(k) && (seen.add(k), true))
    .map((k) => rendered[k]);
}

/** One setting the library holds or could: what it costs decoded, and when it was last heard. */
export interface Held {
  readonly key: string;
  readonly bytes: number;
  readonly lastUsed: number;
}

/**
 * Which to keep: those in use, always; then the wanted, in their order, as far as the budget goes
 * (the first of them whatever it costs); then the others, the one heard last first, while they fit.
 */
export function kept(
  held: readonly Held[],
  order: readonly string[],
  inUse: ReadonlySet<string>,
  limit: number,
): Set<string> {
  const byKey = new Map(held.map((h) => [h.key, h]));
  const keep = new Set<string>();
  let total = 0;
  const take = (key: string, always: boolean): void => {
    const h = byKey.get(key);
    if (!h || keep.has(key)) return;
    if (!always && total + h.bytes > limit) return;
    keep.add(key);
    total += h.bytes;
  };
  for (const key of inUse) take(key, true);
  order.forEach((key, i) => {
    take(key, i === 0);
  });
  for (const h of [...held].sort((a, b) => b.lastUsed - a.lastUsed)) take(h.key, false);
  return keep;
}

/** A setting rendered ahead, as the library holds it. */
interface Recorded {
  readonly voice: RecordedVoice;
  /** The compressed sound and the plan, once fetched. */
  sound: ArrayBuffer | null;
  /** What tells its sound from another's: settings whose voice is the same (0.9 to 1) share one. */
  same: string;
  plan: unknown;
  fetching: Promise<void> | null;
  /** The rendering, once decoded. */
  rendering: Rendering | null;
  decoding: boolean;
  failed: boolean;
  lastUsed: number;
}

/** A compressed sound told from others by its length and a hash of its bytes (FNV-1a). */
function sameness(sound: ArrayBuffer): string {
  const bytes = new Uint8Array(sound);
  let h = 0x811c9dc5;
  for (const byte of bytes) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${bytes.length}:${h.toString(16)}`;
}

/** A text told from others by its length and a hash of its characters (FNV-1a). */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length}:${h.toString(16)}`;
}

const keyOf = (elaboration: number): string =>
  settingKey({ elaboration: Math.round(elaboration * 100) / 100 });

export interface LibraryOptions {
  /** What else a rendering costs decoded beside its voice: its piano's buffers, its pictures. */
  readonly besides: (rendering: Rendering) => number;
  /** Whether a rendering sounds now, or is the one playing: never let go of. */
  readonly inUse: (rendering: Rendering) => boolean;
  /** Something has become ready, or gone. */
  readonly changed: () => void;
  /** A setting that is let go of: what is kept for it elsewhere goes too. */
  readonly dropped: (rendering: Rendering) => void;
  readonly limit: number;
  /** What a second costs, before a setting is decoded and its cost is known. */
  readonly perSecond: number;
  /** Whether to fetch every setting's files ahead (a computer), or only those around the fader (a phone). */
  readonly fetchAll: boolean;
}

export class Library {
  readonly #options: LibraryOptions;
  /** The voices rendered ahead, of this table; none where there are none, or of another. */
  readonly #recorded = new Map<string, Recorded>();
  readonly #sampleRate: number = SAMPLE_RATE;
  /** Renderings that the workers rendered whole, by setting. */
  readonly #live = new Map<string, { readonly rendering: Rendering; lastUsed: number }>();
  /** The order settings are wanted in, by key: the fader's first. */
  #order: string[] = [];
  #decodingNow = false;
  #clock = 0;

  constructor(manifest: VoiceManifest | null, options: LibraryOptions) {
    this.#options = options;
    if (!manifest) return;
    this.#sampleRate = manifest.sampleRate;
    for (const voice of manifest.settings)
      this.#recorded.set(keyOf(voice.elaboration), {
        voice,
        sound: null,
        same: '',
        plan: null,
        fetching: null,
        rendering: null,
        decoding: false,
        failed: false,
        lastUsed: 0,
      });
  }

  /** The manifest of the voices rendered ahead, if there are any of the table the page has. */
  static async manifest(): Promise<VoiceManifest | null> {
    const response = await fetch(`${VOICE_DIRECTORY}manifest.json`);
    if (!response.ok) return null;
    const manifest = parseVoiceManifest(await response.json());
    if (manifest && !ofThisTable(manifest)) {
      console.warn('The voice rendered ahead is of another table of points: it is rendered as you listen.');
      return null;
    }
    return manifest;
  }

  /** The setting, whole, if it is ready: rendered ahead and decoded, or rendered whole here. */
  ready(setting: Setting): Rendering | null {
    const key = settingKey(setting);
    const recorded = this.#recorded.get(key)?.rendering;
    const live = this.#live.get(key);
    const rendering = recorded ?? live?.rendering ?? null;
    if (rendering) this.used(rendering);
    return rendering;
  }

  /** Whether the setting will be ready soon without the workers: it was rendered ahead, and is on its way. */
  coming(setting: Setting): boolean {
    const entry = this.#recorded.get(settingKey(setting));
    if (!entry || entry.failed) return false;
    if (!entry.rendering && this.#order[0] !== settingKey(setting)) {
      // asked for out of turn: it goes first
      this.#order = [settingKey(setting), ...this.#order.filter((k) => k !== settingKey(setting))];
      this.#work();
    }
    return true;
  }

  /** A rendering is heard: it is the last to be let go of among those not wanted. */
  used(rendering: Rendering): void {
    const key = settingKey(rendering.setting);
    const stamp = ++this.#clock;
    const entry = this.#recorded.get(key);
    if (entry?.rendering === rendering) entry.lastUsed = stamp;
    const live = this.#live.get(key);
    if (live?.rendering === rendering) live.lastUsed = stamp;
  }

  /** A rendering the workers have rendered whole: kept as long as it fits. */
  keep(rendering: Rendering): void {
    if (!rendering.done) return;
    const key = settingKey(rendering.setting);
    if (this.#recorded.get(key)?.rendering) return;
    this.#live.set(key, { rendering, lastUsed: ++this.#clock });
    this.#trim();
    this.#options.changed();
  }

  /**
   * Where the fader is, which way it went last, and where else it is going (wandering): the order
   * in which settings are wanted, and so what is fetched, decoded and kept.
   */
  steer(order: readonly Setting[]): void {
    this.#order = order.map(settingKey);
    this.#work();
  }

  /**
   * Let go of what no longer fits, now that what sounded may have faded out (what sounds is kept
   * whatever it costs, and was when the fader moved on).
   */
  tidy(): void {
    this.#trim();
  }

  /** Whether the library keeps this rendering. */
  holds(rendering: Rendering): boolean {
    const key = settingKey(rendering.setting);
    return this.#recorded.get(key)?.rendering === rendering || this.#live.get(key)?.rendering === rendering;
  }

  /** The elaborations of what it keeps: what the piano's recordings are kept decoded for. */
  elaborations(): number[] {
    const all: number[] = [];
    for (const entry of this.#recorded.values())
      if (entry.rendering) all.push(entry.rendering.setting.elaboration);
    for (const live of this.#live.values()) all.push(live.rendering.setting.elaboration);
    return all;
  }

  /** What is decoded now, in MB: for whoever watches the page from outside. */
  get megabytes(): number {
    return Math.round(this.#held().reduce((sum, h) => sum + h.bytes, 0) / MB);
  }

  /** The keys of what is decoded now. */
  get decoded(): string[] {
    return this.#held().map((h) => h.key);
  }

  /** What a rendering costs decoded: a sound shared with one counted already, only what else it has. */
  #bytesOf(rendering: Rendering, counted: Set<AudioBuffer>): number {
    const whole = rendering.whole;
    const shared = whole !== null && counted.has(whole);
    if (whole) counted.add(whole);
    // by the buffer itself: an array taken of it may be detached once a source plays it
    const voice = whole ? whole.length * whole.numberOfChannels * 4 : rendering.audio.byteLength;
    return (shared ? 0 : voice) + this.#options.besides(rendering);
  }

  /** What is decoded, and what it costs. */
  #held(): Held[] {
    const held: Held[] = [];
    const counted = new Set<AudioBuffer>();
    for (const [key, entry] of this.#recorded)
      if (entry.rendering)
        held.push({ key, bytes: this.#bytesOf(entry.rendering, counted), lastUsed: entry.lastUsed });
    for (const [key, live] of this.#live)
      if (!held.some((h) => h.key === key))
        held.push({ key, bytes: this.#bytesOf(live.rendering, counted), lastUsed: live.lastUsed });
    return held;
  }

  /** The renderings in use, by key. */
  #inUse(): Set<string> {
    const keys = new Set<string>();
    for (const [key, entry] of this.#recorded)
      if (entry.rendering && this.#options.inUse(entry.rendering)) keys.add(key);
    for (const [key, live] of this.#live) if (this.#options.inUse(live.rendering)) keys.add(key);
    return keys;
  }

  /** Let go of what does not fit: the least wanted, and of the others the one heard longest ago. */
  #trim(): void {
    const keep = kept(this.#held(), this.#order, this.#inUse(), this.#options.limit);
    for (const [key, entry] of this.#recorded)
      if (entry.rendering && !keep.has(key)) {
        this.#options.dropped(entry.rendering);
        entry.rendering = null;
      }
    for (const [key, live] of this.#live)
      if (!keep.has(key) && this.#recorded.get(key)?.rendering !== live.rendering) {
        this.#options.dropped(live.rendering);
        this.#live.delete(key);
      }
  }

  /**
   * The next thing to do: decode the first wanted setting that is not, if it fits beside what is
   * kept; fetch the files of those wanted, and then of all the others (on a computer).
   */
  #work(): void {
    this.#trim();
    const wantedEntries = this.#order
      .map((key) => [key, this.#recorded.get(key)] as const)
      .filter((pair): pair is readonly [string, Recorded] => pair[1] !== undefined && !pair[1].failed);
    // the files of what is wanted, in order; on a computer, every setting's after them
    const toFetch = [
      ...wantedEntries.map(([, entry]) => entry),
      ...(this.#options.fetchAll ? [...this.#recorded.values()] : []),
    ].filter((entry) => !entry.failed && !entry.sound && !entry.fetching && !entry.rendering);
    const next = toFetch.at(0);
    if (next && ![...this.#recorded.values()].some((entry) => entry.fetching !== null)) this.#fetch(next);
    if (this.#decodingNow) return;
    const used = this.#held().reduce((sum, h) => sum + h.bytes, 0);
    for (const [i, [key, entry]] of wantedEntries.entries()) {
      if (entry.rendering || entry.decoding) continue;
      const cost = (entry.voice.samples / this.#sampleRate) * this.#options.perSecond;
      // the first wanted is decoded whatever it costs; the others only where they fit
      const room = this.#options.limit - used + this.#releasable(key);
      if (i > 0 && cost > room) return;
      if (!entry.sound) return;
      void this.#decode(entry);
      return;
    }
  }

  /** How much would be freed for `key` by letting go of what is less wanted than it, or not wanted. */
  #releasable(key: string): number {
    const rank = this.#order.indexOf(key);
    const inUse = this.#inUse();
    return this.#held()
      .filter((h) => !inUse.has(h.key))
      .filter((h) => {
        const r = this.#order.indexOf(h.key);
        return r < 0 || r > rank;
      })
      .reduce((sum, h) => sum + h.bytes, 0);
  }

  #fetch(entry: Recorded): void {
    entry.fetching = (async () => {
      const get = async (file: string): Promise<Response> => {
        const response = await fetch(VOICE_DIRECTORY + file);
        if (!response.ok) throw new Error(`${file}: ${response.status}`);
        return response;
      };
      const [sound, plan] = await Promise.all([
        get(entry.voice.file).then((r) => r.arrayBuffer()),
        get(entry.voice.plan).then((r) => r.json() as Promise<unknown>),
      ]);
      entry.sound = sound;
      entry.same = sameness(sound);
      entry.plan = plan;
    })().then(
      () => {
        entry.fetching = null;
        this.#work();
      },
      (error: unknown) => {
        entry.fetching = null;
        entry.failed = true;
        console.warn(
          `The voice rendered ahead at ${entry.voice.elaboration} did not load; it is rendered.`,
          error,
        );
        this.#options.changed();
        this.#work();
      },
    );
  }

  async #decode(entry: Recorded): Promise<void> {
    const sound = entry.sound;
    if (!sound) return;
    entry.decoding = true;
    this.#decodingNow = true;
    try {
      const plan = parsePlan(entry.plan);
      const { whole, lead } = this.#sharedSound(entry) ?? (await this.#decoded(sound, entry.voice));
      // what it sounds like: its voice and its plan, but for the setting it is of
      const sounds = `${entry.same}|${fnv(JSON.stringify({ ...plan, setting: null }))}`;
      entry.rendering = new Rendering(
        { ...plan, id: renderingId(), startSeconds: 0, startState: 0 },
        whole,
        sounds,
        lead,
      );
      entry.lastUsed = ++this.#clock;
    } catch (error) {
      entry.failed = true;
      console.warn(`The voice rendered ahead at ${entry.voice.elaboration} could not be decoded.`, error);
    } finally {
      entry.decoding = false;
      this.#decodingNow = false;
    }
    this.#options.changed();
    this.#work();
  }

  /** The sound of another setting decoded already whose voice is the same, to share. */
  #sharedSound(entry: Recorded): { readonly whole: AudioBuffer; readonly lead: number } | null {
    for (const other of this.#recorded.values()) {
      const rendering = other.rendering;
      if (other !== entry && other.same === entry.same && rendering?.whole)
        if (other.voice.samples === entry.voice.samples)
          return { whole: rendering.whole, lead: rendering.lead };
    }
    return null;
  }

  /**
   * The sound decoded at the rate it was rendered at, whatever the sound card's, and where the
   * rendering lies in it: its lead, found by the reference the tool kept (`findLead`), else the one
   * it measured. The buffer is played from there as it is: copied out (`alignVoice`), each voice took
   * the page's thread 60 to 180 ms. The bytes are kept for another time (decoding takes them).
   */
  async #decoded(
    sound: ArrayBuffer,
    voice: RecordedVoice,
  ): Promise<{ readonly whole: AudioBuffer; readonly lead: number }> {
    const decoder = new OfflineAudioContext(1, 1, this.#sampleRate);
    const whole = await decoder.decodeAudioData(sound.slice(0));
    const measured = voice.align['lead'];
    const lead =
      findLead(whole.getChannelData(0), voice)?.lead ??
      (typeof measured === 'number' ? Math.round(measured) : 0);
    return { whole, lead };
  }
}
