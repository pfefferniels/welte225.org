// The piano at an elaboration: the piece and its harmonies performed with the MPM as exaggerated and
// as fast as that elaboration has it, struck as inexactly (imprecision.ts), as the roll plays them. The worker sends them with each plan; `npm run pianoteq` renders them from the same.
import { exaggerateMpm, performMsmToData } from 'espressivo';
import { readPerformance, repair, type PedalPoint, type Performance } from '../hummer/performance.ts';
import type { PedalStep, PianoPart } from '../shared/piano.ts';
import { PAD_MS } from '../shared/units.ts';
import { atTempo, pianoFactors, pianoLevel, tempoFactor, type Shape } from './levels.ts';
import { imprecise } from './imprecision.ts';

/**
 * What the piano plays from: the piece's score (MSM) and its MPM, and the harmonies' score (in half
 * or in quarter notes) and theirs (reductions.ts).
 */
export interface PianoScore {
  readonly msm: string;
  readonly mpm: string;
  readonly harmonies: string;
  readonly harmoniesMpm: string;
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

/** The MPM as the piano performs it in a shape: exaggerated, then faster. */
export function pianoMpm(mpm: string, shape: Shape): string {
  const factors = pianoFactors(pianoLevel(shape));
  return atTempo(factors ? exaggerateMpm(mpm, { factors }).mpm : mpm, tempoFactor(shape));
}

/** The piano's two parts in a shape. */
export function performPiano(
  score: PianoScore,
  shape: Shape,
): { readonly piece: PianoPart; readonly harmonies: PianoPart } {
  const part = (msm: string, mpm: string, expandOrnaments: boolean): PianoPart => {
    const performance = readPerformance(
      imprecise(performMsmToData({ msm, mpm }, { expandOrnaments }), shape),
    );
    repair(performance.notes);
    return pianoPart(performance);
  };
  // The piece's grace notes are MPM v3 ornaments on the piece's notes; the harmonies' MPM has none,
  // and its arpeggios are v2, which the flag leaves alone: each chord rolled as the piece rolls it
  // where it stands in the piece.
  return {
    piece: part(score.msm, pianoMpm(score.mpm, shape), true),
    harmonies: part(score.harmonies, pianoMpm(score.harmoniesMpm, shape), false),
  };
}
