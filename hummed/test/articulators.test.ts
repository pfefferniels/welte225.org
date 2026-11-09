// Consonants that move only their own articulator, in the tract states.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { moveArticulators, TONGUE_TIP_CLOSURE, TRACT_PARAMS } from '../src/hummer/articulators.ts';
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
});
