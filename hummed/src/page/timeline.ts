// Every sound the page plays has its place on a timeline in context time: a lane's time 0 is at its
// origin, and so each buffer of its voice, each note of its piano. A source is asked to start at
// that place, a little ahead. Where the page's thread was held up and the place has passed, or is
// too close to be sure of, a source started there would begin at once from the start it was given,
// late by as much: everything after it would sound late, and the next crossfade would be placed
// against a lane that is not where it is believed to be. So a source too late is started a little
// later still, as much further into its sound: what is heard lies where its timeline puts it, and
// only the beginning that was missed is not heard.
import type { Seconds } from '../shared/units.ts';

/** The audio thread renders 128 frames at a time. */
export const QUANTUM = 128;
/**
 * How far ahead of the context's time a source is started at the earliest: three render quanta
 * (8.7 ms at 44.1 kHz). The page's reading of the time can be a quantum behind the audio thread's.
 */
export const MARGIN_QUANTA = 3;

/** Where a source is started: when, how far into its sound, and how late that is against its place. */
export interface Start {
  readonly when: number;
  readonly offset: Seconds;
  readonly late: Seconds;
}

/**
 * Where to start a sound whose place is at context time `when`, `offset` into it, now that the
 * context is at `now`: there, if that is at least `margin` ahead; else at `now + margin`, as much
 * further into the sound as that is later (at the rate it plays at, `rate` of its own time a second).
 */
export function startPlace(when: number, offset: Seconds, now: number, margin: Seconds, rate = 1): Start {
  const earliest = now + margin;
  if (when >= earliest) return { when, offset, late: 0 };
  return { when: earliest, offset: offset + (earliest - when) * rate, late: earliest - when };
}

/**
 * The margin of a context: three render quanta at its rate. An offline context renders only once
 * all is scheduled, and needs none.
 */
export const marginOf = (context: BaseAudioContext): Seconds =>
  'startRendering' in context ? 0 : (MARGIN_QUANTA * QUANTUM) / context.sampleRate;

/**
 * Start a source at its place: its sound's `offset` at context time `when`, or later as far into it.
 * A sound that begins before its place (`offset` below 0) starts where its first sample is placed.
 * Returns how late it started against its place.
 */
export function startOn(source: AudioBufferSourceNode, when: number, offset: Seconds): Seconds {
  const rate = source.playbackRate.value;
  // a sound whose place is before its first sample: its first sample where that is placed
  const first = offset < 0 ? { when: when - offset / rate, offset: 0 } : { when, offset };
  const start = startPlace(
    first.when,
    first.offset,
    source.context.currentTime,
    marginOf(source.context),
    rate,
  );
  source.start(start.when, start.offset);
  return start.late;
}
