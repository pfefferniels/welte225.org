// The piano rendered ahead by Pianoteq (`npm run pianoteq`): for each setting of the elaboration the
// voice is rendered for (every 0.05), which sets how exaggerated the piano plays, one recording of
// each of the piano's parts, listed in piano/pianoteq/manifest.json with what was rendered, so that
// the page and the tests can tell a recording of the performance as it is now.
import { fingerprint, midiEvents, type PianoPart } from './piano.ts';

/** One part of one setting, as it was rendered. */
export interface RecordedPart {
  /** The MP3, beside the manifest. */
  readonly file: string;
  /** How many keys the part had, and the fingerprint of its MIDI messages (see `fingerprint`). */
  readonly keys: number;
  readonly fingerprint: string;
  readonly seconds: number;
  /**
   * How late the renderer's sound came against the messages (ms), before it was moved into place,
   * and how far that changed from the beginning to the end.
   */
  readonly lagMs: number;
  readonly driftMs: number;
}

export interface RecordedSetting {
  readonly elaboration: number;
  /** The piano's exaggeration at that elaboration, as it was rendered. */
  readonly pianoLevel: number;
  readonly piece: RecordedPart;
  readonly harmonies: RecordedPart;
}

export interface RecordingsManifest {
  /** The instrument, as the page names it, and the credit line for it. */
  readonly instrument: string;
  readonly credit: string;
  /** What rendered it (the program, its version, the preset), and on which day. */
  readonly renderer: string;
  readonly rendered: string;
  /** The steps of the elaboration rendered, and the one gain all recordings were given (dB). */
  readonly step: number;
  readonly gainDb: number;
  readonly settings: readonly RecordedSetting[];
}

/**
 * Whether a recording is of a part as it is performed now: as many keys, and the same messages to
 * the millisecond. The keys alone do not tell: a performance at another tempo has them all.
 */
export const recordingOf = (recorded: RecordedPart, part: PianoPart): boolean =>
  recorded.keys === part.keys.length && recorded.fingerprint === fingerprint(midiEvents(part));

export class ManifestError extends Error {
  override name = 'ManifestError';
}

/** A setting's name in file names: the elaboration 0.65 is e065, 1 is e100. */
export const settingName = (elaboration: number): string =>
  `e${String(Math.round(elaboration * 100)).padStart(3, '0')}`;

/** The elaborations from 0 to 1 in steps. */
export const elaborationSteps = (step: number): number[] =>
  Array.from({ length: Math.round(1 / step) + 1 }, (_, i) => Number((i * step).toFixed(4)));

type Json = Readonly<Record<string, unknown>>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);

function field<T>(o: Json, key: string, is: (x: unknown) => x is T, what: string): T {
  const value = o[key];
  if (!is(value)) throw new ManifestError(`${key} is not ${what}`);
  return value;
}
const isString = (x: unknown): x is string => typeof x === 'string';
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function part(x: unknown): RecordedPart {
  if (!isObject(x)) throw new ManifestError('a part is not an object');
  return {
    file: field(x, 'file', isString, 'a string'),
    keys: field(x, 'keys', isNumber, 'a number'),
    fingerprint: field(x, 'fingerprint', isString, 'a string'),
    seconds: field(x, 'seconds', isNumber, 'a number'),
    lagMs: field(x, 'lagMs', isNumber, 'a number'),
    driftMs: field(x, 'driftMs', isNumber, 'a number'),
  };
}

/** The manifest as `npm run pianoteq` writes it; null while nothing is rendered (no settings). */
export function parseManifest(json: unknown): RecordingsManifest | null {
  if (!isObject(json)) throw new ManifestError('the manifest is not an object');
  const settings = field(json, 'settings', Array.isArray, 'a list');
  if (settings.length === 0) return null;
  return {
    instrument: field(json, 'instrument', isString, 'a string'),
    credit: field(json, 'credit', isString, 'a string'),
    renderer: field(json, 'renderer', isString, 'a string'),
    rendered: field(json, 'rendered', isString, 'a string'),
    step: field(json, 'step', isNumber, 'a number'),
    gainDb: field(json, 'gainDb', isNumber, 'a number'),
    settings: settings.map((x: unknown): RecordedSetting => {
      if (!isObject(x)) throw new ManifestError('a setting is not an object');
      return {
        elaboration: field(x, 'elaboration', isNumber, 'a number'),
        pianoLevel: field(x, 'pianoLevel', isNumber, 'a number'),
        piece: part(x['piece']),
        harmonies: part(x['harmonies']),
      };
    }),
  };
}
