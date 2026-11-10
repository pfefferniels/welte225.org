// Where the voice is heard: where the MPM's maps move, and quiet where none of them does.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Clock, readPerformance, renderVoice, repair } from '../src/hummer/index.ts';
import { melodyOf, takeBreaths, voiceNotes } from '../src/hummer/melody.ts';
import { readDynamics } from '../src/hummer/performance.ts';
import { movement, presence, SURFACING, surfacings } from '../src/hummer/presence.ts';
import { eventsOf, MOUTH } from '../src/hummer/vocal-map.ts';
import { THRESHOLD } from '../src/worker/levels.ts';
import { loadReduction, loadStyle, voicePerformance } from '../tools/node-support.ts';

const at = (elaboration?: number) => {
  const p = voicePerformance(elaboration);
  const { notes, sustain } = readPerformance(p.performance);
  repair(notes);
  const clock = new Clock(notes, sustain);
  const melody = takeBreaths(melodyOf(loadReduction(), notes, clock), sustain);
  const voice = voiceNotes(melody);
  const dynamics = readDynamics(p.dynamics);
  const endMs = Math.max(...voice.map((v) => v.off * 1000)) + 1000;
  const moving = movement(melody, voice, dynamics, clock, endMs);
  const heard = presence(moving, p.threshold);
  const sung = new Uint8Array(moving.length);
  for (const v of voice) for (let i = Math.floor(v.on * 100); i < Math.floor(v.off * 100); i++) sung[i] = 1;
  const spans = surfacings(heard);
  return { p, dynamics, voice, moving, heard, spans, sung };
};
const start = at();
const alone = at(0);
const share = (x: typeof start): number =>
  x.heard.reduce((s, v, i) => s + (x.sung[i] && v > SURFACING.heard ? 1 : 0), 0) /
  x.sung.reduce((s, v) => s + v, 0);

describe('the maps’ movement', () => {
  it('is measured wherever a note is sung, and nowhere else', () => {
    const { moving, sung } = start;
    moving.forEach((x, i) => {
      assert.ok(x >= 0 && Number.isFinite(x), `${i * 10} ms`);
      if (!sung[i]) assert.equal(x, 0, `${i * 10} ms`);
    });
    assert.ok(Math.max(...moving) > 1);
  });

  it('is large in a hairpin and small where the dynamics and the tempo hold still', () => {
    const { moving, sung, dynamics } = start;
    const D = (t: number): number => {
      let i = 0;
      while (i + 1 < dynamics.times.length && dynamics.times[i + 1] <= t) i++;
      return dynamics.values[i];
    };
    // the steepest second of the dynamics among the sung ones
    let steepest = 0;
    let where = 0;
    for (let i = 100; i < moving.length - 100; i++) {
      const slope = Math.abs(D(i / 100 + 0.5) - D(i / 100 - 0.5));
      if (sung[i] && slope > steepest) {
        steepest = slope;
        where = i;
      }
    }
    assert.ok(moving[where] > THRESHOLD, `${moving[where]} at ${where * 10} ms`);
    const still = moving.filter((x, i) => sung[i] && x < THRESHOLD * SURFACING.from).length;
    assert.ok(still > 500, `${still / 100} s without movement`);
  });

  it('is greater the barer the music: the MPM exaggerated moves its maps more', () => {
    const mean = (x: typeof start): number =>
      x.moving.reduce((s, v) => s + v, 0) / x.sung.reduce((s, v) => s + v, 0);
    assert.ok(mean(alone) > mean(start));
  });
});

describe('the voice that is heard', () => {
  it('is heard for more than half of what is sung, not for all of it, and more alone', () => {
    assert.ok(share(start) > 0.5 && share(start) < 0.8, `${(100 * share(start)).toFixed(0)} %`);
    assert.ok(share(alone) > share(start));
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
    assert.ok(presence(start.moving, 0).every((v) => v === 1));
    const base = {
      ...start.p,
      reduction: loadReduction(),
      style: loadStyle(),
      calibration: { gain: 1, notes: {} },
    };
    assert.equal(eventsOf(renderVoice({ ...base, threshold: 0 }).events, 'surface').length, 0);
    const voice = renderVoice(base);
    assert.equal(eventsOf(voice.events, 'surface').length, start.spans.length);
    assert.ok(eventsOf(voice.events, 'surface').every((e) => e.peak >= SURFACING.heard && e.peak <= 1));
  });

  it('fades by the lungs alone: the glottis keeps the shapes the dynamics give it', () => {
    const voice = renderVoice({
      ...start.p,
      reduction: loadReduction(),
      style: loadStyle(),
      calibration: { gain: 1, notes: {} },
    });
    const tier =
      voice.closedScore.split('type="glottal-shape-gestures"')[1]?.split('</gesture_sequence>')[0] ?? '';
    const shapes = new Set([...tier.matchAll(/value="([^"]+)"/g)].map((m) => m[1]));
    assert.ok(shapes.size > 1);
    for (const shape of shapes) assert.match(shape, /^(g\d\d|h)$/);
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
