// A setting prepared for rendering, step by step: espressivo performs the voice's MPM, the hummer
// turns the performance into two gestural scores, VocalTractLab turns those into tract states
// (voice-states.ts); with the piano's two parts (piano.ts) that makes a level, what a worker renders
// chunks from and answers plans with. The steps are apart so that two workers can share them out,
// and so that the tools perform and hum exactly as the worker does.
import { exaggerateMpm, performMsmToData, type PerformanceData } from 'espressivo';
import {
  renderVoice,
  type Calibration,
  type DynamicsRange,
  type HumStyle,
  type Voice,
  type VoiceInput,
} from '../hummer/index.ts';
import { interp } from '../shared/math.ts';
import type { PianoPart } from '../shared/piano.ts';
import type { LevelData, Plan, PlanBody, Setting, StartAt, Timings } from '../shared/protocol.ts';
import { PAD_MS, SAMPLE_RATE, STATE_STEP } from '../shared/units.ts';
import type { Reduction } from '../reduction/types.ts';
import type { StatePair } from '../vtl/engine.ts';
import type { ChunkSource } from './chunk.ts';
import {
  approximateness,
  atTempo,
  pianoLevel,
  tempoFactor,
  threshold,
  voiceFactors,
  voiceLevel,
  withSubNoteDynamics,
} from './levels.ts';

/** The piece and the reconstruction's MPM, as texts. */
export interface Score {
  readonly msm: string;
  readonly mpm: string;
}

/** The voice's performance of the piece, and the same with sub-note dynamics, for the dynamics curve. */
export interface VoicePerformance {
  readonly performance: PerformanceData;
  readonly dynamics: PerformanceData;
}

/**
 * The MPM as the voice performs it: a little more exaggerated than the piano's, but in time with
 * it, and as fast.
 */
export const voiceMpm = (score: Score, elaboration: number): string =>
  atTempo(
    exaggerateMpm(score.mpm, {
      factors: voiceFactors(pianoLevel(elaboration), voiceLevel(elaboration)),
    }).mpm,
    tempoFactor(elaboration),
  );

/** The voice's performance: the notes it follows. */
export const performNotes = (score: Score, mpm: string): PerformanceData =>
  performMsmToData({ msm: score.msm, mpm });

/** The same performance with sub-note dynamics: independent of the other, so another worker may make it. */
export const performDynamics = (score: Score, mpm: string): PerformanceData =>
  performMsmToData({ msm: score.msm, mpm: withSubNoteDynamics(mpm) });

/** espressivo performs the MPM for the voice. */
export function performVoice(score: Score, elaboration: number): VoicePerformance {
  const mpm = voiceMpm(score, elaboration);
  return { performance: performNotes(score, mpm), dynamics: performDynamics(score, mpm) };
}

/** What the hummer reads beside the performance and the reduction. */
export interface HumData {
  /** The MPM's own range of dynamics, against which the voice reads loudness. */
  readonly range: DynamicsRange;
  readonly style: HumStyle;
  readonly calibration: Calibration;
}

/**
 * The hummer at an elaboration: how loosely the voice sings, and how much of it is heard. The
 * dynamics come as performed or, from another worker, as the curve already read of that.
 */
export function hum(
  performed: Pick<VoiceInput, 'performance' | 'dynamics'>,
  reduction: Reduction,
  data: HumData,
  elaboration: number,
): Voice {
  return renderVoice({
    ...performed,
    reduction,
    ...data,
    approximateness: approximateness(elaboration),
    threshold: threshold(elaboration),
  });
}

/** One setting, from the MPM to tract states, as a worker keeps it. */
export interface Level extends ChunkSource {
  readonly setting: Setting;
  readonly plan: PlanBody;
}

export function makeLevel(
  setting: Setting,
  voice: Voice,
  states: StatePair,
  piano: { readonly piece: PianoPart; readonly harmonies: PianoPart },
  timings: Timings,
): Level {
  const count = states.closed.count;
  const msPerState = (STATE_STEP / SAMPLE_RATE) * 1000;
  const seams = voice.seams.map((ms) => Math.round(ms / msPerState)).filter((i) => i > 0 && i < count);
  return {
    setting,
    states,
    weight: voice.weight,
    seams: new Set(seams),
    plan: {
      type: 'plan',
      setting,
      pianoLevel: pianoLevel(setting.elaboration),
      voiceLevel: voiceLevel(setting.elaboration),
      // states i..j sound from i to j−1
      duration: ((count - 1) * STATE_STEP) / SAMPLE_RATE,
      bars: voice.bars,
      clock: { ticks: voice.clock.ticks, ms: voice.clock.ms },
      piece: piano.piece,
      harmonies: piano.harmonies,
      timings,
      stateCount: count,
      seams,
    },
  };
}

/** The plan of a level for a request: how long, where its bars and seams are, where the sound starts. */
export function planOf(L: Level, id: number, start: StartAt): Plan {
  const startSeconds =
    'tick' in start
      ? interp(start.tick, L.plan.clock.ticks, L.plan.clock.ms) / 1000 + PAD_MS / 1000
      : start.seconds;
  // the first state at or before the 10 ms slot of the start: the page counts sound per slot
  const slot = SAMPLE_RATE / 100;
  const startState = Math.max(
    0,
    Math.min(L.plan.stateCount - 1, Math.floor((Math.floor(startSeconds * 100) * slot) / STATE_STEP)),
  );
  return { ...L.plan, id, startSeconds, startState };
}

/** A copy of a level to hand to another worker, and its buffers, to transfer rather than copy again. */
export function copyLevel(L: Level): { readonly data: LevelData; readonly transfer: ArrayBuffer[] } {
  const data = {
    plan: L.plan,
    closed: L.states.closed.tract.slice(),
    glottis: L.states.closed.glottis.slice(),
    open: L.states.open.tract.slice(),
    weight: L.weight.slice(),
  };
  return {
    data,
    transfer: [data.closed.buffer, data.glottis.buffer, data.open.buffer, data.weight.buffer],
  };
}

/** The level another worker handed over. */
export function levelFrom(data: LevelData): Level {
  const count = data.plan.stateCount;
  return {
    setting: data.plan.setting,
    states: {
      closed: { count, tract: data.closed, glottis: data.glottis },
      open: { count, tract: data.open },
    },
    weight: data.weight,
    seams: new Set(data.plan.seams),
    plan: data.plan,
  };
}
