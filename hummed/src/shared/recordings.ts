// The piano rendered ahead by Pianoteq (`npm run pianoteq`): for each level of saturation on a grid,
// one recording of each of the piano's parts, listed in piano/pianoteq/manifest.json with what was
// rendered, so that the page and the tests can tell a recording of the performance as it is now.

/** One part of one level, as it was rendered. */
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

export interface RecordedLevel {
  readonly level: number;
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
  /** The grid of levels, and the one gain all recordings were given (dB). */
  readonly step: number;
  readonly gainDb: number;
  readonly levels: readonly RecordedLevel[];
}

export class ManifestError extends Error {
  override name = 'ManifestError';
}

/** A level's name in file names: ×1 is x100, ×0.25 x025. */
export const levelName = (level: number): string => `x${String(Math.round(level * 100)).padStart(3, '0')}`;

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

/** The manifest as `npm run pianoteq` writes it; null while nothing is rendered (no levels). */
export function parseManifest(json: unknown): RecordingsManifest | null {
  if (!isObject(json)) throw new ManifestError('the manifest is not an object');
  const levels = field(json, 'levels', Array.isArray, 'a list');
  if (levels.length === 0) return null;
  return {
    instrument: field(json, 'instrument', isString, 'a string'),
    credit: field(json, 'credit', isString, 'a string'),
    renderer: field(json, 'renderer', isString, 'a string'),
    rendered: field(json, 'rendered', isString, 'a string'),
    step: field(json, 'step', isNumber, 'a number'),
    gainDb: field(json, 'gainDb', isNumber, 'a number'),
    levels: levels.map((x: unknown): RecordedLevel => {
      if (!isObject(x)) throw new ManifestError('a level is not an object');
      return {
        level: field(x, 'level', isNumber, 'a number'),
        piece: part(x['piece']),
        harmonies: part(x['harmonies']),
      };
    }),
  };
}

/** The levels a grid has, from 0 to 2. */
export const gridLevels = (step: number): number[] =>
  Array.from({ length: Math.round(2 / step) + 1 }, (_, i) => Number((i * step).toFixed(4)));
