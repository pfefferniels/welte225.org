// The Pianoteq recordings: their manifest, and that they are of the performance as it is. After a
// change to the reconstruction, the harmonies or the chain, render them again (npm run pianoteq).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { seededRandom } from '../src/shared/math.ts';
import { fingerprint, midiEvents } from '../src/shared/piano.ts';
import {
  elaborationSteps,
  ManifestError,
  parseManifest,
  recordingOf,
  settingName,
} from '../src/shared/recordings.ts';
import { performPiano } from '../src/worker/piano.ts';
import { findLag, lagDrift, loudness, onsetStrength } from '../tools/audio.ts';
import { loadPianoScore, ROOT } from '../tools/node-support.ts';

describe('the recordings’ manifest', () => {
  it('says nothing is rendered while it lists no settings', () => {
    assert.equal(parseManifest({ settings: [] }), null);
  });
  it('refuses a setting without its parts', () => {
    const manifest = {
      instrument: 'x',
      credit: 'x',
      renderer: 'x',
      rendered: '2026-11-08',
      step: 0.05,
      gainDb: 0,
      settings: [{ elaboration: 1, pianoLevel: 1 }],
    };
    assert.throws(() => parseManifest(manifest), ManifestError);
  });
  it('names settings and lays out their steps', () => {
    assert.equal(settingName(1), 'e100');
    assert.equal(settingName(0.05), 'e005');
    assert.deepEqual(elaborationSteps(0.25), [0, 0.25, 0.5, 0.75, 1]);
    assert.equal(elaborationSteps(0.05).length, 21);
  });
});

describe('a recording of a part', () => {
  const part = {
    keys: [
      { on: 1, off: 1.5, pitch: 60, velocity: 40 },
      { on: 2, off: 2.2, pitch: 64, velocity: 50 },
    ],
    sustain: [],
    soft: [],
  };
  const recorded = {
    file: 'x.mp3',
    keys: 2,
    fingerprint: fingerprint(midiEvents(part)),
    seconds: 3,
    lagMs: 0,
    driftMs: 0,
  };
  it('is of the part as it was rendered', () => {
    assert.ok(recordingOf(recorded, part));
  });
  it('is not of the same keys at another tempo', () => {
    const faster = { ...part, keys: part.keys.map((k) => ({ ...k, on: k.on / 1.1, off: k.off / 1.1 })) };
    assert.equal(faster.keys.length, recorded.keys);
    assert.ok(!recordingOf(recorded, faster));
  });
});

describe('the recordings in piano/pianoteq/', () => {
  const manifest = parseManifest(
    JSON.parse(readFileSync(join(ROOT, 'piano/pianoteq/manifest.json'), 'utf8')),
  );
  it('are of the performance as it is now', { skip: manifest ? false : 'none rendered yet' }, () => {
    const score = loadPianoScore();
    for (const setting of manifest?.settings ?? []) {
      const parts = performPiano(score, setting.elaboration);
      for (const name of ['piece', 'harmonies'] as const) {
        const recorded = setting[name];
        const message = `${setting.elaboration} ${name} was rendered from another performance: npm run pianoteq`;
        assert.equal(recorded.keys, parts[name].keys.length, message);
        assert.equal(recorded.fingerprint, fingerprint(midiEvents(parts[name])), message);
      }
    }
  });
});

describe('lining a rendering up', () => {
  const RATE = 44100;
  // a struck tone at each key, the keys as irregular as music, the sound 23 ms late
  const random = seededRandom(7);
  let ms = 600;
  const onsets = Array.from({ length: 40 }, () => ({ ms: (ms += random.uniform(120, 600)), weight: 0.5 }));
  const y = new Float32Array(RATE * 25);
  for (const { ms } of onsets) {
    const a = Math.round(((ms + 23) / 1000) * RATE);
    for (let i = 0; i < RATE && a + i < y.length; i++)
      y[a + i] += 0.3 * Math.exp(-i / (0.3 * RATE)) * Math.sin((2 * Math.PI * 330 * i) / RATE);
  }
  const strength = onsetStrength(y, RATE);

  it('finds how late the sound comes, and that it does not drift', () => {
    const lag = findLag(strength, onsets);
    assert.ok(Math.abs(lag.ms - 23) <= 1, `lag ${lag.ms}`);
    assert.ok(lag.clarity > 1.5);
    assert.ok(Math.abs(lagDrift(strength, onsets, lag.ms)) <= 1);
  });

  it('measures loudness as the mean power of the sounding blocks', () => {
    const sine = Float32Array.from({ length: RATE * 2 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / RATE));
    assert.ok(Math.abs(loudness(sine, RATE) - -3.01) < 0.05);
  });
});
