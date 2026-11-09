import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import {
  activeAt,
  INSTRUCTION_KINDS,
  mpmDeskUrl,
  readInstructions,
  timeInstructions,
} from '../src/shared/instructions.ts';
import { mpmElements } from '../src/shared/mpm.ts';
import { ROOT } from '../tools/node-support.ts';

const work = {
  provenance: [
    { id: 'choice', name: 'MakeChoice', options: { prefer: 'x' } },
    {
      id: 'tempo',
      name: 'InsertTempo',
      options: { bpm: 48.15, transitionTo: 61.15, beatLength: 0.25 },
      elements: ['tempo_720'],
      range: { from: 720, to: 1440 },
    },
    {
      id: 'up',
      name: 'InsertPedal',
      options: { pedal: 'sustain-0', direction: 'up', depth: 1 },
      range: { from: 2000, to: 2300 },
    },
    {
      id: 'down',
      name: 'InsertPedal',
      options: { pedal: 'sustain-0', direction: 'down', depth: 0.9 },
      range: { from: 100, to: 300 },
    },
    {
      id: 'spread',
      name: 'InsertTemporalSpread',
      options: { placement: 'before-beat', date: 720 },
      elements: ['ornament_720'],
      range: { from: 720, to: null },
    },
    {
      id: 'softer',
      name: 'Modify',
      options: { aspect: 'velocity', change: -6 },
      range: { from: 720, to: 720 },
    },
    {
      id: 'curve',
      name: 'InsertDynamicsInstructions',
      options: {},
      elements: ['dynamics_0', 'dynamics_720'],
      range: { from: 0, to: 720 },
    },
  ],
};
const mpm = new DOMParser().parseFromString(
  `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><dynamicsMap>
     <dynamics date="0" volume="28.2" transition.to="26.8" xml:id="dynamics_0"/>
     <dynamics date="720" volume="26.8" transition.to="21.4" xml:id="dynamics_720"/>
   </dynamicsMap></mpm>`,
  'application/xml',
);

describe('the reconstruction’s instructions', () => {
  const elements = mpmElements(mpm);
  const list = readInstructions(work, (id) => elements.get(id));
  const of = (id: string) => {
    const found = list.find((instruction) => instruction.id === id);
    assert.ok(found, `${id} is listed`);
    return found;
  };

  it('are the calls that hold over a stretch of the score, in its order', () => {
    assert.deepEqual(
      list.map((instruction) => instruction.id),
      ['curve', 'down', 'tempo', 'spread', 'softer', 'up'],
    );
  });
  it('say what they wrote', () => {
    assert.deepEqual(
      [of('tempo'), of('curve'), of('softer'), of('spread'), of('down'), of('up')].map((i) => [
        i.kind,
        i.label,
      ]),
      [
        ['tempo', '48 → 61 bpm'],
        ['dynamics', '28 → 21'],
        ['dynamics', 'Velocity −6'],
        ['spread', 'Spread before the beat'],
        ['pedal', 'Sustain down to 0.9'],
        ['pedal', 'Sustain up'],
      ],
    );
  });
  it('hold a pedal’s press for as long as the pedal is down', () => {
    assert.deepEqual([of('down').from, of('down').to], [100, 2000]);
    assert.deepEqual([of('up').from, of('up').to], [2000, 2300]);
  });
  it('are named by their options alone without the MPM', () => {
    assert.equal(readInstructions(work).find((i) => i.id === 'curve')?.label, 'Dynamics');
  });
  it('read nothing from what is no work file', () => {
    assert.deepEqual(readInstructions(null), []);
    assert.deepEqual(
      readInstructions({ provenance: [3, { id: 'x' }, { id: 'y', name: 'InsertTempo' }] }),
      [],
    );
  });
  it('hold at a time of a rendering, a single moment for a while', () => {
    // a second for every 720 ticks
    const timed = timeInstructions(list, (tick) => tick / 720, 1.2);
    const at = (t: number): string[] => activeAt(timed, t).map((instruction) => instruction.id);
    assert.deepEqual(at(0.5), ['curve', 'down']);
    assert.deepEqual(at(1), ['curve', 'down', 'tempo', 'spread', 'softer']);
    assert.deepEqual(at(2.1), ['down', 'tempo', 'spread', 'softer']);
    assert.deepEqual(at(2.5), ['down']);
    assert.deepEqual(at(3), ['up']);
  });
  it('open in MPM Desk at the call', () => {
    assert.equal(mpmDeskUrl('2aac2b1a-7be2'), 'https://mpmdesk.welte225.org/#2aac2b1a-7be2');
  });
});

describe('the published reconstruction’s instructions', () => {
  const published = JSON.parse(readFileSync(join(ROOT, '../mpm/work.json'), 'utf8')) as {
    provenance: { id: string; name: string; range?: unknown; elements?: string[] }[];
  };
  const elements = mpmElements(
    new DOMParser().parseFromString(
      readFileSync(join(ROOT, '../mpm/performance.mpm'), 'utf8'),
      'application/xml',
    ),
  );
  const list = readInstructions(published, (id) => elements.get(id));

  it('are all of its calls that have a range', () => {
    const ranged = published.provenance.filter((call) => call.range !== undefined);
    assert.ok(ranged.length > 400);
    assert.deepEqual(new Set(list.map((i) => i.id)), new Set(ranged.map((call) => call.id)));
  });
  it('are of every dimension the page lists, each with something to say', () => {
    assert.deepEqual(new Set(list.map((i) => i.kind)), new Set(INSTRUCTION_KINDS.map(([kind]) => kind)));
    for (const instruction of list) {
      assert.ok(
        instruction.label.length > 0 && !/NaN|undefined|null/.test(instruction.label),
        instruction.label,
      );
      assert.ok(instruction.to >= instruction.from);
    }
  });
  it('find in the MPM what the calls wrote', () => {
    for (const call of published.provenance)
      if (call.range !== undefined)
        for (const id of call.elements ?? []) assert.ok(elements.has(id), `${call.name} wrote ${id}`);
  });
});
