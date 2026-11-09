// The harmonies (reduction/harmonies.mei): converted to a score, grace notes put back, and performed
// with the MPM as the piece is, each chord struck where the piece strikes it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { performMsmToData } from 'espressivo';
import { readPerformance, type Note } from '../src/hummer/performance.ts';
import { readGraces, type XmlElement } from '../src/reduction/mei.ts';
import { harmoniesScore } from '../src/worker/harmonies.ts';
import { loadScore, ROOT } from '../tools/node-support.ts';

const root = (xml: string): XmlElement =>
  new DOMParser().parseFromString(xml, 'application/xml').documentElement as unknown as XmlElement;

describe('the harmonies', () => {
  const mei = readFileSync(join(ROOT, 'reduction/harmonies.mei'), 'utf8');
  const { msm, mpm } = loadScore();
  const harmonies = readPerformance(performMsmToData({ msm: harmoniesScore(mei), mpm })).notes;
  const piece = readPerformance(performMsmToData({ msm, mpm })).notes;

  it('plays every note, its appoggiaturas written out rather than as grace notes', () => {
    assert.equal(harmonies.length, 219);
    assert.deepEqual(readGraces(root(mei)), []);
  });

  it('spans the piece, upbeat aside', () => {
    assert.equal(Math.min(...harmonies.map((n) => n.date)), 720);
    assert.equal(Math.max(...harmonies.map((n) => n.date + n.duration)), 92880);
  });

  it('strikes only where the piece strikes, so that its arpeggios roll the harmonies too', () => {
    const struck = new Set(piece.map((n) => n.date));
    const ours = new Set(harmonies.map((n) => n.date));
    assert.equal(ours.size, 60);
    assert.deepEqual(
      [...ours].filter((date) => !struck.has(date)),
      [],
    );
  });

  it('keeps the piece’s time: notes no arpeggio moves sound when the piece’s do', () => {
    const plain = (notes: readonly Note[]): Map<number, number> =>
      new Map(notes.filter((n) => !n.ornamented).map((n) => [n.date, n.onMs]));
    const ours = plain(harmonies);
    const theirs = plain(piece);
    const shared = [...ours.keys()].filter((date) => theirs.has(date));
    assert.ok(shared.length >= 5);
    for (const date of shared) assert.ok(Math.abs((ours.get(date) ?? 0) - (theirs.get(date) ?? 0)) < 1e-6);
    const end = (notes: readonly Note[]): number => Math.max(...notes.map((n) => n.endMs));
    assert.ok(Math.abs(end(harmonies) - end(piece)) < 1e-6);
  });

  it('is pedalled as the piece is', () => {
    const pedal = (data: string): number =>
      readPerformance(performMsmToData({ msm: data, mpm })).sustain.length;
    assert.equal(pedal(harmoniesScore(mei)), pedal(msm));
  });
});

describe('grace notes in the harmonies', () => {
  // None are written at present; espressivo leaves them out, and the worker puts them back.
  const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0+basic"><music><body><mdiv><score>
<scoreDef><staffGrp><staffDef n="1" lines="5" keysig="1f"><clef shape="G" line="2" /></staffDef></staffGrp></scoreDef>
<section><measure n="1"><staff n="1"><layer n="1">
<note xml:id="c" dur="2" pname="c" oct="5" />
<graceGrp grace="acc"><note xml:id="g" dur="4" pname="e" oct="5"><accid accid="f" /></note></graceGrp>
<note xml:id="d" dur="2" pname="d" oct="5" />
</layer></staff></measure></section></score></mdiv></body></music></mei>`;

  it('are found, each with the note it leads to', () => {
    assert.deepEqual(readGraces(root(mei)), [{ id: 'g', pitch: 75, before: 'd' }]);
  });

  it('are put back, a thirty-second before the note they lead to', () => {
    const doc = new DOMParser().parseFromString(harmoniesScore(mei), 'application/xml');
    const notes = new Map(
      Array.from(doc.getElementsByTagName('note')).map((n) => [
        n.getAttribute('xml:id'),
        {
          date: Number(n.getAttribute('date')),
          duration: Number(n.getAttribute('duration')),
          pitch: n.getAttribute('midi.pitch'),
        },
      ]),
    );
    assert.equal(notes.size, 3);
    assert.deepEqual(notes.get('g'), { date: 1440 - 90, duration: 90, pitch: '75' });
    assert.equal(notes.get('d')?.date, 1440);
  });
});
