// VocalTractLab as a streaming voice: gestural scores -> tract states (its gestural model) ->
// tube shapes (its geometry, only where the tract has moved) -> its acoustics, one 110-sample
// step at a time. The lips-closed and lips-open scores give two tubes; the opening blends them,
// so the lips part gradually (VocalTractLab's own lip model parts them with a jump).
import type { VtlModule } from './module.ts';

export class VtlError extends Error {
  override name = 'VtlError';
}

export interface Constants {
  readonly sampleRate: number;
  readonly tubeSections: number;
  readonly tractParams: number;
  readonly glottisParams: number;
  /** Audio samples per tract state. */
  readonly step: number;
}

/** A gestural score's tract states, one per step. */
export interface TractStates {
  readonly count: number;
  readonly tract: Float64Array;
}

/** A gestural score as tract and glottis states, one per step. */
export interface States extends TractStates {
  readonly glottis: Float64Array;
}

/** The two scores of the voice. The glottis is the closed score's: the scores differ in the mouth alone. */
export interface StatePair {
  readonly closed: States;
  readonly open: TractStates;
}

interface Tube {
  readonly length: Float64Array;
  readonly area: Float64Array;
  articulator: Int32Array;
  incisor: number;
  tongueTipSide: number;
  velum: number;
}

export interface SynthesisOptions {
  /** Tract states per block handed out. */
  readonly blockStates: number;
  /**
   * How far the tract may move (in its own units) before the tube is computed anew: 0.03 by default,
   * which changes the spectrum by 0.03 dB (median) against computing it every step, a tenth faster.
   */
  readonly tolerance?: number;
  /** Tract states between computed tube shapes (4: every 10 ms). */
  readonly keyframe?: number;
}

/** A block of audio and the tract state its first sample belongs to. */
export interface AudioBlock {
  readonly samples: Float32Array;
  readonly firstState: number;
}

export class VtlEngine {
  readonly constants: Constants;
  readonly #m: VtlModule;
  readonly #mem: Readonly<
    Record<'tract' | 'glottis' | 'audio' | 'length' | 'area' | 'articulator' | 'scalars', number>
  >;

