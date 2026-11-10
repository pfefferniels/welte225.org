// The voice's decisions about a performance: breaths, scoops and sags, the mouth's posture and its
// rare opening, pulses, stops and consonants between notes, slides, the effort over each phrase, and
// where the voice is heard.
import type { Air, AirPassage } from '../reduction/types.ts';
import { clip, fixed, groupBy, interp, seededRandom } from '../shared/math.ts';
import type { Ms, Seconds, Ticks } from '../shared/units.ts';
import type { Clock } from './clock.ts';
import type { MelodyNote, VoiceNote } from './melody.ts';
import type { DynamicsCurve, DynamicsRange, Note, PedalPoint } from './performance.ts';
import { presenceAt, surfacings } from './presence.ts';
import type { HumStyle } from './style.ts';

/** The three humming shapes of the mouth, mixed in turn. */
export const HUMS = ['hum1', 'hum2', 'hum3'] as const;
export type Hum = (typeof HUMS)[number];
/**
 * What the mouth opens to: the speaker's "a" with the lips barely parted. (The open shapes fitted to
 * the recorded hum went only half of the way from the hum's forward tongue to an "a", with the nose
 * open: a nasal vowel between "ö" and "ä", which bleated.)
 */
export const OPEN_SHAPE = 'ah';

/** How far the lips part at the most. */
export const OPEN_MAX = 0.3;
/**
 * The mouth opens with the dynamics (smoothed, read against the roll's range) at the piece's very
 * loudest moments alone: where they pass `from`, as far (to OPEN_MAX) as their peak lies above it,
 * fully `span` above. It opens slowly, over `inMs` at least, so as to be open at the peak, and
 * closes as slowly once the dynamics have fallen back; both eased (gestures.ts), since a lip that
 * parts at an even pace is heard to part. Openings less than `least` are left out, and one that
 * could not close and open again in time joins the one before. (From 44, over 1 to 2 s and closing
 * with each phrase, the lips parted in 4 to 7 places and were heard to; from 37.5 they were open
 * for a third of the piece.)
 */
export const MOUTH = {
  from: 46,
  span: 3,
  least: 0.08,
  inMs: 3000,
  inMost: 4500,
  outMs: 3500,
} as const;
/** Between notes: legato within this gap, a stop from this gap on, a slide past this overlap (ms). */
const LEGATO_WITHIN: Ms = 15;
const STOP_FROM: Ms = 110;
const SLUR_FROM: Ms = 30;
/**
 * Consonants that articulate a note as the piano's touch does: a detached note begins with a 'd',
 * the tongue closed this long before it (the lungs pushing again a little before, behind the
 * closure); a portato or a repeated note with an 'n', the tongue closed this long, the voice going on
 * through the nose. Only the tongue tip moves (articulators.ts): as VocalTractLab's consonant
 * gestures, which move the whole mouth, they sounded like an 'Ä'. Switched off, a detached note
 * begins after a stop, the lips closing before it where they were open, and a portato with a dip of
 * breath alone.
 */
export const ARTICULATION: { readonly consonants: boolean } = { consonants: true };
const D_CLOSURE: Ms = 80;
const D_PRESS: Ms = 50;
const N_CLOSURE: Ms = 80;

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
      readonly transitionMs: Ms;
    }
  | {
      /** The lips part, or close again (`amount` 0), slowly: eased over `transitionMs`. */
      readonly tag: 'mouth';
      readonly date: Ticks;
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
      readonly tag: 'consonant';
      /** The note it begins, at whose onset the tongue lets go. */
      readonly date: Ticks;
      readonly sound: 'd' | 'n';
      /** How long the tongue is closed before the onset. */
      readonly durationMs: Ms;
    }
  | {
      readonly tag: 'pressure';
      readonly date: Ticks;
      readonly factor: number;
      readonly from?: number;
      readonly transitionMs: Ms;
    }
  | {
      /** The inner voice is heard here (presence.ts): it has come up over the threshold. */
      readonly tag: 'surface';
      readonly date: Ticks;
      readonly durationMs: Ms;
      /** How much of it is heard at the most, up to 1. */
      readonly peak: number;
    }
  | {
      readonly tag: 'air';
      readonly date: Ticks;
      readonly durationTicks: Ticks;
      readonly through: AirPassage;
      readonly depth: number;
    };

export type VocalEventOf<T extends VocalEvent['tag']> = Extract<VocalEvent, { tag: T }>;

/**
 * The roll's own middle range of dynamics (10th to 90th percentile), for which the thresholds below
 * (the mouth's opening, the depth of breaths and air) were set. The reconstruction's may lie
 * elsewhere (its pianissimo is softer): the voice reads the dynamics against the MPM's own range,
 * mapped onto this one, so that it opens and breathes as deeply in the piece's louder moments.
 */
const ROLL_RANGE: DynamicsRange = { low: 34, high: 44 };

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
  /** The MPM's own range of dynamics, against which loudness is read here. */
  readonly range: DynamicsRange;
  /**
   * How much of the voice is heard, per 10 ms of the performance (presence.ts); null: all of it.
   */
  readonly presence: Float32Array | null;
}

/** One opening of the mouth: when the lips begin to part, how far, and when they begin to close. */
interface Opening {
  readonly from: Ms;
  readonly inMs: Ms;
  readonly amount: number;
  readonly close: Ms;
}

/**
 * Where the mouth opens: the stretches where the smoothed dynamics lie above `MOUTH.from` while the
 * voice is heard, each opened towards its peak and closed after it.
 */
