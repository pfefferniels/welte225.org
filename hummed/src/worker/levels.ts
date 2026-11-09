// How exaggerated the performance is, and how loosely the voice sings: both follow the elaboration.
// The barer the music (0, the humming alone), the rawer the gestures: the MPM ×1.4 (doubled sounded
// unnatural, ×1.6 still too much); the more of it there is, the subtler, until at 1 the piano plays the reconstruction
// as the MPM sets it down.
// The voice is the inner guide of the playing: a little more exaggerated than the piano, except
// where notes move in time, which it shares with the piano so that the two stay together.
import {
  EXPRESSION_DIMENSIONS,
  type ExaggerationFactors,
  type ExpressionDimension,
  weightedFactors,
} from 'espressivo';

const unit = (x: number): number => Math.min(1, Math.max(0, x));

/** The piano's exaggeration (and the voice's timing): ×1.4 at 0, falling fast, then gently, to ×1 at 1. */
export const pianoLevel = (elaboration: number): number => 1 + 0.4 * Math.pow(1 - unit(elaboration), 2);

/** The voice's, except in timing: ×1.4 alone, a little beyond the piano's elsewhere, ×1.1 under the piece. */
export const voiceLevel = (elaboration: number): number => 1.1 + 0.3 * Math.pow(1 - unit(elaboration), 2);

/** How loosely the voice keeps to the written pitch, 0 to 1: loosest alone, closest under the piece. */
export const approximateness = (elaboration: number): number => 1 - unit(elaboration);

/**
 * How fragmentary the voice is: it falls silent where what the MPM does stays below this
 * (src/hummer/salience.ts). A little alone, where the voice is all there is; a little more under
 * the piece, a pianist humming along.
 */
export const fragmentation = (elaboration: number): number => 0.11 + 0.06 * unit(elaboration);

/** Where the page starts (index.html): the piece (×1.05), the humming under it (×1.14). */
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

/** The voice: the dimensions that move notes in time at `timing` (the piano's), the others at `level`. */
export function voiceFactors(timing: number, level: number): ExaggerationFactors {
  return Object.fromEntries(EXPRESSION_DIMENSIONS.map((d) => [d, TIMING.has(d) ? timing : level]));
}

/** The same MPM with every dynamics map rendered within notes too, for the voice's effort curve. */
export const withSubNoteDynamics = (mpm: string): string =>
  mpm.replace(/<dynamics /g, '<dynamics subNoteDynamics="true" ');
