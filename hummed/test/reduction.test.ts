import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { readReduction, ReductionError, type XmlElement } from '../src/reduction/mei.ts';
import { loadReduction } from '../tools/node-support.ts';

const parse = (layers: string[], keysig = '1f') =>
  readReduction(
    new DOMParser().parseFromString(
      `<mei xmlns="http://www.music-encoding.org/ns/mei"><music><body><mdiv><score>
        <scoreDef keysig="${keysig}"/><section>
        ${layers.map((l, i) => `<measure label="${i}"><staff n="1"><layer n="1">${l}</layer></staff></measure>`).join('')}
      </section></score></mdiv></body></music></mei>`,
      'application/xml',
    ).documentElement as unknown as XmlElement,
  );

describe('readReduction', () => {
  it('reads notes with their pitch, ties and the upbeat', () => {
    const r = parse([
      '<note dur="4" xml:id="a" pname="c" oct="3" corresp="t.mei#n1"/>',
      '<note dur="2" xml:id="b" pname="b" oct="2" corresp="t.mei#n2" tie="i"/><note dur="2" pname="b" oct="2" tie="t"/>',
    ]);
    assert.deepEqual(r.events, [
      { kind: 'note', id: 'a', ref: 'n1', pitch: 48, start: 0, end: 720, pedal: false },
      // b flat from the key signature; the tie makes it one note of a whole bar
      { kind: 'note', id: 'b', ref: 'n2', pitch: 46, start: 720, end: 3600, pedal: false },
    ]);
    assert.deepEqual(r.bars, [{ label: '1', tick: 720 }]);
  });

  it('lets an accidental override the key, and dots lengthen', () => {
    const r = parse(['', '<note dur="4" dots="1" xml:id="a" pname="b" oct="2" accid="n" corresp="#x"/>']);
    assert.deepEqual(r.events[0], {
      kind: 'note',
      id: 'a',
      ref: 'x',
      pitch: 47,
      start: 720,
      end: 1800,
      pedal: false,
    });
  });

  it('keeps breaths apart and joins plain rests to the rest before', () => {
    const r = parse([
      '',
      '<rest dur="4" type="breath"/><rest dur="4"/><rest dur="4" type="breath"/><note dur="4" xml:id="a" pname="f" oct="2" type="pedal" corresp="#p"/>',
    ]);
    assert.deepEqual(
      r.events.map((e) => [
        e.kind,
        e.start,
        e.end,
        e.kind === 'rest' ? e.breath : e.kind === 'note' ? e.pedal : e.through,
      ]),
      [
        ['rest', 720, 2160, true],
        ['rest', 2160, 2880, true],
        ['note', 2880, 3600, true],
      ],
    );
  });

  it('reads air, continued by a tie, and looks through beams', () => {
    const r = parse([
      '',
      '<beam><note dur="8" type="air-teeth" pname="d" oct="3" tie="i"/><note dur="8" type="air-teeth" pname="d" oct="3" tie="t"/></beam>',
    ]);
    assert.deepEqual(r.events, [{ kind: 'air', start: 720, end: 1440, through: 'teeth' }]);
  });

  it('refuses what a single voice cannot sing', () => {
    assert.throws(() => parse(['<chord dur="4"/>']), ReductionError);
    assert.throws(() => parse(['<note dur="4" xml:id="a" pname="c" oct="3"/>']), /@corresp/);
  });
});

describe('the reduction as published', () => {
  const r = loadReduction();
  const notes = r.events.filter((e) => e.kind === 'note');
  it('is hummable: an octave and a half in the bass', () => {
    assert.equal(notes.length, 116);
    assert.ok(notes.every((n) => n.pitch >= 40 && n.pitch <= 57));
  });
  it('breathes and runs to the end of the piece without gaps', () => {
    assert.equal(r.events.filter((e) => e.kind === 'rest' && e.breath).length, 24);
    for (let i = 1; i < r.events.length; i++) assert.equal(r.events[i].start, r.events[i - 1].end);
    assert.equal(r.events.at(-1)?.end, 92880);
    assert.equal(r.bars.length, 32);
  });
});
