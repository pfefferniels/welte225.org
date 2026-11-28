// How much of the music around a passage is played for what is said of it to be heard.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contextOf, REACH, withinReach, type ContextScore, type Topic } from '../src/described/context.ts';

// Four bars of 4/4. The right hand has a note on every eighth; the left a chord on every half,
// and one more a sixteenth before the third bar (an upbeat of its own).
const EIGHTH = 360;
const right = Array.from({ length: 32 }, (_, i) => ({ id: `r${i}`, date: i * EIGHTH, part: 1 }));
const left = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, date: i * 1440, part: 2 })),
  { id: 'lx', date: 5760 - 180, part: 2 },
];
const notes = [...right, ...left].sort((a, b) => a.date - b.date);
const score: ContextScore = {
  dates: [...new Set(notes.map((note) => note.date))].sort((a, b) => a - b),
  beats: Array.from({ length: 16 }, (_, i) => i * 720),
  bars: [0, 2880, 5760, 8640],
  notes,
};
const about = (...topics: Topic[]): Set<Topic> => new Set(topics);
// the second half of the second bar
const passage = { kind: 'span', from: 4320, to: 5760 };

describe('the context of a passage', () => {
  it('is always the chord before and the chord after', () => {
    assert.deepEqual(contextOf(score, passage, about()), { from: 4320 - EIGHTH, to: 5760 });
    assert.deepEqual(contextOf(score, passage, about('dynamics')), { from: 4320 - EIGHTH, to: 5760 });
  });
  it('for a pulse goes back to the beat before the passage’s first, and on through a second chord', () => {
    for (const topic of ['tempo', 'rubato', 'roll'] as const)
      assert.deepEqual(contextOf(score, passage, about(topic)), { from: 3600, to: 5760 + EIGHTH }, topic);
  });
  it('for touch takes the note before and the note after in the same hand', () => {
    // of the left hand's chord on the third beat of the second bar: its neighbours a half bar away
    const chord = { kind: 'notes', from: 4320, to: 4320 + EIGHTH, ids: ['l3'] };
    assert.deepEqual(contextOf(score, chord, about('touch')), { from: 2880, to: 5760 - 180 });
    // without naming its notes, a passage about touch reaches as far as each hand in it does
    assert.deepEqual(contextOf(score, passage, about('touch')), { from: 2880, to: 5760 });
    // the notes whose touch it is about, where its calls name them, decide
    assert.deepEqual(contextOf(score, passage, about('touch'), ['r13']), { from: 4320 - EIGHTH, to: 5760 });
  });
  it('of notes that are named takes their hand’s neighbours whatever was said of them', () => {
    const one = { kind: 'notes', from: 4320, to: 4320 + EIGHTH, ids: ['l3'] };
    assert.deepEqual(contextOf(score, one, about('dynamics')), { from: 2880, to: 5760 - 180 });
  });
  it('for an accent pattern takes its whole bar, for the pedal the beat either side', () => {
    assert.deepEqual(contextOf(score, passage, about('accent')), { from: 2880, to: 5760 });
    assert.deepEqual(contextOf(score, passage, about('pedal')), { from: 3600, to: 5760 });
  });
  it('is never more than two beats to either side', () => {
    // an eighth late in its bar: the bar began more than two beats before it
    const late = { kind: 'span', from: 5040, to: 5400 };
    assert.deepEqual(contextOf(score, late, about('accent', 'touch', 'tempo')), { from: 3600, to: 5760 });
    // and one early in its bar: the bar ends more than two beats after it
    const early = { kind: 'span', from: 3240, to: 3600 };
    assert.deepEqual(contextOf(score, early, about('accent')), { from: 2880, to: 3240 + 1440 });
  });
  it('stops at the piece’s ends', () => {
    const opening = { kind: 'span', from: 0, to: 720 };
    assert.equal(contextOf(score, opening, about('tempo', 'accent')).from, 0);
    const last = score.dates.at(-1) ?? 0;
    const close = { kind: 'span', from: last - 720, to: last + 1 };
    assert.equal(contextOf(score, close, about('tempo', 'accent')).to, last);
  });
  it('of a passage without notes is the chords around where it begins', () => {
    const empty = { kind: 'span', from: 100, to: 200 };
    assert.deepEqual(contextOf(score, empty, about()), { from: 0, to: EIGHTH });
  });
});

describe('the context within reach', () => {
  const context = { from: 2880, to: 5760 + EIGHTH };
  it('is all of it where the music moves on', () => {
    // an eighth every 300 ms
    const msAt = (date: number): number => (date / EIGHTH) * 300;
    assert.deepEqual(withinReach(score.dates, passage, context, msAt), context);
  });
  it('in slow music is what sounds within reach of the passage', () => {
    // an eighth a second: of four eighths before the passage, two are within 2.6 s
    const msAt = (date: number): number => (date / EIGHTH) * 1000;
    assert.ok(REACH > 2000 && REACH < 3000);
    assert.deepEqual(withinReach(score.dates, passage, context, msAt), {
      from: 4320 - 2 * EIGHTH,
      to: 5760 + EIGHTH,
    });
  });
  it('keeps the nearest chord either side however far it is', () => {
    const msAt = (date: number): number => (date / EIGHTH) * 5000;
    assert.deepEqual(withinReach(score.dates, passage, context, msAt), { from: 4320 - EIGHTH, to: 5760 });
  });
  it('leaves a passage without notes as it is', () => {
    const empty = { kind: 'span', from: 100, to: 200 };
    assert.deepEqual(
      withinReach(score.dates, empty, { from: 0, to: 360 }, (date) => date),
      {
        from: 0,
        to: 360,
      },
    );
  });
});