function openings(level: (t: Seconds) => number, end: Seconds, presence: Float32Array | null): Opening[] {
  const out: Opening[] = [];
  const step = 0.05;
  let start = -1;
  let peak = 0;
  let top = -Infinity;
  for (let i = 0; i * step <= end + step; i++) {
    const t = i * step;
    const L = t <= end ? level(t) : -Infinity;
    if (L > MOUTH.from) {
      if (start < 0) start = t;
      if (L > top) {
        top = L;
        peak = t;
      }
      continue;
    }
    if (start < 0) continue;
    const x = clip((top - MOUTH.from) / MOUTH.span, 0, 1);
    const amount = fixed(OPEN_MAX * x * x * (3 - 2 * x), 2);
    let heard = !presence;
    if (presence)
      for (let s = start; s <= t && !heard; s += 0.1) heard = presenceAt(presence, s * 1000) > 0.5;
    const last = out.at(-1);
    const inMs = Math.round(clip((peak - start) * 1000 + 1500, MOUTH.inMs, MOUTH.inMost));
    const from = peak * 1000 - inMs;
    const close = Math.max(peak * 1000 + 300, t * 1000 - 500);
    if (amount >= MOUTH.least && heard) {
      if (last && from < last.close + MOUTH.outMs)
        // no time to close and open again: the mouth stays as it is and closes after this one
        out[out.length - 1] = { ...last, close };
      else out.push({ from: Math.max(0, from), inMs, amount, close });
    }
    start = -1;
    top = -Infinity;
  }
  return out;
}

export function vocalMap(input: VocalMapInput): VocalEvent[] {
  const { notes, sustain, melody: src, voice: vn, air, dynamics, clock, style, range, presence } = input;
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
  const relative = (v: number): number =>
    ROLL_RANGE.low + ((v - range.low) / (range.high - range.low)) * (ROLL_RANGE.high - ROLL_RANGE.low);
  const level = (t: Seconds): number => relative(interp(t, macro.times, macro.values));

  // the mouth: a few slow openings, and how far it is open at any time, as the lips' stops need it
  const mouth = openings(level, Math.max(...vn.map((v) => v.off)), presence);
  for (const o of mouth) {
    add({ tag: 'mouth', date: clock.toTicks(o.from), amount: o.amount, transitionMs: o.inMs });
    add({ tag: 'mouth', date: clock.toTicks(o.close), amount: 0, transitionMs: MOUTH.outMs });
  }
  const openAt = (ms: Ms): number =>
    mouth.reduce(
      (a, o) =>
        Math.max(
          a,
          o.amount * clip(Math.min((ms - o.from) / o.inMs, 1 - (ms - o.close) / MOUTH.outMs), 0, 1),
        ),
      0,
    );

  let humIndex = 0;
  let hum: Hum = HUMS[0];
  const nextHum = (): Hum => {
    humIndex = (humIndex + 1) % HUMS.length;
    return HUMS[humIndex];
  };

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

    // the humming shape: another with each phrase, at a pedal press and in a long note
    const lastDate = k > 0 ? src[k - 1].date : -1;
    const press = presses.some((p) => p > lastDate && p <= date);
    if (v.breathBefore || k === 0) {
      hum = nextHum();
      add({ tag: 'posture', date, hum, transitionMs: 200 });
    } else if (press) {
      hum = nextHum();
      add({ tag: 'posture', date, hum, transitionMs: 400 });
    }
    if (k === 0) add({ tag: 'velum', date, value: 0.3 });
    if (v.off - v.on >= 1.0) {
      hum = nextHum();
      add({
        tag: 'posture',
        date: clock.toTicks(onMs + 0.55 * (offMs - onMs)),
        hum,
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
        // detached: the lungs stop; with consonants they push again behind the tongue, which lets go
        // with a 'd', else the lips close before the note where they were open
        add({
          tag: 'articulation',
          date: clock.toTicks(before.keyOffMs),
          type: 'stop',
          durationMs: Math.round(ARTICULATION.consonants ? Math.max(30, gap - D_PRESS) : gap),
        });
        if (ARTICULATION.consonants)
          add({ tag: 'consonant', date, sound: 'd', durationMs: Math.round(Math.min(gap, D_CLOSURE)) });
        else if (openAt(onMs) > 0.05)
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
        if (ARTICULATION.consonants) add({ tag: 'consonant', date, sound: 'n', durationMs: N_CLOSURE });
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
      // the phrase lets go: the effort falls, the pitch drops a little
      const release = Math.max(onMs + 0.5 * (offMs - onMs), offMs - style.releaseS * 1000);
      add({
        tag: 'pressure',
        date: clock.toTicks(release),
        factor: 0.45,
        transitionMs: Math.round(offMs - release),
      });
      add({
        tag: 'inflection',
        date: clock.toTicks(release),
        type: 'fall',
        depthSt: -Math.round(random.uniform(0.3, 0.8) * 100) / 100,
        durationMs: Math.round(offMs - release),
      });
      add({ tag: 'pressure', date: clock.toTicks(offMs), factor: 0, transitionMs: 40 });
    }
  });

  // where the inner voice is heard
  if (presence)
    for (const s of surfacings(presence))
      add({
        tag: 'surface',
        date: clock.toTicks(s.from),
        durationMs: Math.round(s.to - s.from),
        peak: fixed(s.peak, 2),
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
