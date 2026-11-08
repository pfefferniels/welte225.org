// The exaggeration of the piano and of the voice, and how loosely the voice sings. The voice is the
// inner guide of the playing: always more exaggerated than the piano, except where notes move in
// time, which it shares with the piano so that the two stay together. How much more, and how
// loosely it keeps to the written pitch, depend on the elaboration: the barer the music around it,
// the further and the looser it goes.
import {
  EXPRESSION_DIMENSIONS,
  type ExaggerationFactors,
  type ExpressionDimension,
  weightedFactors,
} from 'espressivo';

/** How much further than the piano the voice's expression goes: 0.7 alone, 0.1 under the piece. */
export const voiceLead = (elaboration: number): number => 0.7 - 0.6 * elaboration;

/** How loosely the voice keeps to the written pitch, 0 to 1: loosest alone, closest under the piece. */
export const approximateness = (elaboration: number): number => Math.min(1, Math.max(0, 1 - elaboration));

/** Where the page starts (index.html): the piece, the humming under it, 0.3 further than the piano. */
export const DEFAULT_ELABORATION = 0.65;

const TIMING: ReadonlySet<ExpressionDimension> = new Set<ExpressionDimension>([
  'tempo',
  'tempoShape',
  'rubato',
  'asynchrony',
  'ornamentSpread',
  'ornamentSpacing',
  'imprecisionTiming',
]);

/** The piano at level `s`: espressivo's weighting of the dimensions; null at 1, the MPM as it is. */
export function pianoFactors(s: number): ExaggerationFactors | null {
  return Math.abs(s - 1) < 1e-9 ? null : weightedFactors(s, {});
}

/** The voice at level `s`, `lead` beyond it except in timing. */
export function voiceFactors(s: number, lead: number): ExaggerationFactors {
  return Object.fromEntries(EXPRESSION_DIMENSIONS.map((d) => [d, TIMING.has(d) ? s : s + lead]));
}

/** The same MPM with every dynamics map rendered within notes too, for the voice's effort curve. */
export const withSubNoteDynamics = (mpm: string): string =>
  mpm.replace(/<dynamics /g, '<dynamics subNoteDynamics="true" ');
