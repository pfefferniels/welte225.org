// The hummer's data files, checked as they are read: a JSON file is only data until it is.
import type { Calibration, HumStyle } from './style.ts';

export class DataError extends Error {
  override name = 'DataError';
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const finite = (x: unknown, what: string): number => {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new DataError(`${what} is not a number`);
  return x;
};

export function parseHumStyle(json: unknown): HumStyle {
  if (!isRecord(json)) throw new DataError('the hum style is not an object');
  const scoops = json['scoops'];
  if (!Array.isArray(scoops) || scoops.length === 0) throw new DataError('the hum style has no scoops');
  return {
    scoops: scoops.map((s, i) => finite(s, `scoop ${i}`)),
    releaseS: finite(json['releaseS'], 'releaseS'),
    wobbleCents: finite(json['wobbleCents'], 'wobbleCents'),
  };
}

export function parseCalibration(json: unknown): Calibration {
  if (!isRecord(json)) throw new DataError('the calibration is not an object');
  const notes = json['notes'];
  if (!isRecord(notes)) throw new DataError('the calibration has no notes');
  return {
    gain: finite(json['gain'], 'gain'),
    notes: Object.fromEntries(
      Object.entries(notes).map(([id, db]) => [id, finite(db, `the calibration of ${id}`)]),
    ),
  };
}
