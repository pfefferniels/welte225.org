// The piano at an elaboration: the piece and its harmonies performed with the MPM as exaggerated and
// as fast as that elaboration has it, struck as inexactly (imprecision.ts), as the roll plays them. The worker sends them with each plan; `npm run pianoteq` renders them from the same.
import { exaggerateMpm, performMsmToData } from 'espressivo';
import { readPerformance, repair, type PedalPoint, type Performance } from '../hummer/performance.ts';
import type { PedalStep, PianoPart } from '../shared/piano.ts';
import { PAD_MS } from '../shared/units.ts';
import { atTempo, pianoFactors, pianoLevel, tempoFactor } from './levels.ts';
import { imprecise } from './imprecision.ts';

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

/** The MPM as the piano performs it at an elaboration: exaggerated, then faster. */
export function pianoMpm(mpm: string, elaboration: number): string {
  const factors = pianoFactors(pianoLevel(elaboration));
  return atTempo(factors ? exaggerateMpm(mpm, { factors }).mpm : mpm, tempoFactor(elaboration));
}

/** The piano's two parts at an elaboration. */
export function performPiano(
  score: PianoScore,
  elaboration: number,
): { readonly piece: PianoPart; readonly harmonies: PianoPart } {
  const mpm = pianoMpm(score.mpm, elaboration);
  const part = (msm: string, expandOrnaments: boolean): PianoPart => {
    const performance = readPerformance(
      imprecise(performMsmToData({ msm, mpm }, { expandOrnaments }), elaboration),
    );
    repair(performance.notes);
    return pianoPart(performance);
  };
  // The piece's grace notes are MPM v3 ornaments on the piece's notes, which the harmonies do not
  // have: performed with them, each would be skipped with a warning. Its arpeggios are v2, which
  // the flag leaves alone, so the harmonies still roll where the piece rolls.
  return { piece: part(score.msm, true), harmonies: part(score.harmonies, false) };
}
