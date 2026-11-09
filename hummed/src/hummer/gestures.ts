// From the voice's decisions to gestural tiers: the pitch line, the mouth, the effort.
import { clip, groupBy, interp, seededRandom } from '../shared/math.ts';
import { PAD_MS, type Ms } from '../shared/units.ts';
import { TONGUE_TIP_CLOSURE, type ArticulatorMove } from './articulators.ts';
import type { Calibration, HumStyle } from './style.ts';
import { runs, segment, splice, type Tier, type Tiers } from './tiers.ts';
import type { Clock } from './clock.ts';
import type { DynamicsCurve, Note } from './performance.ts';
import {
  eventsOf,
  HUMS,
  OPEN_MAX,
  OPEN_SHAPES,
  type OpenShape,
  type VocalEvent,
  type VocalEventOf,
} from './vocal-map.ts';

/** How fast each kind of gesture reaches its target (VocalTractLab's time constants), ms. */
export const TIME_CONSTANT_MS = {
  posture: 30,
  glottis: 30,
  pitch: 30,
  pressure: 12,
  lip: 12,
  tongueTip: 12,
  velum: 15,
} as const;

/**
 * VocalTractLab moves each gesture towards its target as a fifth-order critically damped system: a
 * change is half done 4.67 time constants after the target changes (the median of an Erlang(5)).
 * Where a gesture must land on a moment (a pitch, a consonant, a dip of breath), its target changes
 * that much earlier.
 */
const MIDPOINT = 4.67;
const lagOf = (timeConstantMs: Ms): Ms => MIDPOINT * timeConstantMs;
/** The voice sounds this much before the piano note it follows. */
export const LATENCY_MS: Ms = 15;

/** The voice's effort from the dynamics: pressure (dPa) and the glottis's closing. */
const EFFORT = { vRef: 45, pRef: 7000, exponent: 1.5, breathyAt: 33, modalAt: 48, stepMs: 30 } as const;
/** Voiceless air: the lung pressure at depth 1 for each passage (dPa), and what it fades to. */
export const AIR = { teeth: 4000, lips: 8000, fade: 0.25 } as const;
/**
 * How the air written into the line is breathed out: 'hiss' through the passage it names (the
 * tongue tip or the lower lip at the teeth, the lips parted); 'nose', a sigh with the lips as they
 * are and the velum low; 'mouth', the same sigh with the lips parting a little.
 */
export const AIR_OUT: { sound: 'hiss' | 'nose' | 'mouth'; pressure: number; opening: number } = {
  sound: 'nose',
  pressure: 12000,
  opening: 0.6,
};
/** Lung pressure while breathing in, at depth 1 (dPa). */
const BREATH_PRESSURE = 1400;

export interface PitchEvent {
  /** The sung note's `xml:id` in the reduction. */
  readonly id: string;
  readonly on: Ms;
  /** The pitch in semitones above 1 Hz, as VocalTractLab counts. */
  readonly st: number;
  readonly glide: readonly [Ms, Ms] | null;
  readonly note: Note;
}

export interface Gestures {
  readonly tiers: Tiers;
  /** The consonants' articulators, to move in the tract states (see articulators.ts). */
  readonly moves: readonly ArticulatorMove[];
  /** How far the lips are open, per ms, 0 to 1: blends the two scores' tubes. */
  readonly weight: Float32Array;
  readonly endMs: Ms;
  /** Where the voice is silent: ms of the rendering where it may be cut without a seam. */
  readonly silences: readonly Ms[];
}

/**
 * Where the lungs have pushed no air for `SILENT_AFTER` and push none for `SILENT_BEFORE` more:
 * places to cut the rendering. The voice dies away slowly once the lungs stop (the folds go on
 * vibrating, some 0.3 dB a millisecond): 250 ms after, it is some 100 dB down.
 */
