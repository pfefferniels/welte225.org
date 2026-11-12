// A take: a stretch of the roll hummed and tapped along with. Its sound is taken apart into the
// body's movements (inversion.ts, movements.ts) and those are read against the roll (reading.ts).
import type { VtlEngine } from '../vtl/engine.ts';
import type { Body } from './body.ts';
import { invert, type Inversion, type InversionOptions } from './inversion.ts';
import { movementsOf, type MovementOptions, type Movements } from './movements.ts';
import { read, type Reading, type ReadingOptions, type TakeTiming } from './reading.ts';
import type { Roll } from './roll.ts';

export interface TakeAnalysis {
  readonly inversion: Inversion;
  readonly movements: Movements;
  readonly reading: Reading;
}

export interface TakeOptions {
  readonly inversion?: InversionOptions;
  readonly movements?: MovementOptions;
  readonly reading?: ReadingOptions;
}

/** A take's sound (mono, 44.1 kHz) and timing, analysed. */
export function analyseTake(
  engine: VtlEngine,
  body: Body,
  roll: Roll,
  samples: Float32Array,
  timing: TakeTiming,
  options: TakeOptions = {},
): TakeAnalysis {
  const inversion = invert(engine, body, samples, options.inversion);
  const movements = movementsOf(
    inversion.tracks,
    inversion.voiced,
    inversion.target.level,
    options.movements,
  );
  return { inversion, movements, reading: read(roll, timing, movements, options.reading) };
}

export { readBody, FRAME_RATE, HOP, type Body, type Tracks } from './body.ts';
export { readRoll, sectionOf, timeAt, dateAt, type Roll, type Section, type RollNote } from './roll.ts';
export type { Inversion, Misfit } from './inversion.ts';
export type { Movements } from './movements.ts';
export type { Reading, TakeTiming, Call, Boundary } from './reading.ts';
