// The voice is rendered in whole chunks, cut where it is silent (early in a breath), in the order
// they will be heard from where playback is. The page hands them out; the worker that made the plan
// takes the first without being handed it, so both work the order out from the plan.
import type { Plan } from './protocol.ts';
import { SAMPLE_RATE, STATE_STEP } from './units.ts';

/** A range of tract states. */
export type Chunk = readonly [from: number, to: number];

/** Chunks shorter than this are joined to the one before: each costs a little settling. */
const MIN_CHUNK_STATES = Math.round((1.5 * SAMPLE_RATE) / STATE_STEP);

/**
 * The chunks of a rendering in the order they are needed: from the start to the end, then from the
 * beginning up to the start. The start splits its chunk if it falls inside one.
 */
export function chunkOrder(plan: Pick<Plan, 'stateCount' | 'seams' | 'startState'>): Chunk[] {
  const cuts = [0];
  for (const seam of [...plan.seams].sort((a, b) => a - b)) {
    const last = cuts[cuts.length - 1] ?? 0;
    if (seam - last >= MIN_CHUNK_STATES && plan.stateCount - seam >= MIN_CHUNK_STATES) cuts.push(seam);
  }
  cuts.push(plan.stateCount);
  const chunks: Chunk[] = cuts.slice(1).map((to, i) => [cuts[i] ?? 0, to]);
  const start = Math.max(0, Math.min(plan.stateCount - 1, plan.startState));
  const k = chunks.findIndex(([from, to]) => from <= start && start < to);
  const [from, to] = chunks[k] ?? [0, plan.stateCount];
  if (start === from) return [...chunks.slice(k), ...chunks.slice(0, k)];
  return [[start, to], ...chunks.slice(k + 1), ...chunks.slice(0, k), [from, start]];
}
