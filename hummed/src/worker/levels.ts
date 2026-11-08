// The exaggeration of the piano and of the voice. The voice is the inner guide of the playing:
// always a step more exaggerated than the piano, except where notes move in time, which it shares
// with the piano so that the two stay together.
import {
  EXPRESSION_DIMENSIONS,
  type ExaggerationFactors,
  type ExpressionDimension,
  weightedFactors,
} from 'espressivo';

export const VOICE_LEAD = 0.3;

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

export function voiceFactors(s: number): ExaggerationFactors {
  return Object.fromEntries(EXPRESSION_DIMENSIONS.map((d) => [d, TIMING.has(d) ? s : s + VOICE_LEAD]));
}

/** The same MPM with every dynamics map rendered within notes too, for the voice's effort curve. */
export const withSubNoteDynamics = (mpm: string): string =>
  mpm.replace(/<dynamics /g, '<dynamics subNoteDynamics="true" ');