  constructor(module: VtlModule, speakerXml: string) {
    this.#m = module;
    module.FS.writeFile('/hummer.speaker', speakerXml);
    if (module.ccall('vtlInitialize', 'number', ['string'], ['/hummer.speaker']) !== 0)
      throw new VtlError('VocalTractLab did not accept the speaker');
    const p = module._malloc(32);
    module.ccall('vtlGetConstants', 'number', Array<'number'>(6).fill('number'), [
      p,
      p + 4,
      p + 8,
      p + 12,
      p + 16,
      p + 24,
    ]);
    this.constants = {
      sampleRate: module.getValue(p, 'i32'),
      tubeSections: module.getValue(p + 4, 'i32'),
      tractParams: module.getValue(p + 8, 'i32'),
      glottisParams: module.getValue(p + 12, 'i32'),
      step: module.getValue(p + 16, 'i32'),
    };
    module._free(p);
    const c = this.constants;
    this.#mem = {
      tract: module._malloc(8 * c.tractParams),
      glottis: module._malloc(8 * c.glottisParams),
      audio: module._malloc(8 * c.step),
      length: module._malloc(8 * c.tubeSections),
      area: module._malloc(8 * c.tubeSections),
      articulator: module._malloc(4 * c.tubeSections),
      scalars: module._malloc(24),
    };
  }

  // the views go stale when the heap grows, so they are taken anew each time
  #f64(): Float64Array {
    const m = this.#m;
    return m.HEAPF64 ?? new Float64Array(m.wasmMemory?.buffer ?? this.#buffer());
  }
  #i32(): Int32Array {
    const m = this.#m;
    return m.HEAP32 ?? new Int32Array(m.wasmMemory?.buffer ?? this.#buffer());
  }
  #buffer(): ArrayBuffer {
    if (!this.#m.buffer) throw new VtlError('the module exposes no heap');
    return this.#m.buffer;
  }

  /** The tract and glottis states of a gestural score (at most `maxStates`). */
  states(score: string, maxStates: number): States {
    const m = this.#m;
    const c = this.constants;
    m.FS.writeFile('/score.ges', score);
    const tract = m._malloc(8 * c.tractParams * maxStates);
    const glottis = m._malloc(8 * c.glottisParams * maxStates);
    const count = m._malloc(4);
    try {
      const result = m.ccall(
        'vtlGesturalScoreToStates',
        'number',
        ['string', 'number', 'number', 'number', 'number'],
        ['/score.ges', tract, glottis, maxStates, count],
      );
      if (result !== 0) throw new VtlError(`VocalTractLab rejected the gestural score (${result})`);
      const n = m.getValue(count, 'i32');
      const heap = this.#f64();
      return {
        count: n,
        tract: heap.slice(tract >> 3, (tract >> 3) + n * c.tractParams),
        glottis: heap.slice(glottis >> 3, (glottis >> 3) + n * c.glottisParams),
      };
    } finally {
      m._free(tract);
      m._free(glottis);
      m._free(count);
    }
  }

  /** The tube of one tract state, copied out of the module. */
  #tube(tract: Float64Array, i: number): Tube {
    const m = this.#m;
    const { tractParams, tubeSections } = this.constants;
    const mem = this.#mem;
    this.#f64().set(tract.subarray(i * tractParams, (i + 1) * tractParams), mem.tract >> 3);
    m._vtlFastTractToTube(
      mem.tract,
      mem.length,
      mem.area,
      mem.articulator,
      mem.scalars,
      mem.scalars + 8,
      mem.scalars + 16,
    );
    const f64 = this.#f64();
    const s = mem.scalars >> 3;
    return {
      length: f64.slice(mem.length >> 3, (mem.length >> 3) + tubeSections),
      area: f64.slice(mem.area >> 3, (mem.area >> 3) + tubeSections),
      articulator: this.#i32().slice(mem.articulator >> 2, (mem.articulator >> 2) + tubeSections),
      incisor: f64[s],
      tongueTipSide: f64[s + 1],
      velum: f64[s + 2],
    };
  }

  /**
   * Tube shapes at keyframes, each computed only if the tract has moved since the last one,
   * and interpolated in between, as VocalTractLab interpolates within a step.
   */
  #keyframes(tract: Float64Array, count: number, tolerance: number, keyframe: number): (i: number) => Tube {
    const { tractParams, tubeSections } = this.constants;
    let lastIndex = -1;
    let lastTube: Tube | null = null;
    const cache = new Map<number, Tube>();
    const moved = (i: number): boolean => {
      if (lastIndex < 0) return true;
      for (let k = 0; k < tractParams; k++)
        if (Math.abs(tract[i * tractParams + k] - tract[lastIndex * tractParams + k]) > tolerance)
          return true;
      return false;
    };
    const at = (k: number): Tube => {
      k = Math.min(k, count - 1);
      const cached = cache.get(k);
      if (cached) return cached;
      let tube: Tube;
      if (lastTube && !moved(k)) tube = lastTube;
      else {
        tube = this.#tube(tract, k);
        lastTube = tube;
        lastIndex = k;
      }
      if (cache.size > 4) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(k, tube);
      return tube;
    };
    const out: Tube = {
      length: new Float64Array(tubeSections),
      area: new Float64Array(tubeSections),
      articulator: new Int32Array(tubeSections),
      incisor: 0,
      tongueTipSide: 0,
      velum: 0,
    };
    return (i) => {
      const k0 = Math.floor(i / keyframe) * keyframe;
      const a = at(k0);
      const b = at(k0 + keyframe);
      if (a === b) return a;
      const f = (i - k0) / keyframe;
      for (let j = 0; j < tubeSections; j++) {
        out.length[j] = a.length[j] + f * (b.length[j] - a.length[j]);
        out.area[j] = a.area[j] + f * (b.area[j] - a.area[j]);
      }
      out.articulator = f < 0.5 ? a.articulator : b.articulator;
      out.incisor = a.incisor + f * (b.incisor - a.incisor);
      out.tongueTipSide = a.tongueTipSide + f * (b.tongueTipSide - a.tongueTipSide);
      out.velum = a.velum + f * (b.velum - a.velum);
      return out;
    };
  }

  /**
   * The voice from state `from` up to `to`, in blocks: states i..j sound from sample i·step to
   * (j−1)·step. The caller may stop between blocks and yield to its event loop. `weight` is the
   * lips' opening per ms, 0 (closed tube) to 1 (open tube).
   */
  *synthesize(
    states: StatePair,
    weight: Float32Array,
    from: number,
    to: number,
    options: SynthesisOptions,
  ): Generator<AudioBlock> {
    const m = this.#m;
    const c = this.constants;
    const mem = this.#mem;
    const { blockStates, tolerance = 0.03, keyframe = 4 } = options;
    const msPerState = (c.step / c.sampleRate) * 1000;
    const count = states.closed.count;
    const closedAt = this.#keyframes(states.closed.tract, count, tolerance, keyframe);
    const openAt = this.#keyframes(states.open.tract, count, tolerance, keyframe);
    m._vtlSynthesisReset();
    let block = new Float32Array(blockStates * c.step);
    let filled = 0;
    let blockStart = from + 1;
    const end = Math.min(to, count);
    for (let i = from; i < end; i++) {
      const w = weight[Math.min(weight.length - 1, Math.floor(i * msPerState))];
      // each tube only while it is heard: the open one while the lips are parted at all
      const closed = w < 1 ? closedAt(i) : null;
      const open = w > 0 ? openAt(i) : null;
      const a = closed ?? open;
      const b = open ?? closed;
      if (!a || !b) throw new VtlError('no tube to synthesize');
      const mix = closed && open ? w : 0;
      const f64 = this.#f64();
      const i32 = this.#i32();
      const L = mem.length >> 3;
      const A = mem.area >> 3;
      const R = mem.articulator >> 2;
      for (let k = 0; k < c.tubeSections; k++) {
        f64[L + k] = a.length[k] + mix * (b.length[k] - a.length[k]);
        f64[A + k] = a.area[k] + mix * (b.area[k] - a.area[k]);
        i32[R + k] = mix < 0.5 ? a.articulator[k] : b.articulator[k];
      }
      f64.set(
        states.closed.glottis.subarray(i * c.glottisParams, (i + 1) * c.glottisParams),
        mem.glottis >> 3,
      );
      m._vtlSynthesisAddTube(
        i === from ? 0 : c.step,
        mem.audio,
        mem.length,
        mem.area,
        mem.articulator,
        a.incisor + mix * (b.incisor - a.incisor),
        a.velum + mix * (b.velum - a.velum),
        a.tongueTipSide + mix * (b.tongueTipSide - a.tongueTipSide),
        mem.glottis,
      );
      if (i > from) {
        block.set(this.#f64().subarray(mem.audio >> 3, (mem.audio >> 3) + c.step), filled * c.step);
        if (++filled === blockStates) {
          yield { samples: block, firstState: blockStart };
          block = new Float32Array(blockStates * c.step);
          filled = 0;
          blockStart = i + 1;
        }
      }
    }
    if (filled > 0) yield { samples: block.subarray(0, filled * c.step), firstState: blockStart };
  }
}
