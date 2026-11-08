// Piano (the piece, and its harmonies) and voice each through their own gain, and each sent into
// one room: a natural small hall, the voice a little further into it and after a short pre-delay,
// so it keeps its clarity.
import { seededRandom } from '../shared/math.ts';

export interface AudioGraph {
  readonly context: AudioContext;
  /** Faded out and in around a switch between renderings. */
  readonly master: GainNode;
  /** The piano playing the piece, and playing its harmonies: one fader sets both (see mix.ts). */
  readonly piano: GainNode;
  readonly harmonies: GainNode;
  readonly hum: GainNode;
}

/** The room: reverberation time per band (s), where the bands part (Hz), and its early reflections. */
const ROOM = {
  rt60: { low: 1.6, mid: 1.3, high: 0.6 },
  crossover: { lowMid: 500, midHigh: 4000 },
  /** The diffuse tail starts after the first reflections and swells in over this long (s). */
  tailStart: 0.018,
  tailSwell: 0.045,
  reflections: 14,
  /** The early reflections' energy against the tail's. */
  earlyEnergy: 0.35,
  length: 2.6,
} as const;

/** How much of each source goes into the room (the wet level against the dry), and the voice's pre-delay. */
const SENDS = { wet: Math.pow(10, -16 / 20) * 3, piano: 1, voice: 1.3, voicePredelay: 0.02 } as const;

/**
 * A natural room as an impulse response: a few discrete early reflections, then a diffuse stereo
 * tail whose highs die away sooner than its lows (three bands, each with its own decay).
 */
function roomImpulse(context: AudioContext): AudioBuffer {
  const sr = context.sampleRate;
  const n = Math.floor(ROOM.length * sr);
  const buffer = context.createBuffer(2, n, sr);
  const onePole = (hz: number): number => 1 - Math.exp((-2 * Math.PI * hz) / sr);
  const aLow = onePole(ROOM.crossover.lowMid);
  const aHigh = onePole(ROOM.crossover.midHigh);
  const decay = (rt60: number): number => Math.exp(-6.9078 / (rt60 * sr));
  const dLow = decay(ROOM.rt60.low);
  const dMid = decay(ROOM.rt60.mid);
  const dHigh = decay(ROOM.rt60.high);
  const start = Math.floor(ROOM.tailStart * sr);
  const swell = ROOM.tailSwell * sr;

  for (let ch = 0; ch < 2; ch++) {
    const random = seededRandom(11 + ch);
    const d = buffer.getChannelData(ch);
    // the tail: noise split into three bands (which sum back to the noise), each decaying at its rate
    let lp1 = 0;
    let lp2 = 0;
    let gLow = 1;
    let gMid = 1;
    let gHigh = 1;
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const x = random.normal(0, 1);
      lp1 += aLow * (x - lp1);
      lp2 += aHigh * (x - lp2);
      const y = lp1 * gLow + (lp2 - lp1) * gMid + (x - lp2) * gHigh;
      gLow *= dLow;
      gMid *= dMid;
      gHigh *= dHigh;
      const k = i - start;
      const envelope = k < 0 ? 0 : k >= swell ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * k) / swell);
      d[i] = y * envelope;
      energy += d[i] * d[i];
    }
    const norm = 1 / Math.sqrt(energy);
    for (let i = 0; i < n; i++) d[i] *= norm;

    // early reflections: sparse, decaying, at slightly different times in each ear
    const taps: [number, number][] = [];
    let tapEnergy = 0;
    for (let r = 0; r < ROOM.reflections; r++) {
      const t = 0.004 + r * 0.0042 + random.uniform(-0.0015, 0.0015);
      const amp = Math.pow(0.84, r) * (random.uniform(0, 1) < 0.5 ? -1 : 1);
      taps.push([Math.floor(t * sr), amp]);
      tapEnergy += amp * amp;
    }
    const tapScale = Math.sqrt(ROOM.earlyEnergy / tapEnergy);
    for (const [at, amp] of taps) {
      // a reflection loses its highest highs: three samples rather than one
      for (let s = 0; s < 3; s++) if (at + s < n) d[at + s] += amp * tapScale * [0.5, 0.35, 0.15][s];
    }
  }
  return buffer;
}

export function createAudioGraph(): AudioGraph {
  const context = new AudioContext();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  const master = context.createGain();
  master.connect(limiter);
  limiter.connect(context.destination);

  const room = context.createConvolver();
  room.normalize = false;
  room.buffer = roomImpulse(context);
  const wet = context.createGain();
  wet.gain.value = SENDS.wet;
  room.connect(wet);
  wet.connect(master);

  const pianoSend = context.createGain();
  pianoSend.gain.value = SENDS.piano;
  pianoSend.connect(room);
  const piano = context.createGain();
  const harmonies = context.createGain();
  for (const bus of [piano, harmonies]) {
    bus.connect(master);
    bus.connect(pianoSend);
  }

  const hum = context.createGain();
  const humSend = context.createGain();
  const predelay = context.createDelay(0.1);
  humSend.gain.value = SENDS.voice;
  predelay.delayTime.value = SENDS.voicePredelay;
  hum.connect(master);
  hum.connect(humSend);
  humSend.connect(predelay);
  predelay.connect(room);
  return { context, master, piano, harmonies, hum };
}