const SILENT_AFTER: Ms = 250;
const SILENT_BEFORE: Ms = 30;
export function silences(pressure: Tier<number>): Ms[] {
  const out: Ms[] = [];
  let quietFrom: Ms | null = null;
  for (const g of [...pressure].sort((a, b) => a.start - b.start)) {
    if (g.value === 0) {
      quietFrom ??= g.start;
      if (g.end - quietFrom >= SILENT_AFTER + SILENT_BEFORE) {
        const at = quietFrom + SILENT_AFTER;
        if (out.at(-1) !== at) out.push(at);
      }
    } else quietFrom = null;
  }
  return out;
}

/** A sequence of keyed values at times, interpolated linearly, held after the last. */
type Keys<V> = [Ms, V][];
function valueAt(keys: Keys<number>, t: Ms): number {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
  if (i + 1 < keys.length) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    return v0 + (v1 - v0) * ((t - t0) / Math.max(1e-9, t1 - t0));
  }
  return keys[i][1];
}
/** As `valueAt`, multiplying before dividing: the effort's phrase factor has always been read so. */
function factorAt(keys: Keys<number>, t: Ms): number {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
  if (i + 1 < keys.length) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-9, t1 - t0);
  }
  return keys[i][1];
}
function vectorAt(keys: Keys<readonly number[]>, t: Ms): number[] {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
  if (i + 1 < keys.length) {
    const [t0, v0] = keys[i];
    const [, v1] = keys[i + 1];
    const f = (t - t0) / Math.max(1e-9, keys[i + 1][0] - t0);
    return v0.map((x, j) => x + (v1[j] - x) * f);
  }
  return [...keys[i][1]];
}

/**
 * Air breathed out as a sigh: the glottis open, the lungs pushing gently once it is, then letting
 * go; the velum as the hum has it, low, so that the air goes out through the nose; for 'mouth' the
 * lips also part a little and close again.
 */
function sigh(tiers: Tiers, weight: Float32Array, s: Ms, end: Ms, depth: number): void {
  // open by the time the lungs push again (its target early by its lag), else the sigh starts voiced
  tiers.glottal = splice(tiers.glottal, s - lagOf(TIME_CONSTANT_MS.glottis), end, 'h');
  const p0 = AIR_OUT.pressure * depth;
  const a0 = s + 40;
  const a1 = Math.min(a0 + 100, end - 40);
  tiers.pressure = splice(tiers.pressure, a0, a0 + (a1 - a0) / 2, Math.round(0.5 * p0));
  tiers.pressure = splice(tiers.pressure, a0 + (a1 - a0) / 2, a1, Math.round(p0));
  const steps = 10;
  for (let k = 0; k < steps; k++) {
    const x0 = a1 + ((end - 40 - a1) * k) / steps;
    const x1 = a1 + ((end - 40 - a1) * (k + 1)) / steps;
    if (x1 > x0)
      tiers.pressure = splice(tiers.pressure, x0, x1, Math.round(p0 * Math.pow(AIR.fade, (k + 1) / steps)));
  }
  if (AIR_OUT.sound !== 'mouth') return;
  for (let i = Math.max(0, Math.floor(s)); i < Math.min(weight.length, Math.ceil(end + 120)); i++)
    weight[i] = Math.max(
      weight[i],
      AIR_OUT.opening * clip(Math.min((i - s) / 150, (end + 120 - i) / 150), 0, 1),
    );
}

/**
 * The mouth: base shapes (mixes of the three hums, in 10 % steps) and the phrase's open shape as
 * two vowel tiers, and the opening amount, lagged like VocalTractLab's gestures, as the weight.
 */
