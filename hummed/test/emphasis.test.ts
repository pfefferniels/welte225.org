// Instructions of the MPM brought out: the bounds an emphasis is kept within and what tells one
// from another (shared/emphasis.ts), a setting with one (shared/protocol.ts), and what espressivo
// makes of the reconstruction's MPM (worker/emphasis.ts): the dimensions of the instructions named
// exaggerated but for their shapes, every other dimension damped, and the MPM left as it is where
// there is nothing to bring out.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalMpm } from 'espressivo';
import { EMPHASIS, emphasisKey, emphasisOf, type Emphasis } from '../src/shared/emphasis.ts';
import { plain, sameSetting, settingKey } from '../src/shared/protocol.ts';
import { bringOut, emphasised } from '../src/worker/emphasis.ts';
import { loadScore } from '../tools/node-support.ts';

const TEMPI = ['tempo_2160', 'tempo_2880'];

describe('an emphasis', () => {
  it('is kept within its bounds, each instruction named once', () => {
    assert.deepEqual(emphasisOf({ ids: ['a', 'b', 'a'], factor: 5, attenuation: 0 }), {
      ids: ['a', 'b'],
      factor: EMPHASIS.factor[1],
      attenuation: EMPHASIS.attenuation[0],
    });
    assert.deepEqual(emphasisOf({ ids: ['a'], factor: 0.5, attenuation: 0.5 }), {
      ids: ['a'],
      factor: 1,
      attenuation: 0.5,
    });
    // what is no number leaves things as they are
    assert.deepEqual(emphasisOf({ ids: ['a'], factor: NaN, attenuation: 0.5 })?.factor, 1);
    assert.deepEqual(emphasisOf({ ids: ['a'], factor: 1.5, attenuation: NaN })?.attenuation, 1);
    assert.deepEqual(EMPHASIS, { factor: [1, 1.9], attenuation: [0.05, 1] });
  });

  it('is none where it would change nothing', () => {
    assert.equal(emphasisOf(undefined), undefined);
    assert.equal(emphasisOf({ ids: [], factor: 1.8, attenuation: 0.3 }), undefined);
    assert.equal(emphasisOf({ ids: ['a'], factor: 1, attenuation: 1 }), undefined);
    assert.equal(emphasisOf({ ids: ['a'], factor: 0.2, attenuation: 3 }), undefined);
  });

  it('is told from another by what it does, whatever the order of its ids', () => {
    const one: Emphasis = { ids: ['b', 'a'], factor: 1.8, attenuation: 0.3 };
    assert.equal(emphasisKey(one), emphasisKey({ ...one, ids: ['a', 'b', 'a'] }));
    assert.equal(emphasisKey({ ...one, factor: 7 }), emphasisKey({ ...one, factor: 1.9 }));
    assert.notEqual(emphasisKey(one), emphasisKey({ ...one, factor: 1.7 }));
    assert.notEqual(emphasisKey(one), emphasisKey({ ...one, attenuation: 0.4 }));
    assert.notEqual(emphasisKey(one), emphasisKey({ ...one, ids: ['a'] }));
  });
});

describe('a setting with instructions brought out', () => {
  const emphasis: Emphasis = { ids: TEMPI, factor: 1.8, attenuation: 0.3 };

  it('is keyed apart from the setting as it is, whose key is as it was', () => {
    assert.equal(settingKey({ elaboration: 0.65 }), '0.65||');
    assert.equal(settingKey({ elaboration: 0.65, flighty: 0.3, exaggerated: 1 }), '0.65|0.3|1');
    const key = settingKey({ elaboration: 0.65, emphasis });
    assert.ok(key.startsWith('0.65|||'));
    assert.ok(!sameSetting({ elaboration: 0.65, emphasis }, { elaboration: 0.65 }));
    assert.ok(sameSetting({ elaboration: 1, emphasis }, { elaboration: 1, emphasis: { ...emphasis } }));
    assert.ok(
      !sameSetting({ elaboration: 1, emphasis }, { elaboration: 1, emphasis: { ...emphasis, factor: 1.5 } }),
    );
    assert.ok(!sameSetting({ elaboration: 1, emphasis }, { elaboration: 0.95, emphasis }));
  });

  it('is not plain: no recording is of it', () => {
    assert.ok(plain({ elaboration: 1 }));
    assert.ok(!plain({ elaboration: 1, emphasis }));
  });
});

