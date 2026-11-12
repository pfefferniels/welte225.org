// The body a hum is read back into: VocalTractLab's speaker, moved by four things a hummer does.
// The lungs push (pressure), the vocal folds close more or less (adduction, from breathy to modal),
// they are tensed to a pitch, and the lips part (opening). A sound is taken apart by finding the
// course of these four that makes the model sound as the recording does (inversion.ts).
import { clip } from '../shared/math.ts';
import { SAMPLE_RATE, STATE_STEP, type Seconds } from '../shared/units.ts';
import type { StatePair, VtlEngine } from '../vtl/engine.ts';

/** Samples between two frames of a track: 5 ms, two of VocalTractLab's tract states. */
export const HOP = 2 * STATE_STEP;
/** Frames a second. */
export const FRAME_RATE = SAMPLE_RATE / HOP;
export const frameOf = (t: Seconds): number => Math.round(t * FRAME_RATE);
export const timeOf = (frame: number): Seconds => frame / FRAME_RATE;

/** What the body does, frame by frame. */
export interface Tracks {
  readonly count: number;
  /** The folds' pitch in Hz, carried through where they do not sound. */
  readonly f0: Float32Array;
  /** Lung pressure in dPa (VocalTractLab's unit; a spoken voice has some 8000). 0: no air pushed. */
  readonly pressure: Float32Array;
  /** How far the folds are closed: 0 breathy, 1 modal. */
  readonly adduction: Float32Array;
  /** How far the lips are parted: 0 a hum, 1 an open "a". */
  readonly opening: Float32Array;
}

export const emptyTracks = (count: number): Tracks => ({
  count,
  f0: new Float32Array(count).fill(120),
  pressure: new Float32Array(count),
  adduction: new Float32Array(count),
  opening: new Float32Array(count),
});

/** The speaker's shapes the body moves between. */
export interface Body {
  /** The tract humming: lips closed, the velum low. */
  readonly closed: Float64Array;
  /** The tract on an "a", the lips parted, the nose shut. */
  readonly open: Float64Array;
  /** The glottis from breathy to modal, in equal steps; each shape the 11 control parameters. */
  readonly glottis: readonly Float64Array[];
}

export class BodyError extends Error {
  override name = 'BodyError';
}

/** The hum's shape: the middle of the three hums fitted to the recorded one. */
const CLOSED_SHAPE = 'c3_3';
const OPEN_SHAPE = 'ah';
const GLOTTIS_STEPS = 21;
/** Where the lung pressure sits among the glottis's control parameters, and the pitch. */
const F0 = 0;
const PR = 1;
export const MAX_PRESSURE = 15000;

function shape(xml: string, name: string, param: 'param' | 'control_param'): Float64Array {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`<shape name="${escaped}">([\\s\\S]*?)</shape>`).exec(xml);
  const values = [
    ...(block?.[1] ?? '').matchAll(new RegExp(`<${param} name="\\w+"\\s+value="([^"]+)"`, 'g')),
  ];
  if (values.length === 0) throw new BodyError(`the speaker has no shape ${name}`);
  return Float64Array.from(values, (m) => Number(m[1]));
}

/** The body's shapes, read from the speaker file (data/hummer.speaker.xml). */
export function readBody(speakerXml: string): Body {
  return {
    closed: shape(speakerXml, CLOSED_SHAPE, 'param'),
    open: shape(speakerXml, OPEN_SHAPE, 'param'),
    glottis: Array.from({ length: GLOTTIS_STEPS }, (_, i) =>
      shape(speakerXml, 'g' + String(i).padStart(2, '0'), 'control_param'),
    ),
  };
}

/**
 * The tracks as VocalTractLab's states, one every 2.5 ms, and the lips' opening per ms. Frames
 * [from, to) only; the tract holds the hum's shape and the "a"'s, the engine blends their tubes.
 */
export function statesOf(
  body: Body,
  tracks: Tracks,
  from = 0,
  to = tracks.count,
): { readonly states: StatePair; readonly weight: Float32Array } {
  const frames = to - from;
  const count = frames * 2;
  const tractParams = body.closed.length;
  const glottisParams = body.glottis[0].length;
  const closed = new Float64Array(count * tractParams);
  const open = new Float64Array(count * tractParams);
  const glottis = new Float64Array(count * glottisParams);
  const msPerState = (STATE_STEP / SAMPLE_RATE) * 1000;
  const weight = new Float32Array(Math.ceil(count * msPerState) + 1);
  const at = (track: Float32Array, x: number): number => {
    const i = Math.min(to - 1, from + Math.floor(x));
    const j = Math.min(to - 1, i + 1);
    return track[i] + (x - Math.floor(x)) * (track[j] - track[i]);
  };
  for (let s = 0; s < count; s++) {
    closed.set(body.closed, s * tractParams);
    open.set(body.open, s * tractParams);
    const x = s / 2;
    const a = clip(at(tracks.adduction, x), 0, 1) * (GLOTTIS_STEPS - 1);
    const lo = Math.min(GLOTTIS_STEPS - 2, Math.floor(a));
    const f = a - lo;
    const g = s * glottisParams;
    for (let k = 0; k < glottisParams; k++)
      glottis[g + k] = body.glottis[lo][k] + f * (body.glottis[lo + 1][k] - body.glottis[lo][k]);
    glottis[g + F0] = clip(at(tracks.f0, x), 40, 600);
    glottis[g + PR] = clip(at(tracks.pressure, x), 0, MAX_PRESSURE);
  }
  for (let ms = 0; ms < weight.length; ms++) weight[ms] = clip(at(tracks.opening, ms / msPerState / 2), 0, 1);
  return { states: { closed: { count, tract: closed, glottis }, open: { count, tract: open } }, weight };
}

/** The sound of the tracks' frames [from, to): `HOP` samples a frame. */
export function soundOf(
  engine: VtlEngine,
  body: Body,
  tracks: Tracks,
  from = 0,
  to = tracks.count,
): Float32Array {
  const { states, weight } = statesOf(body, tracks, from, to);
  const out = new Float32Array((to - from) * HOP);
  let filled = 0;
  for (const block of engine.synthesize(states, weight, 0, states.closed.count, { blockStates: 40 })) {
    out.set(block.samples.subarray(0, Math.min(block.samples.length, out.length - filled)), filled);
    filled += block.samples.length;
  }
  return out;
}