function postures(events: readonly [Ms, VocalEventOf<'posture'>][], endMs: Ms) {
  let amount: Keys<number> = [[0, 0]];
  let mix: Keys<readonly number[]> = [[0, [1, 0, 0]]];
  const toward: [Ms, OpenShape | null][] = [[0, null]];
  for (const [t, e] of [...events].sort((a, b) => a[0] - b[0])) {
    const target = HUMS.map((h) => (h === e.hum ? 1 : 0));
    const a0 = valueAt(amount, t);
    const w0 = vectorAt(mix, t);
    amount = amount
      .filter((p) => p[0] < t)
      .concat([
        [t, a0],
        [t + e.transitionMs, e.amount],
      ]);
    mix = mix
      .filter((p) => p[0] < t)
      .concat([
        [t, w0],
        [t + e.transitionMs, target],
      ]);
    toward.push([t, e.toward]);
  }
  toward[0] = [0, toward.length > 1 ? toward[1][1] : OPEN_SHAPES[0]];

  const step = 60;
  const closed: string[] = [];
  const open: string[] = [];
  const stair: number[] = [];
  const times: Ms[] = [];
  let ti = 0;
  for (let t = 0; t < endMs; t += step) {
    const q = vectorAt(mix, t).map((x) => Math.round(x * 10));
    const sum = q[0] + q[1] + q[2];
    q[q.indexOf(Math.max(...q))] += 10 - sum;
    while (ti + 1 < toward.length && toward[ti + 1][0] <= t) ti++;
    closed.push(`c${q[0]}_${q[1]}`);
    open.push(`${toward[ti][1] ?? OPEN_SHAPES[0]}_${q[0]}_${q[1]}`);
    stair.push(Math.round(valueAt(amount, t) * 100) / 100);
    times.push(t);
  }

  // five first-order lags, as VocalTractLab's target approximation moves a gesture
  const n = Math.ceil(endMs);
  const weight = new Float32Array(n);
  const alpha = 1 / TIME_CONSTANT_MS.posture;
  const y = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    let x = stair[Math.min(Math.floor(i / step), stair.length - 1)];
    for (let k = 0; k < 5; k++) {
      y[k] += alpha * (x - y[k]);
      x = y[k];
    }
    weight[i] = clip(x / OPEN_MAX, 0, 1);
  }
  return { vowelClosed: runs(times, closed, endMs), vowelOpen: runs(times, open, endMs), weight };
}

/**
 * The effort: lung pressure from the dynamics (each note offset by how its velocity stands to the
 * curve), shaped by the phrase factors and dipped at pulses and stops; and the glottis, breathy
 * when soft, closing toward modal voice when loud. Sampled every 30 ms and around articulations.
 */
