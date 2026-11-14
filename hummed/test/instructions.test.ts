import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import {
  activeAt,
  appliesTo,
  CORRECTIONS,
  INSTRUCTION_KINDS,
  mpmDeskUrl,
  overReductions,
  readInstructions,
  timeInstructions,
} from '../src/shared/instructions.ts';
import { mpmElements } from '../src/shared/mpm.ts';
import { loadReductions, ROOT } from '../tools/node-support.ts';

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
        ['correction', 'Velocity −6'],
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
  it('over the harmonic reductions, are of their tempo, dynamics and arpeggios alone', () => {
    const kinds = INSTRUCTION_KINDS.map(([kind]) => kind);
    assert.deepEqual(
      kinds.filter((kind) => appliesTo(kind, 'reductions')),
      ['tempo', 'dynamics', 'spread'],
    );
    assert.deepEqual(
      kinds.filter((kind) => appliesTo(kind, 'piece')),
      kinds,
    );
  });
  it('list the corrections of the source apart, over the piece and the reductions alike', () => {
    assert.ok(!INSTRUCTION_KINDS.map(([kind]) => kind as string).includes(CORRECTIONS[0]));
    assert.ok(appliesTo('correction', 'piece') && appliesTo('correction', 'reductions'));
  });
  it('over the reductions, have each arpeggio where they roll a chord as it, at every strike', () => {
    const over = overReductions(list, [
      { date: 1440, ornament: 'ornament_720' },
      { date: 2160, ornament: 'ornament_720' },
      { date: 2880, ornament: 'a gradient' },
    ]);
    assert.deepEqual(
      over.filter((i) => i.kind === 'spread').map((i) => [i.id, i.from, i.to]),
      [
        ['spread', 1440, 1440],
        ['spread', 2160, 2160],
      ],
    );
    assert.deepEqual(
      over.filter((i) => i.kind !== 'spread').map((i) => i.id),
      list.filter((i) => i.kind !== 'spread').map((i) => i.id),
    );
    // none where the piece rolls it, where the reductions strike nothing rolled
    assert.deepEqual(
      overReductions(list, []).map((i) => i.id),
      ['curve', 'down', 'tempo', 'softer', 'up'],
    );
  });
});

