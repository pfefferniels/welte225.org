// The details under the elaboration fader: what it sets, each on its own. How flighty the music is
// (how much faster, how much less exactly), how exaggerated, whether the humming is heard, and
// which of the piano's parts. They follow the fader: as it moves, it takes them all with it; one
// that is moved is set apart from it, until the fader moves again. The two sliders lie on the
// fader's own scale, so that, following it, they stand where it stands.
import type { Setting } from '../shared/protocol.ts';
import {
  exaggeration,
  flightiness,
  IMPRECISION,
  pianoLevel,
  tempoFactor,
  voiceExaggeration,
  voiceLevel,
} from '../shared/shape.ts';
import { partsAt, voiceElaboration, type Parts, type PianoChoice } from './mix.ts';

/** What is set apart from the fader; null where a detail follows it. */
export interface Details {
  /** Where the flightiness is set, on the fader's scale: the flightiness the fader would give there. */
  readonly flighty: number | null;
  /** Where the exaggeration is set, likewise. */
  readonly exaggerated: number | null;
  readonly voice: boolean | null;
  readonly piano: PianoChoice | null;
}

/** Every detail as the fader has it. */
export const FOLLOWING: Details = { flighty: null, exaggerated: null, voice: null, piano: null };

/** Whether anything is set apart from the fader. */
export const apart = (d: Details): boolean =>
  d.flighty !== null || d.exaggerated !== null || d.voice !== null || d.piano !== null;

/** What is heard: as the fader has it, but for what is set apart. */
export const partsOf = (elaboration: number, d: Details): Parts => {
  const at = partsAt(elaboration);
  return { voice: d.voice ?? at.voice, piano: d.piano ?? at.piano };
};

/**
 * The setting to render: in the fader's steps, as the voice is rendered anew only at each, and with
 * a slider set apart only where it stands at a step other than the fader's (else the setting is the
 * fader's own, which the recordings are of).
 */
export function settingOf(elaboration: number, d: Details): Setting {
  const e = voiceElaboration(elaboration);
  const own = (at: number | null): number | undefined => {
    if (at === null) return undefined;
    const step = voiceElaboration(at);
    return step === e ? undefined : step;
  };
  const flighty = own(d.flighty);
  const exaggerated = own(d.exaggerated);
  return {
    elaboration: e,
    ...(flighty !== undefined && { flighty }),
    ...(exaggerated !== undefined && { exaggerated }),
  };
}

/** What a detail slider at a place on the fader's scale does: how fast and how inexact, how exaggerated. */
export const flightinessText = (at: number): string => {
  const f = flightiness(at);
  return `×${tempoFactor({ flightiness: f }).toFixed(2)} · ${Math.round(IMPRECISION.timingMs * f)} ms`;
};
export const exaggerationText = (at: number): readonly [piano: string, voice: string] => [
  `×${pianoLevel({ exaggeration: exaggeration(at) }).toFixed(2)}`,
  `×${voiceLevel({ voiceExaggeration: voiceExaggeration(at) }).toFixed(2)}`,
];