function effort(
  pressureEvents: readonly [Ms, VocalEventOf<'pressure'>][],
  articulations: readonly [Ms, VocalEventOf<'articulation'>][],
  pitches: readonly PitchEvent[],
  endMs: Ms,
  dynamics: DynamicsCurve,
  calibration: Calibration,
) {
  const n = Math.ceil(endMs);
  const offset = new Float64Array(n);
  const hz = new Float64Array(n).fill(130);
  const cal = new Float64Array(n);
  pitches.forEach((p, k) => {
    const i0 = k === 0 ? 0 : Math.max(0, Math.floor(p.on));
    const i1 = k + 1 < pitches.length ? Math.floor(pitches[k + 1].on) : n;
    const o = p.note.velocity - interp(p.note.onMs / 1000, dynamics.times, dynamics.values);
    const h = Math.pow(2, p.st / 12);
    const c = calibration.notes[p.id] ?? 0;
    for (let i = i0; i < Math.min(i1, n); i++) {
      offset[i] = o;
      hz[i] = h;
      cal[i] = c;
    }
  });
  // a 60 ms centred mean, the edges held
  const smooth = (x: Float64Array): Float64Array => {
    const out = new Float64Array(n);
    const pre = new Float64Array(n + 61);
    for (let i = 0; i < n + 60; i++) pre[i + 1] = pre[i] + x[clip(i - 30, 0, n - 1)];
    for (let i = 0; i < n; i++) out[i] = (pre[i + 60] - pre[i]) / 60;
    return out;
  };
  const offsetS = smooth(offset);
  const calS = smooth(cal);

  const factor: [Ms, number][] = [[0, 0]];
  for (const [t, e] of [...pressureEvents].sort((a, b) => a[0] - b[0])) {
    const before = factorAt(factor, t - 0.5);
    const start = e.from ?? factorAt(factor, t);
    const keep = factor.filter((p) => p[0] < t - 0.5);
    factor.length = 0;
    factor.push(...keep, [t - 0.5, before], [t, start], [t + Math.max(1, e.transitionMs), e.factor]);
  }
  const fx = factor.map((p) => p[0]);
  const fy = factor.map((p) => p[1]);

  const dip = new Float64Array(n).fill(1);
  const fine: Ms[] = [];
  // each dip of breath where it is meant to be heard: its target that much earlier (see MIDPOINT)
  for (const [t, a] of articulations) {
    const s0 = t - lagOf(TIME_CONSTANT_MS.pressure);
    const d = a.durationMs;
    const depth = a.type === 'stop' ? 0 : a.depth;
    const down = Math.min(25, d / 3);
    const up = Math.min(depth > 0 ? 35 : 25, d / 3);
    const xs = [s0, s0 + down, s0 + d - up, s0 + d];
    const ys = [1, depth, depth, 1];
    for (let i = Math.max(0, Math.floor(s0)); i < Math.min(n, Math.ceil(s0 + d) + 1); i++)
      dip[i] = Math.min(dip[i], interp(i, xs, ys));
    for (let t = s0 - 10; t < s0 + d + 10; t += 10) fine.push(t);
  }

  const pressure = new Float64Array(n);
  const adduction = new Float64Array(n);
  const logHz = [Math.log2(175), Math.log2(260), Math.log2(400)];
  for (let i = 0; i < n; i++) {
    const v = Math.max(
      1,
      interp((i - PAD_MS + LATENCY_MS) / 1000, dynamics.times, dynamics.values) + offsetS[i],
    );
    const register = interp(Math.log2(hz[i]), logHz, [-0.8, 0, -3.1]);
    pressure[i] = Math.min(
      15000,
      EFFORT.pRef *
        Math.pow(v / EFFORT.vRef, EFFORT.exponent) *
        Math.pow(10, (calS[i] - register) / 20) *
        interp(i, fx, fy) *
        dip[i],
    );
    adduction[i] = clip((v - EFFORT.breathyAt) / (EFFORT.modalAt - EFFORT.breathyAt), 0, 1);
  }

  const gridSet = new Set<Ms>();
  for (let t = 0; t < endMs; t += EFFORT.stepMs) gridSet.add(t);
  for (const t of fine) gridSet.add(clip(Math.round(t), 0, Math.floor(endMs) - 1));
  const grid = [...gridSet].sort((a, b) => a - b);
  const sample = (x: Float64Array, t: Ms): number => x[Math.min(n - 1, Math.floor(t))];
  // pressure in steps of 0.5 %, so that runs of equal values make few gestures
  const quantum = Math.log(1.005);
  const pq = grid.map((t) => {
    const p = sample(pressure, t);
    return p < 1 ? 0 : Math.round(Math.exp(Math.round(Math.log(p) / quantum) * quantum) * 10) / 10;
  });
  const gq = grid.map((t) => 'g' + String(Math.round(sample(adduction, t) * 20)).padStart(2, '0'));
  return { pressure: runs(grid, pq, endMs), glottal: runs(grid, gq, endMs) };
}

/**
 * The pitch line: for each sung note a target that holds still (a moving one would overshoot: the
 * pitch would go on at its speed past the next), taking over early enough that the pitch is half
 * way there when the note is heard, or in the middle of a slide. A breath-led note scoops up from
 * below; a note lands a little off its pitch and settles nearer it, never quite on it; the pitch
 * wobbles about it; a phrase's last note falls. How loose all this is, is `approximateness`:
 * from 0 (close, the wobble as measured) to 1 (later, further off, slower to settle, wider).
 */
