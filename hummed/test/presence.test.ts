// The inner voice and where it is heard: only over a threshold, softly, and never for long.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Clock, readPerformance, renderVoice, repair } from '../src/hummer/index.ts';
import { melodyOf, takeBreaths, voiceNotes } from '../src/hummer/melody.ts';
import { readDynamics } from '../src/hummer/performance.ts';
import { innerVoice, noteImpulse, presence, SURFACING, surfacings } from '../src/hummer/presence.ts';
import { eventsOf, MOUTH } from '../src/hummer/vocal-map.ts';
import { threshold } from '../src/worker/levels.ts';
import { loadReduction, loadStyle, voicePerformance } from '../tools/node-support.ts';

const at = (elaboration?: number) => {
  const p = voicePerformance(elaboration);
  const { notes, sustain } = readPerformance(p.performance);
  repair(notes);
  const clock = new Clock(notes, sustain);
  const melody = takeBreaths(melodyOf(loadReduction(), notes, clock), sustain);
  const voice = voiceNotes(melody);
  const dynamics = readDynamics(p.dynamics);
  const impulse = noteImpulse(melody, dynamics, clock);
  const endMs = Math.max(...voice.map((v) => v.off * 1000)) + 1000;
  const inner = innerVoice(melody, voice, impulse, dynamics, endMs);
  const heard = presence(inner, p.threshold);
  const sung = voice.reduce((s, v) => s + (v.off - v.on) * 1000, 0);
  const spans = surfacings(heard);
  return { p, melody, voice, impulse, inner, heard, spans, sung };
};
const start = at();
const alone = at(0);

describe('the inner voice', () => {
  it('gives every note an impulse between 0 and 1, a phrase’s first note more than a plain one', () => {
    const { melody, impulse } = start;
    assert.equal(impulse.length, melody.length);
    for (const s of impulse) assert.ok(s > 0 && s <= 1);
    const plain = Math.min(...impulse);
    melody.forEach((n, k) => {
      if (n.breathBefore) assert.ok(impulse[k] > plain, n.id);
    });
    assert.ok(impulse.filter((s) => s === plain).length >= 20);
  });

  it('is sung inwardly wherever a note is written, and nowhere else', () => {
    const { voice, inner } = start;
    const sung = new Uint8Array(inner.length);
    for (const v of voice) for (let i = Math.floor(v.on * 100); i < Math.floor(v.off * 100); i++) sung[i] = 1;
    inner.forEach((x, i) => {
      if (!sung[i]) assert.equal(x, 0, `${i * 10} ms`);
    });
    assert.ok(Math.max(...inner) > 0.9);
  });
});

describe('the voice that is heard', () => {
  it('surfaces for a fifth of what is sung or so, more alone than under the piece', () => {
    const fraction = (x: typeof start): number => x.spans.reduce((s, f) => s + f.to - f.from, 0) / x.sung;
    assert.ok(fraction(start) > 0.12 && fraction(start) < 0.32, `${(100 * fraction(start)).toFixed(0)} %`);
    assert.ok(fraction(alone) > fraction(start));
    assert.ok(threshold(0) < threshold(0.65) && threshold(0.65) < threshold(1));
  });

  it('is short of breath: often, briefly, never a long tone or phrase', () => {
    for (const x of [start, alone]) {
      assert.ok(x.spans.length >= 25, `${x.spans.length} times`);
      const longest = Math.max(...x.spans.map((f) => f.to - f.from));
      assert.ok(longest <= 2600, `${longest} ms`);
    }
  });

  it('comes and goes smoothly: no faster than a tenth of itself in 40 ms', () => {
    for (const x of [start, alone]) {
      let steepest = 0;
      for (let i = 4; i < x.heard.length; i++)
        steepest = Math.max(steepest, Math.abs(x.heard[i] - x.heard[i - 4]));
      assert.ok(steepest < 0.2, `${steepest}`);
      assert.ok(x.heard.every((v) => v >= 0 && v <= 1));
    }
  });

  it('is all there when it has no threshold to cross (as the calibration renders it)', () => {
    assert.ok(presence(start.inner, 0).every((v) => v === 1));
    const base = {
      ...start.p,
      reduction: loadReduction(),
      style: loadStyle(),
      calibration: { gain: 1, notes: {} },
    };
    const whole = renderVoice({ ...base, threshold: 0 });
    assert.equal(eventsOf(whole.events, 'surface').length, 0);
    assert.doesNotMatch(whole.closedScore, /value="v\d\d"/);
    const voice = renderVoice(base);
    assert.equal(eventsOf(voice.events, 'surface').length, start.spans.length);
    // the folds swing less where less of it is heard: the speaker's v shapes, 2 dB apart
    assert.match(voice.closedScore, /value="v\d\d"/);
    assert.ok(eventsOf(voice.events, 'surface').every((e) => e.peak >= SURFACING.heard && e.peak <= 1));
  });

  it('is silent between: the lungs rest, so the rendering can be cut there', () => {
    const base = {
      ...start.p,
      reduction: loadReduction(),
      style: loadStyle(),
      calibration: { gain: 1, notes: {} },
    };
    assert.ok(renderVoice(base).seams.length >= 25);
  });
});

describe('the mouth', () => {
  const voiceAt = (elaboration: number) =>
    renderVoice({
      ...voicePerformance(elaboration),
      reduction: loadReduction(),
      style: loadStyle(),
      calibration: { gain: 1, notes: {} },
    });

  it('opens rarely: at the loudest moments, more often alone', () => {
    const opened = (elaboration: number): number =>
      eventsOf(voiceAt(elaboration).events, 'mouth').filter((e) => e.amount > 0).length;
    assert.ok(opened(0.65) >= 1 && opened(0.65) <= 2, `${opened(0.65)} times`);
    assert.ok(opened(0) >= opened(0.65) && opened(0) <= 3, `${opened(0)} times`);
  });

  it('opens and closes slowly and without a corner', () => {
    for (const elaboration of [0, 0.65]) {
      const voice = voiceAt(elaboration);
      for (const e of eventsOf(voice.events, 'mouth')) assert.ok(e.transitionMs >= MOUTH.inMs, 'slow');
      const w = voice.weight;
      let speed = 0;
      let bend = 0;
      for (let i = 2; i < w.length; i++) {
        speed = Math.max(speed, Math.abs(w[i] - w[i - 1]));
        bend = Math.max(bend, Math.abs(w[i] - 2 * w[i - 1] + w[i - 2]));
      }
      // at most the whole way in 1.8 s, at any one moment; and no change of speed to be heard
      assert.ok(speed < 1 / 1800, `${speed} a ms`);
      assert.ok(bend < 2e-6, `${bend}`);
      assert.ok(w.some((x) => x > 0.5));
    }
  });
});
