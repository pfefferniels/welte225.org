// What espressivo is told at a shape (shared/shape.ts, which this passes on): the factors by which the
// MPM is exaggerated for the piano and for the voice, and the MPM at another tempo.
import {
  EXPRESSION_DIMENSIONS,
  type ExaggerationFactors,
  type ExpressionDimension,
  weightedFactors,
} from 'espressivo';

export * from '../shared/shape.ts';

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

/**
 * The same MPM with every tempo ×`factor`: what it starts at and what it moves to, in beats a
 * minute. Whatever is counted in beats (rubato, a ritardando's course) is as it was, only sooner
 * over; what the MPM gives in milliseconds (how far a chord is spread, how far the hands are
 * apart) stays as long as it is.
 */
export const atTempo = (mpm: string, factor: number): string =>
  factor === 1
    ? mpm
    : mpm.replace(/<tempo\b[^>]*>/g, (tempo) =>
        tempo.replace(
          /\b(bpm|transition\.to)="(\d+(?:\.\d+)?)"/g,
          (_, name: string, value: string) => `${name}="${String(Number(value) * factor)}"`,
        ),
      );

/** The same MPM with every dynamics map rendered within notes too, for the voice's effort curve. */
export const withSubNoteDynamics = (mpm: string): string =>
  mpm.replace(/<dynamics /g, '<dynamics subNoteDynamics="true" ');
