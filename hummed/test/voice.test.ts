// The whole voice at ×1 (the voice at ×1.3): its gestural scores and opening, against a fingerprint
// taken when the TypeScript port was shown to match the JavaScript it replaced byte for byte.
// After an intended change:  UPDATE_GOLDEN=1 npm test
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  Clock,
  dynamicsRange,
  readDynamics,
  readPerformance,
  renderVoice,
  repair,
  sungLine,
  type Voice,
} from '../src/hummer/index.ts';
import { TONGUE_A, VELUM_SHUT } from '../src/hummer/articulators.ts';
import { BREATHING, findBreaths, type MelodyNote } from '../src/hummer/melody.ts';
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

  it('breathes and hums every sung note', () => {
    const count = (tag: string) => voice.events.filter((e) => e.tag === tag).length;
    assert.equal(count('pitch'), 122);
    assert.ok(count('breath') >= 25);
  });

  it('breathes at its rests, and in the line apart from other breaths and often enough', () => {
    const p = voicePerformance();
    const { notes, sustain } = readPerformance(p.performance);
    repair(notes);
    const { melody } = sungLine({
      reduction: loadReduction(),
      notes,
      sustain,
      clock: new Clock(notes, sustain),
      dynamics: readDynamics(p.dynamics),
      turns: p.turns,
      threshold: p.threshold,
    });
    const breaths = melody.filter((n, k) => k === 0 || n.breathBefore);
    assert.ok(breaths.filter((n) => n.breathTaken).length >= 5);
    breaths.slice(1).forEach((n, i) => {
      const before = breaths[i];
      const sung = (n.onsetMs - before.onsetMs) / 1000;
      if (n.breathTaken || before.breathTaken) assert.ok(sung >= BREATHING.everyS, n.id);
      // where it can: a stretch beyond `withinS` costs, it is not forbidden (8.03 s before h114)
      assert.ok(sung <= BREATHING.withinS + 0.1, `${n.id}: ${sung} s`);
    });
  });

  it('breathes where the MPM turns back up, if nothing else speaks for a breath', () => {
    const note = (k: number): MelodyNote => ({
      id: `n${k}`,
      note: {
        id: `p${k}`,
        pitch: 48,
        date: k * 720,
        duration: 720,
        velocity: 60,
        ornamented: false,
        onMs: k * 1000,
        endMs: (k + 1) * 1000,
      },
      pitch: 48,
      date: k * 720,
      onsetMs: k * 1000,
      keyOffMs: (k + 1) * 1000,
      velocity: 60,
      ornamented: false,
      breathBefore: k === 0,
      breathTaken: false,
    });
    const melody = Array.from({ length: 20 }, (_, k) => note(k));
    const cues = { sustain: [], turns: { dynamics: [6 * 720, 13 * 720], tempo: [] }, quiet: () => 0 };
    const breathed = findBreaths(melody, cues).flatMap((n, k) => (n.breathTaken ? [k] : []));
    assert.deepEqual(breathed, [6, 13]);
  });

  it('articulates as the piano does: a detached note with a d, a portato or repeated one with an n', () => {
    const consonants = voice.events.flatMap((e) => (e.tag === 'consonant' ? [e] : []));
    const stops = voice.events.filter(
      (e) => e.tag === 'articulation' && e.type === 'stop' && !e.breaks,
    ).length;
    const pulses = voice.events.filter((e) => e.tag === 'articulation' && e.type === 'pulse').length;
    assert.equal(consonants.filter((c) => c.sound === 'd').length, stops);
    assert.equal(consonants.filter((c) => c.sound === 'n').length, pulses);
    assert.ok(consonants.length >= 10);
    // the tongue tip alone, moved in the tract states: no consonant gesture moves the whole mouth
    // (beside them the tongue's way to the "a" where the mouth opens)
    const tips = voice.moves.filter((m) => m.to !== TONGUE_A && m.to !== VELUM_SHUT);
    assert.equal(tips.length, consonants.length);
    assert.doesNotMatch(voice.closedScore, /tt-alveolar-closure/);
    assert.ok(tips.every((m) => Object.keys(m.to).every((p) => ['TTX', 'TTY', 'TS3'].includes(p))));
  });

  it('slides no further than a fourth: a wider step it breaks, silent before the note', () => {
    const pitches = voice.events.flatMap((e) => (e.tag === 'pitch' ? [e] : []));
    const breaks = voice.events.filter((e) => e.tag === 'articulation' && e.type === 'stop' && e.breaks);
    let wide = 0;
    pitches.slice(1).forEach((p, i) => {
      if (Math.abs(p.pitch - pitches[i].pitch) <= 5) {
        assert.equal(p.breakMs, undefined, p.id);
        return;
      }
      wide++;
      assert.ok(p.breakMs !== undefined && p.breakMs > 0, p.id);
      assert.ok(!p.portamento && p.glideMs === undefined, p.id);
    });
    // a detached step is silent already, behind its 'd'; any other the voice breaks
    const detached = pitches.filter((p) =>
      voice.events.some((e) => e.tag === 'consonant' && e.sound === 'd' && e.date === p.date && p.breakMs),
    );
    assert.ok(wide >= 9);
    assert.equal(breaks.length, wide - detached.length);
    // silent behind the velum, shut in the tract states as the tongue tip is
    assert.equal(voice.moves.filter((m) => m.to === VELUM_SHUT).length, breaks.length);
  });

  it('lets a phrase sag a little at its end, no more than a semitone', () => {
    const falls = voice.events.flatMap((e) =>
      e.tag === 'inflection' && e.type === 'fall' ? [e.depthSt] : [],
    );
    assert.ok(falls.length >= 25);
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
