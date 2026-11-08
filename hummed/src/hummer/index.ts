// The hummer: from a performance (espressivo) and the reduction to VocalTractLab's two gestural
// scores, lips closed and lips open, and the opening that blends them.
import type { PerformanceData } from 'espressivo';
import type { Reduction } from '../reduction/types.ts';
import { PAD_MS, type Ms, type Seconds } from '../shared/units.ts';
import { Clock } from './clock.ts';
import { gesturalScore } from './gestural-score.ts';
import { gestures } from './gestures.ts';
import { melodyOf, voiceNotes } from './melody.ts';
import { readDynamics, readPerformance, repair } from './performance.ts';
import type { Calibration, HumStyle } from './style.ts';
import { vocalMap, type VocalEvent } from './vocal-map.ts';

export { repair, readPerformance } from './performance.ts';
export type { Note } from './performance.ts';
export type { Calibration, HumStyle } from './style.ts';
export { Clock } from './clock.ts';

export interface VoiceInput {
  /** The performance the voice follows. */
  readonly performance: PerformanceData;
  /** The same performance rendered with sub-note dynamics, for the dynamics curve. */
  readonly dynamics: PerformanceData;
  readonly reduction: Reduction;
  readonly style: HumStyle;
  readonly calibration: Calibration;
  /** How loosely the voice keeps to the written pitch, 0 (close) to 1 (more or less). */
  readonly approximateness: number;
}

export interface Voice {
  readonly closedScore: string;
  readonly openScore: string;
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

export function renderVoice(input: VoiceInput): Voice {
  const { notes, sustain } = readPerformance(input.performance);
  repair(notes);
  const dynamics = readDynamics(input.dynamics);
  const clock = new Clock(notes, sustain);
  const melody = melodyOf(input.reduction, notes, clock);
  const air = input.reduction.events.filter((e) => e.kind === 'air');
  const events = vocalMap({
    notes,
    sustain,
    melody,
    voice: voiceNotes(melody),
    air,
    dynamics,
    clock,
    style: input.style,
  });
  const g = gestures({
    notes,
    events,
    clock,
    dynamics,
    style: input.style,
    calibration: input.calibration,
    approximateness: input.approximateness,
  });
  return {
    closedScore: gesturalScore(g.tiers, g.endMs, false),
    openScore: gesturalScore(g.tiers, g.endMs, true),
    weight: g.weight,
    endMs: g.endMs,
    clock,
    bars: input.reduction.bars.map((b) => [clock.toMs(b.tick) / 1000 + PAD_MS / 1000, b.label] as const),
    events,
    seams: g.silences,
  };
}