describe('the MPM with instructions brought out', () => {
  const { mpm } = loadScore();
  const tags = (text: string, name: string): string[] =>
    [...text.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
  const number = (tag: string, name: string): number =>
    Number(new RegExp(`\\s${name.replace('.', '\\.')}="([^"]*)"`).exec(tag)?.[1]);
  /** How far a dynamics instruction goes, from where it begins to where it arrives. */
  const swing = (tag: string): number =>
    /\stransition\.to=/.test(tag)
      ? Math.abs(Math.log(number(tag, 'transition.to') / number(tag, 'volume')))
      : 0;
  /** How far apart the tempi are that the instructions begin at. */
  const spread = (tempi: readonly string[]): number => {
    const logs = tempi.map((tag) => Math.log(number(tag, 'bpm')));
    const mean = logs.reduce((sum, x) => sum + x, 0) / logs.length;
    return Math.sqrt(logs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / logs.length);
  };

  it('is the MPM itself where nothing is exaggerated and nothing held back', () => {
    assert.equal(emphasised(mpm, undefined), mpm);
    assert.equal(emphasised(mpm, { ids: TEMPI, factor: 1, attenuation: 1 }), mpm);
    assert.equal(emphasised(mpm, { ids: [], factor: 1.8, attenuation: 0.3 }), mpm);
    assert.deepEqual(bringOut(mpm, { ids: TEMPI, factor: 1, attenuation: 1 }).spared, []);
  });

  it('exaggerates the dimensions of the instructions named, but for their shapes', () => {
    const out = bringOut(mpm, { ids: TEMPI, factor: 1.8, attenuation: 0.35 });
    assert.deepEqual(out.present, TEMPI);
    assert.deepEqual(out.spared, ['tempo', 'tempoShape']);
    const before = tags(mpm, 'tempo');
    const after = tags(out.mpm, 'tempo');
    assert.equal(after.length, before.length);
    // every tempo is as far again from the middle of them all, and where it is half way is as it was
    assert.ok(Math.abs(spread(after) / spread(before) - 1.8) < 0.05, `${spread(after) / spread(before)}`);
    before.forEach((tag, i) => {
      assert.equal(number(after[i], 'date'), number(tag, 'date'));
      assert.equal(number(after[i], 'meanTempoAt'), number(tag, 'meanTempoAt'));
    });
  });

  it('damps every other dimension', () => {
    const out = bringOut(mpm, { ids: TEMPI, factor: 1.8, attenuation: 0.35 });
    const before = tags(mpm, 'dynamics');
    const after = tags(out.mpm, 'dynamics');
    assert.ok(before.some((tag) => swing(tag) > 0));
    // each crescendo and diminuendo goes 0.35 as far
    before.forEach((tag, i) => {
      assert.ok(Math.abs(swing(after[i]) - 0.35 * swing(tag)) < 1e-9, tag);
    });
    // and each rubato bends its beat less
    const bend = (tag: string): number => Math.abs(Math.log(number(tag, 'intensity')));
    const rubati = tags(mpm, 'rubato');
    assert.ok(rubati.length > 0);
    tags(out.mpm, 'rubato').forEach((tag, i) => {
      assert.ok(bend(tag) <= bend(rubati[i]) + 1e-12, tag);
    });
  });

  it('holds the rest back without exaggerating at ×1', () => {
    const out = bringOut(mpm, { ids: TEMPI, factor: 1, attenuation: 0.35 });
    assert.deepEqual(tags(out.mpm, 'tempo'), tags(canonicalMpm(mpm), 'tempo'));
    assert.notDeepEqual(tags(out.mpm, 'dynamics'), tags(canonicalMpm(mpm), 'dynamics'));
  });

  it('stays as it is where it has none of the instructions, or espressivo refuses one', () => {
    const asked = { factor: 1.8, attenuation: 0.3 };
    assert.equal(emphasised(mpm, { ...asked, ids: ['tempo_of_another_mpm'] }), mpm);
    // of those it has and those it has not, the ones it has are brought out
    const some = bringOut(mpm, { ...asked, ids: ['tempo_of_another_mpm', 'tempo_2160'] });
    assert.deepEqual(some.present, ['tempo_2160']);
    assert.equal(some.mpm, emphasised(mpm, { ...asked, ids: ['tempo_2160'] }));
    assert.notEqual(some.mpm, mpm);
    // a pattern's definition governs no dimension: nothing is brought out, the tempo beside it neither
    assert.ok(mpm.includes('xml:id="accentuation_new-pattern_0"'));
    const refused = bringOut(mpm, { ...asked, ids: ['tempo_2160', 'accentuation_new-pattern_0'] });
    assert.equal(refused.mpm, mpm);
    assert.deepEqual(refused.present, []);
  });

  it('is the same beyond the bounds as at them', () => {
    const beyond = emphasised(mpm, { ids: TEMPI, factor: 5, attenuation: 0 });
    assert.equal(beyond, emphasised(mpm, { ids: TEMPI, factor: 1.9, attenuation: 0.05 }));
    assert.notEqual(beyond, emphasised(mpm, { ids: TEMPI, factor: 1.8, attenuation: 0.05 }));
  });
});
