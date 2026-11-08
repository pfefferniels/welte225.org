// Pink Trombone (Neil Thapen, 2017, MIT licence), its glottis and waveguide tract run offline
// and driven by the shared control curves instead of a mouse. The LF glottis takes our f0 and a
// tenseness that follows the dynamics; the 44-section Kelly-Lochbaum tract with its nasal branch
// hums with the lips closed and the velum open ('m'), or sings [u] with lips rounded ('u').
//
// Usage: node pinktrombone_render.mjs controls.json out.raw m|u
// Writes raw float32 mono at 44100 Hz.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , ctrlPath, outPath, vowel = 'm'] = process.argv;
const C = JSON.parse(readFileSync(ctrlPath, 'utf8'));
const sampleRate = 44100;
const BLOCK = 128;
const blockTime = BLOCK / sampleRate;

// smooth value noise in place of the original simplex noise
function makeNoise(seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const table = Float64Array.from({ length: 4096 }, rnd);
  return (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return table[i & 4095] * (1 - u) + table[(i + 1) & 4095] * u;
  };
}
const simplex = makeNoise(7);
let white = 1234567;
const whiteNoise = () => ((white = (white * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;

// biquad band-pass on white noise, as the original feeds aspiration through one at 500 Hz
function bandpass(f, q) {
  const w = 2 * Math.PI * f / sampleRate, al = Math.sin(w) / (2 * q);
  const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * Math.cos(w), a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
const aspFilter = bandpass(500, 0.5);

const Glottis = {
  timeInWaveform: 0, totalTime: 0, oldFrequency: 140, newFrequency: 140, oldTenseness: 0.6,
  newTenseness: 0.6, tenseness: 0.6, intensity: 0, loudness: 1,
  runStep(lambda, noiseSource) {
    const timeStep = 1.0 / sampleRate;
    this.timeInWaveform += timeStep;
    this.totalTime += timeStep;
    if (this.timeInWaveform > this.waveformLength) {
      this.timeInWaveform -= this.waveformLength;
      this.setupWaveform(lambda);
    }
    let out = this.normalizedLFWaveform(this.timeInWaveform / this.waveformLength);
    let aspiration = this.intensity * (1 - Math.sqrt(this.tenseness)) * this.getNoiseModulator() * noiseSource;
    aspiration *= 0.2 + 0.02 * simplex(this.totalTime * 1.99);
    return out + aspiration;
  },
  getNoiseModulator() {
    const voiced = 0.1 + 0.2 * Math.max(0, Math.sin(Math.PI * 2 * this.timeInWaveform / this.waveformLength));
    return this.tenseness * this.intensity * voiced + (1 - this.tenseness * this.intensity) * 0.3;
  },
  setupWaveform(lambda) {
    this.frequency = this.oldFrequency * (1 - lambda) + this.newFrequency * lambda;
    const tenseness = this.oldTenseness * (1 - lambda) + this.newTenseness * lambda;
    let Rd = 3 * (1 - tenseness);
    this.waveformLength = 1.0 / this.frequency;
    Rd = Math.min(2.7, Math.max(0.5, Rd));
    const Ra = -0.01 + 0.048 * Rd;
    const Rk = 0.224 + 0.118 * Rd;
    const Rg = (Rk / 4) * (0.5 + 1.2 * Rk) / (0.11 * Rd - Ra * (0.5 + 1.2 * Rk));
    const Ta = Ra, Tp = 1 / (2 * Rg), Te = Tp + Tp * Rk;
    const epsilon = 1 / Ta;
    const shift = Math.exp(-epsilon * (1 - Te));
    const Delta = 1 - shift;
    let RHSIntegral = (1 / epsilon) * (shift - 1) + (1 - Te) * shift;
    RHSIntegral = RHSIntegral / Delta;
    const totalLowerIntegral = -(Te - Tp) / 2 + RHSIntegral;
    const totalUpperIntegral = -totalLowerIntegral;
    const omega = Math.PI / Tp;
    const s = Math.sin(omega * Te);
    const y = -Math.PI * s * totalUpperIntegral / (Tp * 2);
    const z = Math.log(y);
    const alpha = z / (Tp / 2 - Te);
    const E0 = -1 / (s * Math.exp(alpha * Te));
    Object.assign(this, { alpha, E0, epsilon, shift, Delta, Te, omega });
  },
  normalizedLFWaveform(t) {
    const output = t > this.Te ? (-Math.exp(-this.epsilon * (t - this.Te)) + this.shift) / this.Delta
      : this.E0 * Math.exp(this.alpha * t) * Math.sin(this.omega * t);
    return output * this.intensity * this.loudness;
  },
};

const moveTowards = (cur, target, up, down) => (cur < target ? Math.min(cur + up, target) : Math.max(cur - down, target));

const Tract = {
  n: 44, bladeStart: 10, tipStart: 32, lipStart: 39, glottalReflection: 0.75, lipReflection: -0.85,
  fade: 1.0, movementSpeed: 15, lipOutput: 0, noseOutput: 0, velumTarget: 0.01,
  init() {
    const n = this.n;
    this.diameter = new Float64Array(n); this.restDiameter = new Float64Array(n);
    this.targetDiameter = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const d = i < 7 * n / 44 - 0.5 ? 0.6 : (i < 12 * n / 44 ? 1.1 : 1.5);
      this.diameter[i] = this.restDiameter[i] = this.targetDiameter[i] = d;
    }
    this.R = new Float64Array(n); this.L = new Float64Array(n);
    this.reflection = new Float64Array(n + 1); this.newReflection = new Float64Array(n + 1);
    this.junctionOutputR = new Float64Array(n + 1); this.junctionOutputL = new Float64Array(n + 1);
    this.A = new Float64Array(n);
    this.noseLength = Math.floor(28 * n / 44);
    this.noseStart = n - this.noseLength + 1;
    const nl = this.noseLength;
    this.noseR = new Float64Array(nl); this.noseL = new Float64Array(nl);
    this.noseJunctionOutputR = new Float64Array(nl + 1); this.noseJunctionOutputL = new Float64Array(nl + 1);
    this.noseReflection = new Float64Array(nl + 1); this.noseDiameter = new Float64Array(nl);
    this.noseA = new Float64Array(nl);
    for (let i = 0; i < nl; i++) {
      const d = 2 * (i / nl);
      this.noseDiameter[i] = Math.min(d < 1 ? 0.4 + 1.6 * d : 0.5 + 1.5 * (2 - d), 1.9);
    }
    this.newReflectionLeft = this.newReflectionRight = this.newReflectionNose = 0;
    this.calculateReflections();
    this.calculateNoseReflections();
    this.noseDiameter[0] = this.velumTarget;
  },
  // TractUI.setRestDiameter: tongue body as a raised cosine around tongueIndex
  setTongue(tongueIndex, tongueDiameter) {
    const gridOffset = 1.7;
    for (let i = this.bladeStart; i < this.lipStart; i++) {
      const t = 1.1 * Math.PI * (tongueIndex - i) / (this.tipStart - this.bladeStart);
      const fixedTongueDiameter = 2 + (tongueDiameter - 2) / 1.5;
      let curve = (1.5 - fixedTongueDiameter + gridOffset) * Math.cos(t);
      if (i === this.bladeStart - 2 || i === this.lipStart - 1) curve *= 0.8;
      if (i === this.bladeStart || i === this.lipStart - 2) curve *= 0.94;
      this.restDiameter[i] = 1.5 - curve;
    }
    for (let i = 0; i < this.n; i++) this.targetDiameter[i] = this.restDiameter[i];
  },
  reshapeTract(deltaTime) {
    const amount = deltaTime * this.movementSpeed;
    for (let i = 0; i < this.n; i++) {
      let slowReturn;
      if (i < this.noseStart) slowReturn = 0.6;
      else if (i >= this.tipStart) slowReturn = 1.0;
      else slowReturn = 0.6 + 0.4 * (i - this.noseStart) / (this.tipStart - this.noseStart);
      this.diameter[i] = moveTowards(this.diameter[i], this.targetDiameter[i], slowReturn * amount, 2 * amount);
    }
    this.noseDiameter[0] = moveTowards(this.noseDiameter[0], this.velumTarget, amount * 0.25, amount * 0.1);
    this.noseA[0] = this.noseDiameter[0] * this.noseDiameter[0];
  },
  calculateReflections() {
    for (let i = 0; i < this.n; i++) this.A[i] = this.diameter[i] * this.diameter[i];
    for (let i = 1; i < this.n; i++) {
      this.reflection[i] = this.newReflection[i];
      this.newReflection[i] = this.A[i] === 0 ? 0.999 : (this.A[i - 1] - this.A[i]) / (this.A[i - 1] + this.A[i]);
    }
    this.reflectionLeft = this.newReflectionLeft;
    this.reflectionRight = this.newReflectionRight;
    this.reflectionNose = this.newReflectionNose;
    const sum = this.A[this.noseStart] + this.A[this.noseStart + 1] + this.noseA[0];
    this.newReflectionLeft = (2 * this.A[this.noseStart] - sum) / sum;
    this.newReflectionRight = (2 * this.A[this.noseStart + 1] - sum) / sum;
    this.newReflectionNose = (2 * this.noseA[0] - sum) / sum;
  },
  calculateNoseReflections() {
    for (let i = 0; i < this.noseLength; i++) this.noseA[i] = this.noseDiameter[i] * this.noseDiameter[i];
    for (let i = 1; i < this.noseLength; i++)
      this.noseReflection[i] = (this.noseA[i - 1] - this.noseA[i]) / (this.noseA[i - 1] + this.noseA[i]);
  },
  runStep(glottalOutput, lambda) {
    const n = this.n, R = this.R, L = this.L, jR = this.junctionOutputR, jL = this.junctionOutputL;
    jR[0] = L[0] * this.glottalReflection + glottalOutput;
    jL[n] = R[n - 1] * this.lipReflection;
    for (let i = 1; i < n; i++) {
      const r = this.reflection[i] * (1 - lambda) + this.newReflection[i] * lambda;
      const w = r * (R[i - 1] + L[i]);
      jR[i] = R[i - 1] - w;
      jL[i] = L[i] + w;
    }
    let i = this.noseStart;
    let r = this.newReflectionLeft * (1 - lambda) + this.reflectionLeft * lambda;
    jL[i] = r * R[i - 1] + (1 + r) * (this.noseL[0] + L[i]);
    r = this.newReflectionRight * (1 - lambda) + this.reflectionRight * lambda;
    jR[i] = r * L[i] + (1 + r) * (R[i - 1] + this.noseL[0]);
    r = this.newReflectionNose * (1 - lambda) + this.reflectionNose * lambda;
    this.noseJunctionOutputR[0] = r * this.noseL[0] + (1 + r) * (L[i] + R[i - 1]);
    for (let k = 0; k < n; k++) {
      R[k] = jR[k] * 0.999;
      L[k] = jL[k + 1] * 0.999;
    }
    this.lipOutput = R[n - 1];
    const nl = this.noseLength, nR = this.noseR, nL = this.noseL, njR = this.noseJunctionOutputR, njL = this.noseJunctionOutputL;
    njL[nl] = nR[nl - 1] * this.lipReflection;
    for (let k = 1; k < nl; k++) {
      const w = this.noseReflection[k] * (nR[k - 1] + nL[k]);
      njR[k] = nR[k - 1] - w;
      njL[k] = nL[k] + w;
    }
    for (let k = 0; k < nl; k++) {
      nR[k] = njR[k] * this.fade;
      nL[k] = njL[k + 1] * this.fade;
    }
    this.noseOutput = nR[nl - 1];
  },
  finishBlock() {
    this.reshapeTract(blockTime);
    this.calculateReflections();
  },
};

Tract.init();
if (vowel === 'm') {
  Tract.setTongue(21, 3.0);                       // neutral tongue
  for (let i = Tract.lipStart; i < Tract.n; i++) Tract.targetDiameter[i] = 0;   // lips closed
  Tract.velumTarget = 0.4;                        // velum open, as the original's nasal touch
} else {
  Tract.setTongue(15, 2.05);                      // back, raised tongue: [u]
  for (let i = Tract.lipStart; i < Tract.n; i++) Tract.targetDiameter[i] = 0.35;  // rounded lips
}
for (let i = 0; i < Tract.n; i++) Tract.diameter[i] = Tract.targetDiameter[i];
Tract.noseDiameter[0] = Tract.velumTarget;
Tract.calculateNoseReflections();
Tract.calculateReflections();
Tract.calculateReflections();
Glottis.setupWaveform(0);

const nCtrl = C.f0.length;
const nSamples = Math.floor(nCtrl / C.cr * sampleRate);
const out = new Float32Array(nSamples);
const ctrlAt = (arr, t) => {
  const x = t * C.cr, i = Math.min(nCtrl - 2, Math.floor(x)), f = x - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
};
for (let b = 0; b * BLOCK < nSamples; b++) {
  const t = (b + 1) * BLOCK / sampleRate;
  const f0 = ctrlAt(C.f0, t), level = ctrlAt(C.level, t), env = ctrlAt(C.env, t);
  // our contour already holds vibrato and drift; tenseness follows the dynamics
  Glottis.oldFrequency = Glottis.newFrequency;
  Glottis.newFrequency = f0;
  Glottis.oldTenseness = Glottis.newTenseness;
  Glottis.tenseness = Math.min(0.85, Math.max(0.35, 0.45 + (level + 28) / 14 * 0.3));
  Glottis.newTenseness = Glottis.tenseness + 0.03 * simplex(Glottis.totalTime * 0.46);
  Glottis.intensity = env;
  Glottis.loudness = Math.pow(10, (level + 20) / 20);   // amplitude follows the dynamics in dB
  for (let j = 0; j < BLOCK && b * BLOCK + j < nSamples; j++) {
    const l1 = j / BLOCK, l2 = (j + 0.5) / BLOCK;
    const g = Glottis.runStep(l1, aspFilter(whiteNoise()));
    let v = 0;
    Tract.runStep(g, l1); v += Tract.lipOutput + Tract.noseOutput;
    Tract.runStep(g, l2); v += Tract.lipOutput + Tract.noseOutput;
    out[b * BLOCK + j] = v * 0.125;
  }
  Tract.finishBlock();
}
writeFileSync(outPath, Buffer.from(out.buffer));
console.log('pink trombone', vowel, (nSamples / sampleRate).toFixed(1), 's');
