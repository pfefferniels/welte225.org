// The voice's decisions about a performance: breaths, scoops and falls, the mouth's posture,
// pulses and stops between notes, slides, and the effort over each phrase.
import type { Air, AirPassage } from '../reduction/types.ts';
import { clip, fixed, groupBy, interp, seededRandom } from '../shared/math.ts';
import type { Ms, Seconds, Ticks } from '../shared/units.ts';
import type { Clock } from './clock.ts';
import type { MelodyNote, VoiceNote } from './melody.ts';
import type { DynamicsCurve, Note, PedalPoint } from './performance.ts';
import type { HumStyle } from './style.ts';

/** The three humming shapes of the mouth, mixed in turn, and the open shapes they move toward. */
export const HUMS = ['hum1', 'hum2', 'hum3'] as const;
export const OPEN_SHAPES = ['open2', 'open4', 'open1'] as const;
export type Hum = (typeof HUMS)[number];
export type OpenShape = (typeof OPEN_SHAPES)[number];

/** How far the lips part at the most. */
export const OPEN_MAX = 0.3;
/** Between notes: legato within this gap, a stop from this gap on, a slide past this overlap (ms). */
const LEGATO_WITHIN: Ms = 15;
const STOP_FROM: Ms = 110;
const SLUR_FROM: Ms = 30;

export type VocalEvent =
  | { readonly tag: 'breath'; readonly date: Ticks; readonly duration: Ticks; readonly depth: number }
  | {
      readonly tag: 'inflection';
      readonly date: Ticks;
      readonly type: 'scoop' | 'fall';
      readonly depthSt: number;
      readonly durationMs: Ms;
    }
  | {
      readonly tag: 'posture';
      readonly date: Ticks;
      readonly hum: Hum;
      readonly toward: OpenShape;
      readonly amount: number;
      readonly transitionMs: Ms;
    }
  | { readonly tag: 'velum'; readonly date: Ticks; readonly value: number }
  | {
      readonly tag: 'pitch';
      readonly date: Ticks;
      /** The sung note's `xml:id` in the reduction. */
      readonly id: string;
      readonly note: Note;
      readonly pitch: number;
      /** A slide up from the chord's first note: the note came out of a spread chord. */
      readonly portamento: boolean;
      /** A short slide across an overlap with the note before. */
      readonly glideMs?: Ms;
    }
  | { readonly tag: 'articulation'; readonly date: Ticks; readonly type: 'stop'; readonly durationMs: Ms }
  | {
      readonly tag: 'articulation';
      readonly date: Ticks;
      readonly type: 'pulse';
      readonly depth: number;
      readonly durationMs: Ms;
    }
  | { readonly tag: 'lips'; readonly date: Ticks; readonly durationMs: Ms }
  | {
      readonly tag: 'pressure';
      readonly date: Ticks;
      readonly factor: number;
      readonly from?: number;
      readonly transitionMs: Ms;
    }
  | {
      readonly tag: 'air';
      readonly date: Ticks;
      readonly durationTicks: Ticks;
      readonly through: AirPassage;
      readonly depth: number;
    };

export type VocalEventOf<T extends VocalEvent['tag']> = Extract<VocalEvent, { tag: T }>;

/** The dynamics smoothed over ±1.5 s, on a 50 ms grid: what sets the size of breaths and air. */
function macroDynamics(dyn: DynamicsCurve): { times: Seconds[]; values: number[] } {
  const times: Seconds[] = [];
  const end = dyn.times[dyn.times.length - 1] + 0.05;
  for (let t = 0; t < end; t += 0.05) times.push(t);
  const raw = times.map((t) => interp(t, dyn.times, dyn.values));
  const half = 30;
  const values = times.map((_, i) => {
    let sum = 0;
    for (let j = i - half; j <= i + half; j++) sum += raw[clip(j, 0, raw.length - 1)];
    return sum / (2 * half + 1);
  });
  return { times, values };
}

export interface VocalMapInput {
  readonly notes: readonly Note[];
  readonly sustain: readonly PedalPoint[];
  readonly melody: readonly MelodyNote[];
  readonly voice: readonly VoiceNote[];
  readonly air: readonly Air[];
  readonly dynamics: DynamicsCurve;
  readonly clock: Clock;
  readonly style: HumStyle;
}

