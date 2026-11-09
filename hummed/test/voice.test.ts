// The whole voice at ×1 (the voice at ×1.3): its gestural scores and opening, against a fingerprint
// taken when the TypeScript port was shown to match the JavaScript it replaced byte for byte.
// After an intended change:  UPDATE_GOLDEN=1 npm test
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  Clock,
  dynamicsRange,
  readPerformance,
  renderVoice,
  repair,
  type Voice,
} from '../src/hummer/index.ts';
import { melodyOf, takeBreaths } from '../src/hummer/melody.ts';
import { loadReduction, loadScore, loadStyle, voicePerformance } from '../tools/node-support.ts';
import { assertGolden } from './golden.ts';

// no calibration: the fingerprint is the hummer's, not the latest calibration run's
const base = (elaboration?: number) => ({
  ...voicePerformance(elaboration),
  reduction: loadReduction(),
  style: loadStyle(),
});
const render = (): Voice => renderVoice({ ...base(), calibration: { gain: 1, notes: {} } });
const fingerprint = (v: Voice): string =>
  createHash('sha256')
    .update(v.closedScore)
    .update(v.openScore)
    .update(new Uint8Array(v.weight.buffer))
    .digest('hex');

describe('the voice', () => {
  const voice = render();

  it('is the same every time', () => {
    assert.equal(fingerprint(render()), fingerprint(voice));
  });

  it('matches its fingerprint', () => {
    assertGolden('voiceAt1', fingerprint(voice));
  });

  it('breathes, hums every sung note and sighs out twice', () => {
    const count = (tag: string) => voice.events.filter((e) => e.tag === tag).length;
    assert.equal(count('pitch'), 114);
    assert.ok(count('breath') >= 25);
    assert.equal(count('air'), 2);
    // as a sigh through the nose, not a hiss at the teeth or the lips
    assert.doesNotMatch(voice.openScore, /alveolar-fricative|dental-fricative/);
  });

  it('breathes more often than written, but only where the performance leaves room', () => {
    const { performance } = voicePerformance();
    const { notes, sustain } = readPerformance(performance);
    repair(notes);
    const written = melodyOf(loadReduction(), notes, new Clock(notes, sustain));
    const melody = takeBreaths(written, sustain);
    const taken = melody.filter((n) => n.breathTaken);
    assert.ok(taken.length >= 5, `${taken.length} breaths taken`);
    let last = -Infinity;
    melody.forEach((n, k) => {
      if (!n.breathBefore) return;
      if (n.breathTaken) {
        const prev = melody[k - 1];
        const gap = n.onsetMs - prev.keyOffMs;
        const lifted = sustain.some((p) => Math.abs(p.ms - n.onsetMs) <= 250 && p.value < 64);
        assert.ok(gap >= 140 || (prev.keyOffMs - prev.onsetMs >= 1000 && lifted), n.id);
        assert.ok(n.onsetMs - last >= 2500, n.id);
      }
      last = n.onsetMs;
    });
  });

  it('articulates as the piano does: a detached note with a d, a portato or repeated one with an n', () => {
    const consonants = voice.events.flatMap((e) => (e.tag === 'consonant' ? [e] : []));
    const stops = voice.events.filter((e) => e.tag === 'articulation' && e.type === 'stop').length;
    const pulses = voice.events.filter((e) => e.tag === 'articulation' && e.type === 'pulse').length;
    assert.equal(consonants.filter((c) => c.sound === 'd').length, stops);
    assert.equal(consonants.filter((c) => c.sound === 'n').length, pulses);
    assert.ok(consonants.length >= 10);
    // the tongue tip alone, moved in the tract states: no consonant gesture moves the whole mouth
    assert.equal(voice.moves.length, consonants.length);
    assert.doesNotMatch(voice.closedScore, /tt-alveolar-closure/);
    assert.ok(voice.moves.every((m) => Object.keys(m.to).every((p) => ['TTX', 'TTY', 'TS3'].includes(p))));
  });

  it('lets a phrase sag a little at its end, no more than a semitone', () => {
    const falls = voice.events.flatMap((e) =>
      e.tag === 'inflection' && e.type === 'fall' ? [e.depthSt] : [],
    );
    assert.ok(falls.length >= 30);
    assert.ok(falls.every((d) => d <= -0.3 && d >= -0.8));
  });

  it('reads loudness against the reconstruction’s own range of dynamics', () => {
    const range = dynamicsRange(loadScore().mpm);
    assert.ok(range.low < range.high);
    assert.ok(range.low > 0 && range.high < 127);
  });

  it('opens the lips only as far as the open score allows', () => {
    assert.ok(voice.weight.every((w) => w >= 0 && w <= 1));
    assert.equal(voice.weight.length, Math.ceil(voice.endMs));
  });

  // the f0 gestures of a score: target (semitones), slope, time constant (ms)
  const pitchTargets = (v: Voice): { st: number; slope: number; tauMs: number }[] => {
    const tier = v.closedScore.split('type="f0-gestures"')[1]?.split('</gesture_sequence>')[0] ?? '';
    return [
      ...tier.matchAll(/value="([-\d.]+)" slope="([-\d.]+)" duration_s="[\d.]+" time_constant_s="([\d.]+)"/g),
    ].map((m) => ({ st: Number(m[1]), slope: Number(m[2]), tauMs: Number(m[3]) * 1000 }));
  };

  it('holds every pitch target still: a sliding one would carry the pitch past the next', () => {
    const targets = pitchTargets(voice);
    assert.ok(targets.length > 500);
    assert.ok(targets.every((g) => g.slope === 0));
  });

  it('keeps more loosely to the pitch the barer the music around it', () => {
    // how far the targets lie from the nearest written pitch (equal temperament, A4 = 440 Hz)
    const looseness = (v: Voice): { off: number; tauMs: number } => {
      const targets = pitchTargets(v);
      const grid = 12 * Math.log2(440) - Math.floor(12 * Math.log2(440));
      const offs = targets.map((g) => Math.abs(g.st - grid - Math.round(g.st - grid))).sort((x, y) => x - y);
      return { off: offs[offs.length >> 1] ?? 0, tauMs: targets[0]?.tauMs ?? 0 };
    };
    const alone = looseness(renderVoice({ ...base(0), calibration: { gain: 1, notes: {} } }));
    const underPiece = looseness(renderVoice({ ...base(1), calibration: { gain: 1, notes: {} } }));
    assert.ok(alone.off > 1.5 * underPiece.off, `${alone.off} against ${underPiece.off}`);
    assert.ok(alone.tauMs > underPiece.tauMs && alone.tauMs <= 40);
  });
});