function pitchLine(
  pitches: readonly PitchEvent[],
  inflections: readonly [Ms, VocalEventOf<'inflection'>][],
  endMs: Ms,
  style: HumStyle,
  approximateness: number,
): { readonly f0: Tier<number>; readonly timeConstantMs: Ms } {
  const a = clip(approximateness, 0, 1);
  const random = seededRandom(1);
  const timeConstantMs = TIME_CONSTANT_MS.pitch + 10 * a;
  const lead = lagOf(timeConstantMs);
  // the voice follows the piano: half way to a new pitch this long after the note (and LATENCY_MS)
  const follow = 10 + 40 * a;
  const lateness = 25 * a;
  const landSd = 0.1 + 0.3 * a;
  const settleMs = 160 + 120 * a;
  const keep = 0.35;
  const wobble = (style.wobbleCents / 100) * Math.SQRT1_2 * (0.85 + 0.5 * a);
  const step = 125 * (1 + 0.6 * a);
  const scoopScale = 0.8 * (0.8 + 0.4 * a);
  const fallScale = 0.75 + 0.5 * a;

  // when each note's target takes over, in order
  const takeover: Ms[] = [];
  for (const p of pitches) {
    const heard = p.glide ? (p.glide[0] + p.glide[1]) / 2 : p.on;
    const at = heard + LATENCY_MS + follow + random.normal(0, 1) * lateness - lead;
    takeover.push(Math.max(at, (takeover.at(-1) ?? -Infinity) + 40));
  }

  const f0: Tier<number> = [];
  const hold = (t0: Ms, t1: Ms, st: number): void => {
    if (t1 > t0) f0.push(segment(t0, t1, st));
  };
  pitches.forEach((p, i) => {
    const start = Math.max(0, takeover[i]);
    const next = i + 1 < pitches.length ? takeover[i + 1] : endMs;
    const nextOn = i + 1 < pitches.length ? pitches[i + 1].on : endMs;
    const off = random.normal(0, 1) * landSd;
    let t = start;
    const scoop = inflections.find(([at, e]) => e.type === 'scoop' && p.on - 300 <= at && at <= p.on + 50);
    if (scoop) {
      const low = Math.min(next, t + 0.45 * scoop[1].durationMs);
      hold(t, low, p.st + scoop[1].depthSt * scoopScale);
      t = low;
    }
    const fall = inflections.find(([at, e]) => e.type === 'fall' && p.on < at && at < nextOn);
    const stop = fall ? clip(fall[0], t + 40, next) : next;
    const settled = Math.min(stop, t + settleMs);
    hold(t, settled, p.st + off);
    t = settled;
    while (t < stop - 1) {
      const t1 = Math.min(stop, t + step * random.uniform(0.7, 1.3));
      hold(t, t1, p.st + keep * off + random.normal(0, 1) * wobble);
      t = t1;
    }
    if (fall) hold(stop, next, p.st + keep * off + fall[1].depthSt * fallScale);
  });
  return { f0, timeConstantMs };
}

export interface GesturesInput {
  readonly notes: readonly Note[];
  readonly events: readonly VocalEvent[];
  readonly clock: Clock;
  readonly dynamics: DynamicsCurve;
  readonly style: HumStyle;
  readonly calibration: Calibration;
  /** How loosely the voice keeps to the written pitch, 0 to 1 (see `pitchLine`). */
  readonly approximateness: number;
}

