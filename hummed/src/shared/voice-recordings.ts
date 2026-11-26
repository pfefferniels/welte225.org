// The voice rendered ahead (`npm run voices`), as the Pianoteq recordings are the piano's: for each
// setting of the elaboration the voice is rendered for (mix.ts: `RENDERED`), the humming as a voice
// worker would render it, sample for sample, and the plan the page plays it with (its bars, its
// clock from score time to performed time, the piano's parts), listed in voice/manifest.json. With
// them the page has a setting at once, and can blend from one setting into another while it plays;
// where a setting has none, or one of another table, the voice is rendered as you listen.
//
// This module is the contract between the tool that writes them and the page that plays them.
import { ELABORATION } from './shape.ts';
import type { PlanBody } from './protocol.ts';
import { ManifestError } from './recordings.ts';

/** Where they lie, beside the page. */
export const VOICE_DIRECTORY = 'voice/';

/** One setting's voice, as it was rendered. */
export interface RecordedVoice {
  readonly elaboration: number;
  /** The sound (MP3, mono, at `sampleRate`) and the plan (JSON: a `PlanBody`), beside the manifest. */
  readonly file: string;
  readonly plan: string;
  /** The rendering's length in samples: what the sound is, once aligned (`alignVoice`). */
  readonly samples: number;
  /**
   * What `alignVoice` needs to find the rendering's first sample in the decoded sound, whatever the
   * decoder does with the encoder's delay (the tool measures and writes it).
   */
  readonly align: Readonly<Record<string, unknown>>;
  /** The fingerprint of the voice's gestural scores and weight, as test/voice.test.ts takes it. */
  readonly fingerprint: string;
}

export interface VoiceManifest {
  readonly version: 1;
  /** On which day, and of which table of points (`tableKey`). */
  readonly rendered: string;
  readonly table: string;
  readonly sampleRate: number;
  /**
   * What the sound was made with beside the gestural scores, for the tests to tell a rendering of
   * the voice as it is now: the output gain (the calibration's), the fingerprint of the speaker
   * (sha256 of data/hummer.speaker.xml), and that of VocalTractLab's sound as test/engine.test.ts
   * takes it (`vtlAudio3to9s`).
   */
  readonly gain?: number;
  readonly speaker?: string;
  readonly engine?: string;
  readonly settings: readonly RecordedVoice[];
}

/**
 * The table of points as a short key: recordings of another table are of other settings. FNV-1a
 * over its JSON, which the page can take without a digest (no `crypto.subtle` before it plays).
 */