export function vocalMap(input: VocalMapInput): VocalEvent[] {
  const { notes, sustain, melody: src, voice: vn, air, dynamics, clock, style } = input;
  const byDate = groupBy(notes, (n) => n.date);
  const presses: Ticks[] = [];
  for (let i = 1; i < sustain.length; i++)
    if (sustain[i].value >= 64 && sustain[i - 1].value < 64) presses.push(sustain[i].date);
  const events: VocalEvent[] = [];
  const add = (e: VocalEvent): void => {
    events.push(e);
  };
  const random = seededRandom(7);
  const macro = macroDynamics(dynamics);
  const level = (t: Seconds): number => interp(t, macro.times, macro.values);

  // the highest note of each breath group (the longer of equals): where the mouth may open most
  const peakOf: number[] = [];
  {
    let head = 0;
    const groups = new Map<number, number[]>();
    vn.forEach((v, k) => {
      if (v.breathBefore && k > 0) head = k;
      const group = groups.get(head);
      if (group) group.push(k);
      else groups.set(head, [k]);
    });
    for (const ks of groups.values()) {
      const top = ks.reduce(
        (b, k) =>
          src[k].pitch > src[b].pitch ||
          (src[k].pitch === src[b].pitch && vn[k].off - vn[k].on > vn[b].off - vn[b].on)
            ? k
            : b,
        ks[0],
      );
      for (const k of ks) peakOf[k] = top;
    }
  }

  let cur = 0;
  let humIndex = 0;
  let hum: Hum = HUMS[0];
  let toward: OpenShape = OPEN_SHAPES[0];
  const nextHum = (): Hum => {
    humIndex = (humIndex + 1) % HUMS.length;
    return HUMS[humIndex];
  };
  const rampMs = (d: number): Ms => Math.round(clip(Math.abs(d) * 6000, 1000, 2000));
  const moves = (want: number, c: number): boolean => want - c >= 0.08 || c - want >= 0.12;

  vn.forEach((v, k) => {
    const n = src[k];
    const onMs = v.on * 1000;
    const offMs = v.off * 1000;
    const date = n.date;
    const prev = k > 0 ? vn[k - 1] : undefined;

    if (v.breathBefore) {
      const gapStart = prev ? prev.off * 1000 : Math.max(0, onMs - 900);
      if (onMs - gapStart > 100) {
        const start = clock.toTicks(gapStart + 0.35 * (onMs - gapStart));
        // a deeper, longer-sounding breath before a louder stretch
        add({
          tag: 'breath',
          date: start,
          duration: Math.round((clock.toTicks(onMs - 25) - start) * 100) / 100,
          depth: fixed(clip((level(v.on) - 30) / 15, 0.5, 1.3), 2),
        });
      }
      const scoop = style.scoops[k % style.scoops.length];
      add({
        tag: 'inflection',
        date,
        type: 'scoop',
        depthSt: Math.round(scoop * 0.8 * 100) / 100,
        durationMs: 220,
      });
    }

    // the mouth opens with the dynamics, a little more at a long peak, less before high notes
    const long = v.off - v.on >= 0.8;
    const L = level(v.on);
    const x = clip((L - 37.5) / 9.5, 0, 1);
    let want = OPEN_MAX * x * x * (3 - 2 * x);
    if (peakOf[k] === k && long && L >= 37) want += 0.08;
    let pitchAhead = -Infinity;
    for (let j = k; j < src.length; j++)
      if (vn[j].on <= v.on + 2.5) pitchAhead = Math.max(pitchAhead, src[j].pitch);
    want *= clip(1 - (pitchAhead - 74) * 0.1, 0.25, 1);
    want = Math.round(Math.min(OPEN_MAX, want) * 100) / 100;
    if (want < 0.06) want = 0;

    const lastDate = k > 0 ? src[k - 1].date : -1;
    const press = presses.some((p) => p > lastDate && p <= date);
    if (v.breathBefore || k === 0) {
      const peak = src[peakOf[k]].pitch;
      toward = OPEN_SHAPES[Math.floor(clip((peak - 60) / 22, 0, 0.999) * OPEN_SHAPES.length)];
      hum = nextHum();
      add({ tag: 'posture', date, hum, toward, amount: 0, transitionMs: 200 });
      cur = 0;
      if (want > 0) {
        add({
          tag: 'posture',
          date: clock.toTicks(onMs + 300),
          hum,
          toward,
          amount: fixed(want, 2),
          transitionMs: rampMs(want) + 400,
        });
        cur = want;
      }
    } else if (press || moves(want, cur)) {
      if (press) hum = nextHum();
      const amount = moves(want, cur) ? want : cur;
      add({
        tag: 'posture',
        date,
        hum,
        toward,
        amount: fixed(amount, 2),
        transitionMs: amount !== cur ? rampMs(amount - cur) : 400,
      });
      cur = amount;
    }
    if (k === 0) add({ tag: 'velum', date, value: 0.3 });
    if (v.off - v.on >= 1.0) {
      hum = nextHum();
      add({
        tag: 'posture',
        date: clock.toTicks(onMs + 0.55 * (offMs - onMs)),
        hum,
        toward,
        amount: fixed(cur, 2),
        transitionMs: 600,
      });
    }

    let portamento = false;
    let glideMs: Ms | undefined;
    const chord = byDate.get(date) ?? [];
    if (n.ornamented && chord.length > 1 && k > 0 && !v.breathBefore) {
      const first = Math.min(...chord.map((c) => c.onMs));
      portamento = n.onsetMs - first > 25;
    }
    if (k > 0 && !v.breathBefore) {
      const before = src[k - 1];
      const gap = n.onsetMs - before.keyOffMs;
      const same = n.pitch === before.pitch;
      if (gap >= STOP_FROM) {
        add({
          tag: 'articulation',
          date: clock.toTicks(before.keyOffMs),
          type: 'stop',
          durationMs: Math.round(gap),
        });
        if (cur > 0.05)
          add({
            tag: 'lips',
            date: clock.toTicks(onMs - Math.min(gap, 120)),
            durationMs: Math.round(Math.min(gap, 120)),
          });
      } else if (gap > LEGATO_WITHIN || same) {
        const dur = Math.max(70, gap);
        const x = Math.max(0, gap - LEGATO_WITHIN) / (STOP_FROM - LEGATO_WITHIN);
        let depth = 0.55 - 0.4 * x;
        if (same) depth = Math.min(depth, 0.35);
        add({
          tag: 'articulation',
          date: clock.toTicks(onMs - dur),
          type: 'pulse',
          depth: fixed(depth, 2),
          durationMs: Math.round(dur),
        });
      } else if (gap < -SLUR_FROM && !portamento) glideMs = Math.round(clip(-gap * 0.5, 30, 120));
    }
    add({
      tag: 'pitch',
      date,
      id: n.id,
      note: n.note,
      pitch: n.pitch,
      portamento,
      ...(glideMs === undefined ? {} : { glideMs }),
    });

    if (v.breathBefore || k === 0)
      add({
        tag: 'pressure',
        date: clock.toTicks(onMs),
        factor: 1,
        from: 0.5,
        transitionMs: Math.round(Math.min(400, 0.6 * (offMs - onMs))),
      });
    const next = k + 1 < vn.length ? vn[k + 1] : undefined;
    if (!next || next.breathBefore) {
      // the phrase lets go: the effort falls, the mouth closes, the pitch drops a little
      const release = Math.max(onMs + 0.5 * (offMs - onMs), offMs - style.releaseS * 1000);
      add({
        tag: 'pressure',
        date: clock.toTicks(release),
        factor: 0.45,
        transitionMs: Math.round(offMs - release),
      });
      if (cur > 0) {
        const close = Math.max(onMs, Math.min(release, offMs - 600));
        add({
          tag: 'posture',
          date: clock.toTicks(close),
          hum,
          toward,
          amount: 0,
          transitionMs: Math.round(Math.max(300, offMs - close)),
        });
        cur = 0;
      }
      add({
        tag: 'inflection',
        date: clock.toTicks(release),
        type: 'fall',
        depthSt: -Math.round(random.uniform(1.5, 3.5) * 100) / 100,
        durationMs: Math.round(offMs - release),
      });
      add({ tag: 'pressure', date: clock.toTicks(offMs), factor: 0, transitionMs: 40 });
    }
  });

  // voiceless air, as strong as the dynamics there
  for (const a of air) {
    const depth = clip((level(clock.toMs(a.start) / 1000) - 30) / 15, 0.4, 1.2);
    add({
      tag: 'air',
      date: a.start,
      durationTicks: a.end - a.start,
      through: a.through,
      depth: fixed(depth, 2),
    });
  }
  // by date; Array.prototype.sort is stable, so events at one date keep the order they were made in
  return events.sort((a, b) => a.date - b.date);
}

export function eventsOf<T extends VocalEvent['tag']>(
  events: readonly VocalEvent[],
  tag: T,
): VocalEventOf<T>[] {
  return events.filter((e): e is VocalEventOf<T> => e.tag === tag);
}
