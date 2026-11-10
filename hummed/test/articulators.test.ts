// Consonants that move only their own articulator, in the tract states.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { moveArticulators, TONGUE_A, TONGUE_TIP_CLOSURE, TRACT_PARAMS } from '../src/hummer/articulators.ts';
import { OPEN_SHAPE } from '../src/hummer/vocal-map.ts';
import { ROOT } from '../tools/node-support.ts';

describe('the articulators', () => {
  it('take the tongue tip to the speaker’s own alveolar closure (in the /u/ context)', () => {
    const speaker = readFileSync(join(ROOT, 'data/hummer.speaker.xml'), 'utf8');
    const shape = /<shape name="tt-alveolar-closure\(u\)">([\s\S]*?)<\/shape>/.exec(speaker)?.[1] ?? '';
    for (const [name, value] of Object.entries(TONGUE_TIP_CLOSURE)) {
      const written = new RegExp(`<param name="${name}" value="([-\\d.]+)"`).exec(shape)?.[1];
      assert.ok(written !== undefined, name);
      assert.ok(Math.abs(Number(written) - value) < 0.006, `${name}: ${written} against ${value}`);
    }
  });

  it('are in the speaker’s order of tract parameters', () => {
    const speaker = readFileSync(join(ROOT, 'data/hummer.speaker.xml'), 'utf8');
    const tract = speaker.slice(0, speaker.indexOf('</anatomy>'));
    const names = [...tract.matchAll(/<param index="(\d+)"\s+name="(\w+)"/g)].map((m) => [
      Number(m[1]),
      m[2],
    ]);
    assert.equal(names.length, TRACT_PARAMS.length);
    for (const [index, name] of names) assert.equal(TRACT_PARAMS[index as number], name);
  });

  it('move only the articulator’s parameters, in and out around the closure', () => {
    const params = TRACT_PARAMS.length;
    const count = 200;
    const tract = new Float64Array(count * params).fill(1);
    moveArticulators(tract, count, params, 2.5, [{ to: { TTY: 5 }, from: 200, until: 300 }]);
    const tty = TRACT_PARAMS.indexOf('TTY');
    const at = (ms: number, k: number): number => tract[Math.round(ms / 2.5) * params + k];
    assert.equal(at(100, tty), 1);
    assert.equal(at(250, tty), 5);
    assert.equal(at(400, tty), 1);
    assert.ok(at(190, tty) > 1 && at(190, tty) < 5);
    for (let k = 0; k < params; k++) if (k !== tty) assert.equal(at(250, k), 1);
  });

  it('take as long to come and go as they say: the tongue on its way to the "a"', () => {
    const params = TRACT_PARAMS.length;
    const count = 2000;
    const tract = new Float64Array(count * params).fill(1);
    moveArticulators(tract, count, params, 2.5, [
      { to: { TCX: 3 }, from: 2000, until: 3000, inMs: 1000, outMs: 1500 },
    ]);
    const tcx = TRACT_PARAMS.indexOf('TCX');
    const at = (ms: number): number => tract[Math.round(ms / 2.5) * params + tcx];
    assert.equal(at(990), 1);
    assert.ok(Math.abs(at(1500) - 2) < 0.01);
    assert.equal(at(2000), 3);
    assert.equal(at(2990), 3);
    assert.ok(at(3750) > 1.9 && at(3750) < 2.1);
    assert.equal(at(4600), 1);
  });

  it('have the tongue of the speaker’s "a", and the open shape is that "a" with the lips barely parted', () => {
    const speaker = readFileSync(join(ROOT, 'data/hummer.speaker.xml'), 'utf8');
    const shape = (name: string): Record<string, number> => {
      const text = speaker.split(`<shape name="${name}">`)[1]?.split('</shape>')[0] ?? '';
      return Object.fromEntries(
        [...text.matchAll(/<param name="(\w+)"\s+value="([-\d.]+)"/g)].map((m) => [m[1], Number(m[2])]),
      );
    };
    const a = shape('a');
    const ah = shape(OPEN_SHAPE);
    for (const [name, value] of Object.entries(TONGUE_A)) assert.equal(a[name], value, name);
    for (const name of TRACT_PARAMS) if (name !== 'LD') assert.equal(ah[name], a[name], name);
    assert.ok((ah['LD'] ?? 0) > 0.11 && (ah['LD'] ?? 0) < 0.5 && (a['LD'] ?? 0) > 0.9);
  });
});
