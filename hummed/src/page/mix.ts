// One fader, elaboration, sets what is heard: how much of the music is there, and how refined. The
// piano plays from the first: the harmonic reduction in half notes, then the same in quarter notes,
// then the piece itself (shared/shape.ts). The humming goes on over it throughout, loudest at the
// bare end, receding as the fader rises, quieter still under the piece, as a pianist hums along.
import { PIECE_FROM, QUARTERS_FROM, stageAt, type Stage } from '../shared/shape.ts';

/** Where the half notes give way to the quarters, and the quarters to the piece. */
export { PIECE_FROM, QUARTERS_FROM };

/** The piano's level, the same for both parts: it comes in whole, and does not fade in. */
const PIANO = Math.pow(10, -5 / 20);
/** The humming: 0 dB at the bare end, falling to this at the top, fast at first (as the square root). */
const HUM_FLOOR_DB = -22;

/** The gains of the humming and of the piano's two parts, of which one sounds at a time. */
export interface Mix {
  readonly hum: number;
  readonly harmonies: number;
  readonly piece: number;
}

/** What the piano plays: nothing, the harmonies (in half or in quarter notes, as the setting has them), or the piece. */
export type PianoChoice = 'none' | 'harmonies' | 'piece';

/** What is heard: the humming or not, and which of the piano's parts, if any. */
export interface Parts {
  readonly voice: boolean;
  readonly piano: PianoChoice;
}

const unit = (x: number): number => Math.min(1, Math.max(0, x));

/** What the elaboration lets be heard: the humming, and the harmonies up to the piece, the piece from there. */
export function partsAt(elaboration: number): Parts {
  return { voice: true, piano: unit(elaboration) < PIECE_FROM ? 'harmonies' : 'piece' };
}

/** The gains for what is heard, the humming as loud as the elaboration has it. */
export function mixOf(elaboration: number, parts: Parts): Mix {
  const hum = parts.voice ? Math.pow(10, (HUM_FLOOR_DB * Math.sqrt(unit(elaboration))) / 20) : 0;
  return {
    hum,
    harmonies: parts.piano === 'harmonies' ? PIANO : 0,
    piece: parts.piano === 'piece' ? PIANO : 0,
  };
}

export const mix = (elaboration: number): Mix => mixOf(elaboration, partsAt(elaboration));

/**
 * The elaboration the voice is rendered for: in steps, so that moving the fader renders anew only at
 * each, and the step on the fader's side of a border between the half notes, the quarters and the
 * piece, so that what is rendered is what is heard.
 */
const ELABORATION_STEPS = 20;
export const voiceElaboration = (elaboration: number): number => {
  const e = unit(elaboration);
  const step = Math.round(e * ELABORATION_STEPS) / ELABORATION_STEPS;
  if (stageAt(step) === stageAt(e)) return step;
  return (
    (step > e ? Math.floor(e * ELABORATION_STEPS) : Math.ceil(e * ELABORATION_STEPS)) / ELABORATION_STEPS
  );
};

/** What the fader shows: what the piano plays. */
export const heard = (elaboration: number): Stage => stageAt(unit(elaboration));