export function tableKey(table: unknown = ELABORATION): string {
  const text = JSON.stringify(table);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

type Json = Readonly<Record<string, unknown>>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const isString = (x: unknown): x is string => typeof x === 'string';
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
function field<T>(o: Json, key: string, is: (x: unknown) => x is T, what: string): T {
  const value = o[key];
  if (!is(value)) throw new ManifestError(`${key} is not ${what}`);
  return value;
}
/** A field that may be missing: as an object to spread, empty where it is. */
function optional<K extends string, T>(
  o: Json,
  key: K,
  is: (x: unknown) => x is T,
  what: string,
): Partial<Record<K, T>> {
  if (o[key] === undefined) return {};
  return { [key]: field(o, key, is, what) } as Partial<Record<K, T>>;
}

/** The manifest as `npm run voices` writes it; null while nothing is rendered. */
export function parseVoiceManifest(json: unknown): VoiceManifest | null {
  if (!isObject(json)) throw new ManifestError('the voice manifest is not an object');
  if (json['version'] !== 1) throw new ManifestError('the voice manifest is of another version');
  const settings = field(json, 'settings', Array.isArray, 'a list');
  if (settings.length === 0) return null;
  return {
    version: 1,
    rendered: field(json, 'rendered', isString, 'a string'),
    table: field(json, 'table', isString, 'a string'),
    sampleRate: field(json, 'sampleRate', isNumber, 'a number'),
    ...optional(json, 'gain', isNumber, 'a number'),
    ...optional(json, 'speaker', isString, 'a string'),
    ...optional(json, 'engine', isString, 'a string'),
    settings: settings.map((x: unknown): RecordedVoice => {
      if (!isObject(x)) throw new ManifestError('a setting is not an object');
      return {
        elaboration: field(x, 'elaboration', isNumber, 'a number'),
        file: field(x, 'file', isString, 'a string'),
        plan: field(x, 'plan', isString, 'a string'),
        samples: field(x, 'samples', isNumber, 'a number'),
        align: field(x, 'align', isObject, 'an object'),
        fingerprint: field(x, 'fingerprint', isString, 'a string'),
      };
    }),
  };
}

/** Whether the recordings are of the table the page has: else the voice is rendered as you listen. */
export const ofThisTable = (manifest: VoiceManifest): boolean => manifest.table === tableKey();

// Finding the rendering in the decoded sound. An MP3 encoder delays the sound (LAME by 1105 samples)
// and pads it, and writes both into the file's first frame. ffmpeg and Chromium take them out, as the
// tool measures; a decoder that does not read that frame hands the sound over late, by the delay
// (1105), by the delay and the frame decoded as silence (2257), or by the decoder's own part of the
// delay (529). So the tool keeps a short stretch of the rendering, the reference, where it is like
// nothing else within `window` samples of it (a breath, a consonant, a voice coming up), and the
// decoded sound is searched for it: in sums of `COARSE` samples through the whole window, then
// sample by sample around the best.

/** The reference's length (samples), and the steps of the coarse search. */
export const REFERENCE_LENGTH = 1024;
const COARSE = 8;
/** How far from the rendering's place the reference is looked for (samples), unless `align` says. */
const WINDOW = 4096;
/**
 * How alike the decoded sound and the reference must be at their best (normalized correlation, 1
 * where they are the same but for loudness) for the lead found to be taken. A decoded MP3 comes to
 * 0.9999; the reference was chosen to match its own sound elsewhere in the window far less.
 */
const MATCH = 0.9;

/** What `align` holds, read. */
interface Alignment {
  /** The lead taken where the reference is not found: what the tool measured in ffmpeg and Chromium. */
  readonly lead: number;
  /** The reference's first sample in the rendering, its samples, and how far it is searched for. */
  readonly at: number;
  readonly reference: Float32Array;
  readonly window: number;
}

/** What `align` holds, read; without a reference where it has none. */
function readAlignment(align: Json): Alignment {
  const lead = isNumber(align['lead']) ? Math.round(align['lead']) : 0;
  const { at, reference, scale, window } = align;
  if (!isNumber(at) || !isString(reference) || !isNumber(scale))
    return { lead, at: 0, reference: new Float32Array(0), window: 0 };
  const bytes = atob(reference);
  const view = new DataView(new ArrayBuffer(bytes.length));
  for (let i = 0; i < bytes.length; i++) view.setUint8(i, bytes.charCodeAt(i));
  return {
    lead,
    at: Math.round(at),
    reference: Float32Array.from({ length: bytes.length >> 1 }, (_, i) => view.getInt16(2 * i, true) * scale),
    window: isNumber(window) ? Math.round(window) : WINDOW,
  };
}

/**
 * A reference for `align`: the stretch of `REFERENCE_LENGTH` samples of the rendering, among those as
 * loud as the humming is mostly, that matches its own sound elsewhere within `window` samples least,
 * in the coarse search's steps (`rival`, its best match there). Its samples are kept as 16-bit
 * numbers (base64), `scale` each. The tool adds the lead to fall back on, once it has measured it.
 */
export function voiceAlignment(
  rendering: Float32Array,
  window = WINDOW,
): { at: number; reference: string; scale: number; window: number; rival: number } {
  const n = REFERENCE_LENGTH / COARSE;
  const w = Math.round(window / COARSE);
  const coarse = summed(rendering, 0, Math.floor(rendering.length / COARSE));
  const energy = new Float64Array(coarse.length + 1);
  for (let k = 0; k < coarse.length; k++) energy[k + 1] = energy[k] + coarse[k] * coarse[k];
  const power = (k: number): number => energy[k + n] - energy[k];
  // as loud as the humming mostly is: the median of the stretches that sound at all
  const first = w;
  const last = coarse.length - n - w;
  const step = n / 4;
  const sounding: number[] = [];
  for (let k = first; k < last; k += step) if (power(k) > n * 1e-5) sounding.push(power(k));
  sounding.sort((a, b) => a - b);
  const loud = sounding[sounding.length >> 1] ?? Infinity;
  let best = { k: -1, rival: Infinity };
  for (let k = first; k < last; k += step) {
    if (power(k) < loud) continue;
    const rival = rivalOf(coarse, k, n, w, power, best.rival);
    if (rival < best.rival) best = { k, rival };
  }
  if (best.k < 0) throw new Error('the rendering has nothing loud enough to be found by');
  const at = best.k * COARSE;
  const stretch = rendering.subarray(at, at + REFERENCE_LENGTH);
  const peak = stretch.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1;
  const scale = peak / 32767;
  const bytes = new Uint8Array(2 * REFERENCE_LENGTH);
  const view = new DataView(bytes.buffer);
  stretch.forEach((x, i) => {
    view.setInt16(2 * i, Math.round(x / scale), true);
  });
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return { at, reference: btoa(text), scale, window, rival: Number(best.rival.toFixed(4)) };
}

/** `length` sums of `COARSE` samples each, from `from` on. */
function summed(x: Float32Array, from: number, length: number): Float32Array {
  const out = new Float32Array(Math.max(0, length));
  for (let k = 0; k < out.length; k++) {
    let s = 0;
    for (let m = 0, i = from + k * COARSE; m < COARSE; m++, i++) s += x[i];
    out[k] = s;
  }
  return out;
}

/**
 * How well the stretch of `n` at `k` matches the sound around it, `w` either way, where it is not
 * itself (the lobe about its own place where they correlate at all); given up as soon as it comes
 * to `enough`.
 */
function rivalOf(
  x: Float32Array,
  k: number,
  n: number,
  w: number,
  power: (k: number) => number,
  enough: number,
): number {
  const own = power(k);
  const r = (lag: number): number => {
    let c = 0;
    for (let j = 0; j < n; j++) c += x[k + j] * x[k + lag + j];
    return c / Math.sqrt(own * power(k + lag) || 1);
  };
  let rival = -1;
  for (const side of [1, -1]) {
    let lag = side;
    while (lag * side <= w && r(lag) > 0) lag += side;
    for (; lag * side <= w; lag += side) {
      rival = Math.max(rival, r(lag));
      if (rival >= enough) return rival;
    }
  }
  return rival;
}

/** The normalized correlation of `reference` with `x` from `start`. */
function correlation(reference: Float32Array, x: Float32Array, start: number): number {
  let c = 0;
  let e = 0;
  let f = 0;
  for (let j = 0; j < reference.length; j++) {
    const a = reference[j];
    const b = x[start + j];
    c += a * b;
    e += a * a;
    f += b * b;
  }
  return c / Math.sqrt(e * f || 1);
}

/**
 * Where the rendering's first sample is in the decoded sound (its lead, in samples: negative where
 * the decoder has cut some of the silence before it), and how well the reference matched there;
 * null where it was not found within the window, or matched too little.
 */
export function findLead(
  decoded: Float32Array,
  recorded: Pick<RecordedVoice, 'align'>,
): { readonly lead: number; readonly match: number } | null {
  const a = readAlignment(recorded.align);
  const n = a.reference.length;
  if (n < COARSE) return null;
  // the coarse search, in sums of COARSE samples, from as early in the window as the sound has
  const from = Math.max(0, a.at - a.window);
  const to = Math.min(decoded.length, a.at + a.window + n);
  const m = Math.floor(n / COARSE);
  const reference = summed(a.reference, 0, m);
  const sound = summed(decoded, from, Math.floor((to - from) / COARSE));
  // the sound's power under the reference, slid along
  let own = 0;
  for (const x of reference) own += x * x;
  let power = 0;
  for (let j = 0; j < m && j < sound.length; j++) power += sound[j] * sound[j];
  let coarse = { lag: 0, r: -Infinity };
  for (let k = 0; k + m <= sound.length; k++) {
    let c = 0;
    for (let j = 0; j < m; j++) c += reference[j] * sound[k + j];
    const r = c / Math.sqrt(own * power || 1);
    if (r > coarse.r) coarse = { lag: from + k * COARSE - a.at, r };
    if (k + m < sound.length) power += sound[k + m] * sound[k + m] - sound[k] * sound[k];
  }
  if (coarse.r === -Infinity) return null;
  // then sample by sample, two coarse steps either way
  let best = { lead: 0, match: -Infinity };
  for (let lag = coarse.lag - 2 * COARSE; lag <= coarse.lag + 2 * COARSE; lag++) {
    const start = a.at + lag;
    if (start < 0 || start + n > decoded.length || Math.abs(lag) > a.window) continue;
    const r = correlation(a.reference, decoded, start);
    if (r > best.match) best = { lead: lag, match: r };
  }
  return best.match >= MATCH ? best : null;
}

/**
 * The decoded sound (mono, at the manifest's rate) as the rendering: its first sample the
 * rendering's first, `recorded.samples` long. The lead is found by the reference (`findLead`), or
 * else is the one the tool measured; what the decoder cut off before, or after, is silence.
 */
export function alignVoice(decoded: Float32Array, recorded: RecordedVoice): Float32Array {
  const lead = findLead(decoded, recorded)?.lead ?? readAlignment(recorded.align).lead;
  const out = new Float32Array(recorded.samples);
  const skip = Math.max(0, -lead);
  out.set(
    decoded.subarray(skip + lead, Math.max(skip + lead, Math.min(decoded.length, lead + recorded.samples))),
    skip,
  );
  return out;
}

/** A setting's plan as the tool wrote it: what a voice worker sends for it, but where it starts. */
export const parsePlan = (json: unknown): PlanBody => {
  if (!isObject(json) || json['type'] !== 'plan') throw new ManifestError('a voice plan is not a plan');
  return json as unknown as PlanBody;
};
