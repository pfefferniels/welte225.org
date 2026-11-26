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

/**
 * The decoded sound (mono, at the manifest's rate) as the rendering: its first sample the
 * rendering's first, `recorded.samples` long. The tool owns how (it writes `align`).
 */
export function alignVoice(decoded: Float32Array, recorded: RecordedVoice): Float32Array {
  const lead = typeof recorded.align['lead'] === 'number' ? recorded.align['lead'] : 0;
  const out = new Float32Array(recorded.samples);
  out.set(decoded.subarray(lead, lead + recorded.samples));
  return out;
}

/** A setting's plan as the tool wrote it: what a voice worker sends for it, but where it starts. */
export const parsePlan = (json: unknown): PlanBody => {
  if (!isObject(json) || json['type'] !== 'plan') throw new ManifestError('a voice plan is not a plan');
  return json as unknown as PlanBody;
};
