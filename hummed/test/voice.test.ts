// The whole voice at ×1 (the voice at ×1.3): its gestural scores and opening, against a fingerprint
// taken when the TypeScript port was shown to match the JavaScript it replaced byte for byte.
// After an intended change:  UPDATE_GOLDEN=1 npm test
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { renderVoice, type Voice } from '../src/hummer/index.ts';
import { loadReduction, loadStyle, voicePerformance } from '../tools/node-support.ts';
import { assertGolden } from './golden.ts';

// no calibration: the fingerprint is the hummer's, not the latest calibration run's
const render = (): Voice =>
  renderVoice({
    ...voicePerformance(1),
    reduction: loadReduction(),
    style: loadStyle(),
    calibration: { gain: 1, notes: {} },
  });
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

  it('breathes, hums every sung note and breathes out through teeth and lips', () => {
    const count = (tag: string) => voice.events.filter((e) => e.tag === tag).length;
    assert.equal(count('pitch'), 114);
    assert.ok(count('breath') >= 25);
    assert.equal(count('air'), 2);
    assert.match(voice.openScore, /tt-alveolar-fricative/);
    assert.match(voice.openScore, /ll-dental-fricative/);
  });

  it('opens the lips only as far as the open score allows', () => {
    assert.ok(voice.weight.every((w) => w >= 0 && w <= 1));
    assert.equal(voice.weight.length, Math.ceil(voice.endMs));
  });
});