export function gestures(input: GesturesInput): Gestures {
  const { notes, events, clock, dynamics, style, calibration, approximateness } = input;
  const T = (date: number): Ms => clock.toMs(date) + PAD_MS - LATENCY_MS;
  const timed = <K extends VocalEvent['tag']>(tag: K): [Ms, VocalEventOf<K>][] =>
    eventsOf(events, tag).map((e) => [T(e.date), e]);

  let endMs = 0;
  for (const n of notes) endMs = Math.max(endMs, n.endMs, n.onMs);
  endMs += PAD_MS + 1500;
  const chords = groupBy(notes, (n) => n.date);

  const pitches: PitchEvent[] = eventsOf(events, 'pitch').map((e) => {
    const st = 12 * Math.log2(440 * Math.pow(2, (e.pitch - 69) / 12));
    const on = e.note.onMs + PAD_MS - LATENCY_MS;
    let glide: [Ms, Ms] | null = null;
    if (e.portamento) {
      const chord = chords.get(e.note.date) ?? [e.note];
      glide = [Math.min(...chord.map((c) => c.onMs)) + PAD_MS - LATENCY_MS, on];
    } else if (e.glideMs) glide = [on - e.glideMs / 2, on + e.glideMs / 2];
    return { id: e.id, on, st, glide, note: e.note };
  });

  const mouth = postures(timed('posture'), endMs);
  const velum = timed('velum');
  const force = effort(timed('pressure'), timed('articulation'), pitches, endMs, dynamics, calibration);
  const pitch = pitchLine(pitches, timed('inflection'), endMs, style, approximateness);
  const tiers: Tiers = {
    f0: pitch.f0,
    f0TimeConstantMs: pitch.timeConstantMs,
    lip: [],
    tongueTip: [],
    vowelClosed: mouth.vowelClosed,
    vowelOpen: mouth.vowelOpen,
    velic: velum.map(([t, e], i) => segment(t, i + 1 < velum.length ? velum[i + 1][0] : endMs, e.value)),
    pressure: force.pressure,
    glottal: force.glottal,
  };
  const weight = mouth.weight;

  // breathing in: the glottis open, a little pressure toward the end
  for (const e of eventsOf(events, 'breath')) {
    const s = T(e.date);
    const end = T(e.date + e.duration);
    tiers.glottal = splice(tiers.glottal, s, end, 'h');
    tiers.pressure = splice(
      tiers.pressure,
      s + 0.3 * (end - s),
      end - 40,
      Math.round(BREATH_PRESSURE * e.depth),
    );
  }

  // voiceless air: the glottis open, the velum closed, the tongue tip (s) or the lower lip (f) at
  // the teeth, the lips parted; a breath out, not a held hiss: in over 120 ms, then fading
  for (const e of eventsOf(events, 'air')) {
    const s = T(e.date);
    const end = T(e.date + e.durationTicks);
    if (AIR_OUT.sound !== 'hiss') {
      sigh(tiers, weight, s, end, e.depth);
      continue;
    }
    tiers.glottal = splice(tiers.glottal, s, end, 'voiceless-fricative');
    tiers.velic = splice(tiers.velic, s - 30, end, 0);
    const p0 = AIR[e.through] * e.depth;
    const a0 = s + 30;
    const a1 = Math.min(a0 + 120, end - 40);
    tiers.pressure = splice(tiers.pressure, a0, a0 + (a1 - a0) / 2, Math.round(0.5 * p0));
    tiers.pressure = splice(tiers.pressure, a0 + (a1 - a0) / 2, a1, Math.round(p0));
    const steps = 10;
    for (let k = 0; k < steps; k++) {
      const x0 = a1 + ((end - 40 - a1) * k) / steps;
      const x1 = a1 + ((end - 40 - a1) * (k + 1)) / steps;
      if (x1 > x0)
        tiers.pressure = splice(tiers.pressure, x0, x1, Math.round(p0 * Math.pow(AIR.fade, (k + 1) / steps)));
    }
    if (e.through === 'lips') tiers.lip.push(segment(s, end, 'll-dental-fricative'));
    else tiers.tongueTip.push(segment(s, end, 'tt-alveolar-fricative'));
    for (let i = Math.max(0, Math.floor(s - 80)); i < Math.min(weight.length, Math.ceil(end + 80)); i++)
      weight[i] = Math.max(weight[i], Math.min(1, (i - (s - 80)) / 80, (end + 80 - i) / 80));
  }

  // the lips close between notes where the mouth was open and the voice stops
  for (const e of eventsOf(events, 'lips')) {
    const s = T(e.date);
    tiers.lip.push(segment(s, s + e.durationMs, 'll-labial-closure'));
  }

  // consonants: the tongue tip closes at the ridge behind the teeth and lets go as the note begins,
  // moved in the tract states (articulators.ts), not as a gesture. For an 'n' the velum stays low
  // and the voice goes on through the nose; for a 'd' the velum closes (its target early by its lag),
  // so that the air pressed behind the tongue bursts out as it lets go. The lips stay as they are.
  const moves: ArticulatorMove[] = [];
  for (const e of eventsOf(events, 'consonant')) {
    const on = T(e.date);
    const close = on - e.durationMs;
    moves.push({ to: TONGUE_TIP_CLOSURE, from: close, until: on });
    if (e.sound !== 'd') continue;
    const velum = lagOf(TIME_CONSTANT_MS.velum);
    tiers.velic = splice(tiers.velic, close - 20 - velum, on + 15 - velum, 0);
  }
  return { tiers, moves, weight, endMs, silences: silences(tiers.pressure) };
}
