// The details under the elaboration fader: they follow it, and one moved is set apart from it, in
// what is rendered (its own setting, which no recording is of) or in what is heard.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  apart,
  exaggerationText,
  flightinessText,
  FOLLOWING,
  partsOf,
  settingOf,
} from '../src/page/details.ts';
import { mix, mixOf, partsAt, PIECE_FROM, voiceElaboration } from '../src/page/mix.ts';
import { plain, sameSetting } from '../src/shared/protocol.ts';
import { shapeAt, shapeOf } from '../src/shared/shape.ts';
import { pianoMpm } from '../src/worker/piano.ts';
import { loadScore } from '../tools/node-support.ts';

const positions = Array.from({ length: 101 }, (_, i) => i / 100);

describe('the details', () => {
  it('follow the fader: its own setting, and what it lets be heard', () => {
    assert.ok(!apart(FOLLOWING));
    for (const e of positions) {
      const setting = settingOf(e, FOLLOWING);
      assert.deepEqual(setting, { elaboration: voiceElaboration(e) });
      assert.ok(plain(setting));
      assert.deepEqual(shapeOf(setting), shapeAt(voiceElaboration(e)));
      assert.deepEqual(partsOf(e, FOLLOWING), partsAt(e));
      assert.deepEqual(mixOf(e, partsOf(e, FOLLOWING)), mix(e));
    }
  });

  it('set nothing apart where a slider stands at the fader’s own step', () => {
    const setting = settingOf(0.65, { ...FOLLOWING, flighty: 0.66, exaggerated: 0.64 });
    assert.ok(plain(setting));
    assert.ok(sameSetting(setting, settingOf(0.65, FOLLOWING)));
  });

  it('render a slider set apart as its own setting, in the fader’s steps', () => {
    const setting = settingOf(0.65, { ...FOLLOWING, exaggerated: 0.02 });
    assert.deepEqual(setting, { elaboration: 0.65, exaggerated: 0 });
    assert.ok(!plain(setting));
    assert.ok(!sameSetting(setting, settingOf(0.65, FOLLOWING)));
    // as raw as the humming alone, the piano and the voice; as fast and as exact as at 0.65
    const shape = shapeOf(setting);
    assert.equal(shape.exaggeration, 1);
    assert.equal(shape.voiceExaggeration, 1);
    assert.equal(shape.flightiness, shapeAt(0.65).flightiness);
    assert.equal(shape.approximateness, shapeAt(0.65).approximateness);
    // the flightiness alone
    const flighty = shapeOf(settingOf(1, { ...FOLLOWING, flighty: 0 }));
    assert.equal(flighty.flightiness, 1);
    assert.equal(flighty.exaggeration, 0);
  });

  it('reach the performance: the MPM as it is at the top, faster where the flightiness is set apart', () => {
    const { mpm } = loadScore();
    assert.equal(pianoMpm(mpm, shapeOf(settingOf(1, FOLLOWING))), mpm);
    assert.notEqual(pianoMpm(mpm, shapeOf(settingOf(1, { ...FOLLOWING, flighty: 0.5 }))), mpm);
  });

  it('change what is heard alone: the humming, and one of the piano’s parts or none', () => {
    const e = 0.65;
    const quiet = mixOf(e, partsOf(e, { ...FOLLOWING, voice: false }));
    assert.equal(quiet.hum, 0);
    assert.equal(quiet.piece, mix(e).piece);
    const harmonies = mixOf(e, partsOf(e, { ...FOLLOWING, piano: 'harmonies' }));
    assert.equal(harmonies.harmonies, mix(e).piece);
    assert.equal(harmonies.piece, 0);
    assert.equal(harmonies.hum, mix(e).hum);
    const none = mixOf(e, partsOf(e, { ...FOLLOWING, piano: 'none' }));
    assert.equal(none.harmonies + none.piece, 0);
    // what is heard is no setting: the same rendering
    assert.ok(
      sameSetting(settingOf(e, { ...FOLLOWING, voice: false, piano: 'none' }), settingOf(e, FOLLOWING)),
    );
    // the piano alone at the bare end
    assert.equal(mixOf(0, partsOf(0, { ...FOLLOWING, piano: 'piece' })).piece, mix(1).piece);
  });

  it('say what they set: how fast and how inexact, how exaggerated the piano and the voice', () => {
    assert.equal(flightinessText(0), '×2.00 · 100 ms');
    assert.equal(flightinessText(1), '×1.00 · 0 ms');
    assert.deepEqual(exaggerationText(0), ['×2.00', '×1.85']);
    assert.deepEqual(exaggerationText(PIECE_FROM), ['×2.00', '×1.43']);
    assert.deepEqual(exaggerationText(1), ['×1.00', '×1.10']);
  });
});
