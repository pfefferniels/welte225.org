// A voice's tract states, as VocalTractLab makes them from its two gestural scores, with the
// consonants' articulators moved in them (see hummer/articulators.ts).
import { moveArticulators, type Voice } from '../hummer/index.ts';
import { SAMPLE_RATE, STATE_STEP } from '../shared/units.ts';
import type { StatePair, VtlEngine } from '../vtl/engine.ts';

export function voiceStates(engine: VtlEngine, voice: Voice, maxStates: number): StatePair {
  const states = {
    closed: engine.states(voice.closedScore, maxStates),
    open: engine.states(voice.openScore, maxStates),
  };
  const msPerState = (STATE_STEP / SAMPLE_RATE) * 1000;
  for (const s of [states.closed, states.open])
    moveArticulators(s.tract, s.count, engine.constants.tractParams, msPerState, voice.moves);
  return states;
}
