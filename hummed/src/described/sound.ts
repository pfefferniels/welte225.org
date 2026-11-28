// A player of passages without sound (the page with `?silent`): it performs the piece with
// espressivo as the page itself does, and for a passage keeps that performance's time, saying where
// it is for as long as the passage lasts. The roll can be read, and the page tried, where nothing
// can be heard or the workers that render the voice are not wanted.
import type { Ms, Ticks } from '../shared/units.ts';
import { emphasised } from '../worker/emphasis.ts';
import { along } from './geometry.ts';
import type { Emphasis, PassageListeners, PassagePlayer, PerformedNote } from './passage.ts';
import { perform, quietly } from './rendering.ts';

/** How many renderings the stand-in keeps: a slider's worth. */
const KEPT = 12;
/** How often the stand-in says where it is. */
const TICK: Ms = 30;

/** The player; `sources` are the score and the MPM, once the page has loaded them. */
export function silentPlayer(
  sources: Promise<{ readonly msm: string; readonly mpm: string }>,
): PassagePlayer {
  const renderings = new Map<string, ReadonlyMap<string, PerformedNote>>();
  let turn = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let heard: PassageListeners | null = null;

  const notes = async (emphasis?: Emphasis): Promise<ReadonlyMap<string, PerformedNote>> => {
    const { msm, mpm } = await sources;
    const key = emphasis ? `${emphasis.ids.join(' ')} ${emphasis.factor} ${emphasis.attenuation}` : '';
    let rendering = renderings.get(key);
    if (!rendering) {
      rendering = perform(
        msm,
        quietly(() => emphasised(mpm, emphasis)),
      ).notes;
      renderings.set(key, rendering);
      const oldest = renderings.keys().next();
      if (renderings.size > KEPT && !oldest.done) renderings.delete(oldest.value);
    }
    return rendering;
  };

  /** A performance's clock: when the first note of each date of the score is struck. */
  const clockOf = (
    msm: string,
    performed: ReadonlyMap<string, PerformedNote>,
  ): { ticks: Ticks[]; ms: Ms[] } => {
    const struck = new Map<Ticks, Ms>();
    for (const [tag] of msm.matchAll(/<note\b[^>]*>/g)) {
      const id = /\sxml:id="([^"]*)"/.exec(tag)?.[1];
      const date = Number(/\sdate="([^"]*)"/.exec(tag)?.[1]);
      const note = id === undefined ? undefined : performed.get(id);
      if (note && Number.isFinite(date)) struck.set(date, Math.min(struck.get(date) ?? Infinity, note.on));
    }
    const ticks: Ticks[] = [];
    const ms: Ms[] = [];
    for (const [date, on] of [...struck].sort((a, b) => a[0] - b[0])) {
      // a chord rolled ahead of its beat can begin before the one before it has: time goes on
      if (ms.length > 0 && on <= ms[ms.length - 1]) continue;
      ticks.push(date);
      ms.push(on);
    }
    return { ticks, ms };
  };

  const stop = (): void => {
    turn += 1;
    clearTimeout(timer);
    const listeners = heard;
    heard = null;
    listeners?.onState?.('stopped');
  };

  return {
    notes,
    stop,
    unlock: () => undefined,
    play: async (request, listeners = {}) => {
      stop();
      const mine = ++turn;
      heard = listeners;
      listeners.onState?.('preparing');
      const [performed, { msm }] = await Promise.all([notes(request.emphasis), sources]);
      if (mine !== turn) return;
      const clock = clockOf(msm, performed);
      const from = along(clock.ticks, clock.ms, request.from);
      const until = along(clock.ticks, clock.ms, request.to);
      const began = performance.now();
      listeners.onState?.('playing');
      const step = (): void => {
        if (mine !== turn) return;
        const ms = from + performance.now() - began;
        if (ms >= until) {
          stop();
          return;
        }
        listeners.onTick?.(along(clock.ms, clock.ticks, ms));
        timer = setTimeout(step, TICK);
      };
      step();
    },
  };
}