describe('the instructions of which one holds at a time', () => {
  const tempo = (id: string, from: number, to: number, bpm: number) => ({
    id,
    name: 'InsertTempo',
    options: { bpm },
    elements: [`tempo_${from}`],
    range: { from, to },
  });
  const rubato = (id: string, from: number) => ({
    id,
    name: 'InsertRubato',
    options: {},
    elements: [`rubato_${from}`],
    range: { from, to: from + 720 },
  });
  const list = readInstructions({
    provenance: [
      tempo('first', 0, 1440, 60),
      // fitted again: the MPM's tempo at 1440 is what the later call wrote
      tempo('fitted', 1440, 2880, 50),
      // reaching past where the next begins
      tempo('long', 2880, 5040, 70),
      tempo('next', 4320, 5760, 66),
      tempo('refitted', 1440, 2880, 55),
      rubato('beat 1', 0),
      rubato('beat 2', 720),
      {
        id: 'twice',
        name: 'InsertTempo',
        options: { bpm: 1 },
        elements: ['x'],
        range: { from: 5760, to: 6480 },
      },
      {
        id: 'again',
        name: 'InsertTempo',
        options: { bpm: 2 },
        elements: ['y'],
        range: { from: 5760, to: 6480 },
      },
    ],
  });
  const of = (id: string) => list.find((instruction) => instruction.id === id);

  it('leave out a call fitted again later, which the MPM no longer has', () => {
    assert.equal(of('fitted'), undefined);
    assert.equal(of('refitted')?.label, '55 bpm');
  });
  it('hold up to where the next begins', () => {
    assert.deepEqual([of('long')?.from, of('long')?.to], [2880, 4320]);
    assert.deepEqual([of('next')?.from, of('next')?.to], [4320, 5760]);
  });
  it('leave out a call where a later one begins at the same place', () => {
    assert.equal(of('twice'), undefined);
    assert.ok(of('again'));
  });
  it('are listed one at a time, however briefly they hold', () => {
    // a quarter in a fifth of a second: each call would be listed for longer than it holds
    const timed = timeInstructions(list, (tick) => tick / 3600, 1.2);
    for (let t = 0; t < 2; t += 0.01) {
      const here = activeAt(timed, t);
      assert.ok(here.filter((i) => i.kind === 'tempo').length <= 1, `one tempo at ${t}`);
      assert.ok(here.filter((i) => i.kind === 'rubato').length <= 1, `one rubato at ${t}`);
    }
    // the last of its kind is listed for a while as before
    const last = timed.find((i) => i.id === 'beat 2');
    assert.ok(last && last.end - last.start >= 1.2);
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

  it('are all of its calls that have a range, but those fitted again later', () => {
    const ranged = published.provenance.filter((call) => call.range !== undefined);
    assert.ok(ranged.length > 400);
    // the last of a name to write an element is the one the MPM has it from
    const writer = new Map<string, number>();
    published.provenance.forEach((call, i) => {
      for (const id of call.elements ?? []) writer.set(`${call.name} ${id}`, i);
    });
    const refitted = published.provenance.filter(
      (call, i) =>
        call.range !== undefined &&
        (call.elements ?? []).length > 0 &&
        (call.elements ?? []).every((id) => writer.get(`${call.name} ${id}`) !== i),
    );
    assert.deepEqual(
      new Set(refitted.map((call) => call.name)),
      new Set(['InsertTempo', 'InsertDynamicsInstructions']),
    );
    const left = new Set(refitted.map((call) => call.id));
    assert.deepEqual(
      new Set(list.map((i) => i.id)),
      new Set(ranged.filter((call) => !left.has(call.id)).map((call) => call.id)),
    );
  });
  it('list one tempo, dynamics curve, rubato and accentuation pattern at a time, played fast or slow', () => {
    const names = new Map(published.provenance.map((call) => [call.id, call.name]));
    for (const ticksPerSecond of [360, 720, 2880]) {
      const timed = timeInstructions(list, (tick) => tick / ticksPerSecond);
      const end = Math.max(...timed.map((i) => i.end));
      for (let t = 0; t < end; t += 0.05) {
        const here = activeAt(timed, t).map((i) => names.get(i.id));
        for (const name of [
          'InsertTempo',
          'InsertDynamicsInstructions',
          'InsertRubato',
          'InsertMetricalAccentuation',
        ])
          assert.ok(here.filter((n) => n === name).length <= 1, `one ${name} at ${t.toFixed(2)} s`);
      }
    }
  });
  it('are of every dimension the page lists, each with something to say', () => {
    assert.deepEqual(
      new Set(list.map((i) => i.kind)),
      new Set([...INSTRUCTION_KINDS.map(([kind]) => kind), CORRECTIONS[0]]),
    );
    for (const instruction of list) {
      assert.ok(
        instruction.label.length > 0 && !/NaN|undefined|null/.test(instruction.label),
        instruction.label,
      );
      assert.ok(instruction.to >= instruction.from);
    }
  });
  it('over the reductions, have an arpeggio wherever they roll a chord as one', () => {
    const writers = (id: string): string[] =>
      published.provenance.filter((call) => call.elements?.includes(id)).map((call) => call.name);
    for (const reduced of [loadReductions().halves, loadReductions().quarters]) {
      const over = overReductions(list, reduced.rolls).filter((i) => i.kind === 'spread');
      const arpeggios = reduced.rolls.filter((roll) =>
        writers(roll.ornament).includes('InsertTemporalSpread'),
      );
      assert.ok(arpeggios.length > 0.9 * reduced.rolls.length);
      assert.deepEqual(
        over.map((i) => i.from),
        arpeggios.map((roll) => roll.date),
      );
      // the others shape the chord's loudness alone: a gradient, of no call with a range
      for (const roll of reduced.rolls.filter((roll) => !arpeggios.includes(roll)))
        assert.deepEqual(writers(roll.ornament), ['InsertDynamicsGradient', 'StylizeOrnamentation']);
    }
  });
  it('are corrections where they are of a note’s velocity, not dynamics', () => {
    const modified = published.provenance.filter((call) => call.name === 'Modify').map((call) => call.id);
    assert.ok(modified.length > 0);
    for (const instruction of list)
      assert.equal(instruction.kind === 'correction', modified.includes(instruction.id), instruction.id);
  });
  it('find in the MPM what the calls wrote', () => {
    for (const call of published.provenance)
      if (call.range !== undefined)
        for (const id of call.elements ?? []) assert.ok(elements.has(id), `${call.name} wrote ${id}`);
  });
});
