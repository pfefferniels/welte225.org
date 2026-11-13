// The hummer: from a performance (espressivo) and the reduction to VocalTractLab's two gestural
// scores, lips closed and lips open, and the opening that blends them.
import type { PerformanceData } from 'espressivo';
import type { Reduction } from '../reduction/types.ts';
import { PAD_MS, type Ms, type Seconds } from '../shared/units.ts';
import type { ArticulatorMove } from './articulators.ts';
import { Clock } from './clock.ts';
import { gesturalScores } from './gestural-score.ts';
import { gestures } from './gestures.ts';
import { findBreaths, melodyOf, voiceNotes, type MelodyNote, type VoiceNote } from './melody.ts';
import {
  readDynamics,
  readPerformance,
  repair,
  type DynamicsCurve,
  type DynamicsRange,
  type Note,
  type PedalPoint,
  type Turns,
} from './performance.ts';
import { movement, presence, presenceAt } from './presence.ts';
import type { Calibration, HumStyle } from './style.ts';
import { vocalMap, type VocalEvent } from './vocal-map.ts';

export { dynamicsRange, readDynamics, repair, readPerformance, turningPoints } from './performance.ts';
export type { DynamicsCurve, DynamicsRange, Turns } from './performance.ts';
export type { Note } from './performance.ts';
export type { Calibration, HumStyle } from './style.ts';
export { Clock } from './clock.ts';
export { moveArticulators, type ArticulatorMove } from './articulators.ts';

export interface VoiceInput {
  /** The performance the voice follows. */
  readonly performance: PerformanceData;
  /**
   * The same performance rendered with sub-note dynamics, for the dynamics curve, or that curve as
   * `readDynamics` reads it (another worker may have performed it).
   */
  readonly dynamics: PerformanceData | DynamicsCurve;
  readonly reduction: Reduction;
  readonly style: HumStyle;
  readonly calibration: Calibration;
  /** How loosely the voice keeps to the written pitch, 0 (close) to 1 (more or less). */
  readonly approximateness: number;
  /** The MPM's own range of dynamics (`dynamicsRange`), against which the voice reads loudness. */
  readonly range: DynamicsRange;
  /** Where the MPM's dynamics and tempo turn back up (`turningPoints`): places to breathe. */
  readonly turns: Turns;
  /**
   * How much the MPM's maps have to move for the voice to be heard wholly (`THRESHOLD` in the
   * worker's levels, presence.ts). 0 or absent: all of it is heard, every sung stretch through.
   */
  readonly threshold?: number;
}

export interface Voice {
  readonly closedScore: string;
  readonly openScore: string;
  /** The consonants' articulators, to move in both scores' tract states (`moveArticulators`). */
  readonly moves: readonly ArticulatorMove[];
  /** How far the lips are open, per ms of the rendering. */
  readonly weight: Float32Array;
  readonly endMs: Ms;
  /** Score time to the performance's time, without the rendering's padding. */
  readonly clock: Clock;
  /** Each bar's downbeat in the rendering, in seconds. */
  readonly bars: readonly (readonly [Seconds, string])[];
  readonly events: readonly VocalEvent[];
  /**
   * Where the voice is silent (the lungs have stopped pushing air a while ago): ms of the rendering
   * where it may be cut and rendered in parts without a seam.
   */
  readonly seams: readonly Ms[];
}

/** The line as the voice sings it, and how much of it is heard. */
export interface Line {
  readonly melody: readonly MelodyNote[];
  readonly voice: readonly VoiceNote[];
  /** Per 10 ms of the performance (`presence`); null where all of the voice is heard. */
  readonly heard: Float32Array | null;
}

export interface LineInput {
  readonly reduction: Reduction;
  readonly notes: readonly Note[];
  readonly sustain: readonly PedalPoint[];
  readonly clock: Clock;
  readonly dynamics: DynamicsCurve;
  readonly turns: Turns;
  readonly threshold?: number;
}

/**
 * The reduction's notes with a breath at every rest and where the line gives most reason to
 * (`findBreaths`): among them where the voice is inward anyway, as it is heard before those breaths.
 */
export function sungLine({
  reduction,
  notes,
  sustain,
  clock,
  dynamics,
  turns,
  threshold = 0,
}: LineInput): Line {
  const hearing = (melody: readonly MelodyNote[], voice: readonly VoiceNote[]): Float32Array | null =>
    threshold > 0
      ? presence(
          movement(melody, voice, dynamics, clock, Math.max(...voice.map((v) => v.off * 1000)) + 1000),
          threshold,
        )
      : null;
  const written = melodyOf(reduction, notes, clock);
  const before = hearing(written, voiceNotes(written));
  const melody = findBreaths(written, {
    sustain,
    turns,
    quiet: (ms) => (before ? 1 - presenceAt(before, ms) : 0),
  });
  const voice = voiceNotes(melody);
  return { melody, voice, heard: hearing(melody, voice) };
}

export function renderVoice(input: VoiceInput): Voice {
  const { notes, sustain } = readPerformance(input.performance);
  repair(notes);
  const dynamics = 'times' in input.dynamics ? input.dynamics : readDynamics(input.dynamics);
  const clock = new Clock(notes, sustain);
  const { melody, voice, heard } = sungLine({
    reduction: input.reduction,
    notes,
    sustain,
    clock,
    dynamics,
    turns: input.turns,
    threshold: input.threshold ?? 0,
  });
  const air = input.reduction.events.filter((e) => e.kind === 'air');
  const events = vocalMap({
    notes,
    sustain,
    melody,
    voice,
    air,
    dynamics,
    clock,
    style: input.style,
    range: input.range,
    presence: heard,
  });
  const g = gestures({
    notes,
    events,
    clock,
    dynamics,
    style: input.style,
    calibration: input.calibration,
    approximateness: input.approximateness,
    presence: heard,
  });
  const scores = gesturalScores(g.tiers, g.endMs);
  return {
    closedScore: scores.closed,
    openScore: scores.open,
    moves: g.moves,
    weight: g.weight,
    endMs: g.endMs,
    clock,
    bars: input.reduction.bars.map((b) => [clock.toMs(b.tick) / 1000 + PAD_MS / 1000, b.label] as const),
    events,
    seams: g.silences,
  };
}
