// The voice in fragments: silent where the MPM has nothing to convey.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Clock, readPerformance, renderVoice, repair } from '../src/hummer/index.ts';
import { melodyOf, takeBreaths, voiceNotes } from '../src/hummer/melody.ts';
import { readDynamics } from '../src/hummer/performance.ts';
import { activity, noteSalience, quietSpans } from '../src/hummer/salience.ts';
import { eventsOf } from '../src/hummer/vocal-map.ts';
import { fragmentation } from '../src/worker/levels.ts';
import { loadReduction, loadStyle, voicePerformance } from '../tools/node-support.ts';

const p = voicePerformance();
const { notes, sustain } = readPerformance(p.performance);
repair(notes);
const clock = new Clock(notes, sustain);
const melody = takeBreaths(melodyOf(loadReduction(), notes, clock), sustain);
const voice = voiceNotes(melody);
const dynamics = readDynamics(p.dynamics);
const salience = noteSalience(melody, dynamics, clock);
const endMs = Math.max(...voice.map((v) => v.off * 1000)) + 1000;
const spans = quietSpans(activity(melody, voice, salience, dynamics, endMs), voice, p.fragmentation);

describe('the voice in fragments', () => {
  it('weighs every note between 0 and 1, and every phrase’s first note fully', () => {
    assert.equal(salience.length, melody.length);
    for (const s of salience) assert.ok(s >= 0 && s <= 1);
    melody.forEach((n, k) => {
      if (n.breathBefore) assert.equal(salience[k], 1, n.id);
    });
    assert.ok(salience.filter((s) => s < 0.5).length >= 5);
  });

  it('falls silent only within sung stretches, long enough to die away, never at a phrase’s start', () => {
    assert.ok(spans.length >= 5, `${spans.length} silences`);
    for (const [a, b] of spans) {
      assert.ok(b - a >= 1100, `${a}–${b}`);
      assert.ok(
        voice.some((v) => v.on * 1000 <= a && a < v.off * 1000),
        `${a} in a note`,
      );
      for (const n of melody) if (n.breathBefore) assert.ok(n.onsetMs <= a || n.onsetMs >= b - 1, n.id);
    }
  });

  it('is silent for a tenth of the sung time or so, a little more the more of the piano there is', () => {
    const sung = voice.reduce((s, v) => s + (v.off - v.on) * 1000, 0);
    const silent = spans.reduce((s, [a, b]) => s + b - a, 0);
    assert.ok(silent / sung > 0.05 && silent / sung < 0.2, `${((100 * silent) / sung).toFixed(0)} %`);
    assert.ok(fragmentation(0) < fragmentation(0.65) && fragmentation(0.65) < fragmentation(1));
  });

  it('sounds through every sung stretch when fragmentation is 0 (as the calibration renders it)', () => {
    const base = {
      ...p,
      reduction: loadReduction(),
      style: loadStyle(),
      calibration: { gain: 1, notes: {} },
    };
    assert.equal(eventsOf(renderVoice({ ...base, fragmentation: 0 }).events, 'quiet').length, 0);
    assert.equal(eventsOf(renderVoice(base).events, 'quiet').length, spans.length);
  });
});
