// The piano at a level: the piece and its harmonies performed with the exaggerated MPM, as the roll
// plays them. The worker sends them with each plan; `npm run pianoteq` renders them from the same.
import { exaggerateMpm, performMsmToData } from 'espressivo';
import { readPerformance, repair, type PedalPoint, type Performance } from '../hummer/performance.ts';
import type { PedalStep, PianoPart } from '../shared/piano.ts';
import { PAD_MS } from '../shared/units.ts';
import { pianoFactors } from './levels.ts';

/** What the piano plays from: the piece's score, the harmonies' score (MSM) and the MPM. */
export interface PianoScore {
  readonly msm: string;
  readonly harmonies: string;
  readonly mpm: string;
}

const PAD = PAD_MS / 1000;
const steps = (points: readonly PedalPoint[]): PedalStep[] =>
  points.map((p) => ({ at: p.ms / 1000 + PAD, value: p.value }));

/** A performed part in a rendering's time, its keys in the order they are pressed. */
export function pianoPart({ notes, sustain, soft }: Performance): PianoPart {
  return {
    keys: notes
      .map((n) => ({
        on: n.onMs / 1000 + PAD,
        off: n.endMs / 1000 + PAD,
        pitch: n.pitch,
        velocity: n.velocity,
      }))
      .sort((a, b) => a.on - b.on),
    sustain: steps(sustain),
    soft: steps(soft),
  };
}

/** The piano's two parts at a level of exaggeration. */
export function performPiano(
  score: PianoScore,
  level: number,
): { readonly piece: PianoPart; readonly harmonies: PianoPart } {
  const factors = pianoFactors(level);
  const mpm = factors ? exaggerateMpm(score.mpm, { factors }).mpm : score.mpm;
  const part = (msm: string): PianoPart => {
    const performance = readPerformance(performMsmToData({ msm, mpm }));
    repair(performance.notes);
    return pianoPart(performance);
  };
  return { piece: part(score.msm), harmonies: part(score.harmonies) };
}
