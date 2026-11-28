// The MPM with some of its instructions brought out (shared/emphasis.ts), as espressivo makes it:
// `spotlightMpm` leaves the dimensions the named instructions govern as they are and damps every
// other; `exaggerateMpm` then takes those dimensions further. What a dimension's transitions are
// shaped like is left alone: exaggerated, a late ritardando is squeezed into its last chord. A
// setting's own exaggeration (shared/shape.ts) comes on top of this, as it does of the MPM as it is:
// the MPM brought out takes its place before anything is made of it (materials.ts).
import { exaggerateMpm, spotlightMpm, type ExpressionDimension } from 'espressivo';
import { emphasisOf, type Emphasis } from '../shared/emphasis.ts';

export interface BroughtOut {
  readonly mpm: string;
  /** The instructions named that the MPM has; none where it is left as it is. */
  readonly present: readonly string[];
  /** The dimensions they govern: left undamped, and exaggerated but for their shapes. */
  readonly spared: readonly ExpressionDimension[];
}

const asItIs = (mpm: string): BroughtOut => ({ mpm, present: [], spared: [] });

/**
 * Bring instructions out. The MPM stays as it is where there is nothing to do (`emphasisOf`), where
 * it has none of the instructions named, and where espressivo refuses the selection: it brings out
 * all of it or nothing, and an id on what governs no dimension (a definition, a style) is refused.
 */
export function bringOut(mpm: string, asked: Emphasis | undefined): BroughtOut {
  const emphasis = emphasisOf(asked);
  if (!emphasis) return asItIs(mpm);
  const present = emphasis.ids.filter((id) => mpm.includes(`xml:id="${id}"`));
  if (present.length === 0) return asItIs(mpm);
  let damped: ReturnType<typeof spotlightMpm>;
  try {
    damped = spotlightMpm(mpm, { ids: present, attenuation: emphasis.attenuation });
  } catch {
    return asItIs(mpm);
  }
  const { spared } = damped;
  const factors = Object.fromEntries(
    spared.filter((dimension) => !dimension.endsWith('Shape')).map((d) => [d, emphasis.factor]),
  );
  return { mpm: exaggerateMpm(damped.mpm, { factors }).mpm, present, spared };
}

/** The MPM with an emphasis brought out; as it is without one. */
export const emphasised = (mpm: string, emphasis: Emphasis | undefined): string =>
  bringOut(mpm, emphasis).mpm;
