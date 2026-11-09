// A voice's tract states, as VocalTractLab makes them from its two gestural scores, with the
// consonants' articulators moved in them (see hummer/articulators.ts). The two scores are
// independent of each other: two workers may each take one (`scoreStates`).
import { moveArticulators, type ArticulatorMove, type Voice } from '../hummer/index.ts';
import { SAMPLE_RATE, STATE_STEP } from '../shared/units.ts';
import type { States, VtlEngine } from '../vtl/engine.ts';

/** How many tract states a voice can come to: what VocalTractLab is given room for. */
export const maxStatesOf = (voice: Pick<Voice, 'endMs'>): number =>
  Math.ceil(((voice.endMs / 1000) * SAMPLE_RATE) / STATE_STEP) + 10;

/** One score's states, the articulators moved. */
export function scoreStates(
  engine: VtlEngine,
  score: string,
  maxStates: number,
  moves: readonly ArticulatorMove[],
): States {
  const states = engine.states(score, maxStates);
  const msPerState = (STATE_STEP / SAMPLE_RATE) * 1000;
  moveArticulators(states.tract, states.count, engine.constants.tractParams, msPerState, moves);
  return states;
}

export function voiceStates(
  engine: VtlEngine,
  voice: Voice,
  maxStates: number,
): { readonly closed: States; readonly open: States } {
  return {
    closed: scoreStates(engine, voice.closedScore, maxStates, voice.moves),
    open: scoreStates(engine, voice.openScore, maxStates, voice.moves),
  };
}
