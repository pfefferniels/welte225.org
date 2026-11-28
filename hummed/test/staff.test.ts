// Where a pitch sits on the grand staff, the key read off the notes, and how the roll's height is
// shared between the two staves.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BASS,
  ledgersOf,
  nameOf,
  signatureMarks,
  signatureOf,
  spell,
  stepOf,
  TREBLE,
  type Spelled,
} from '../src/described/staff.ts';

const note = (letter: Spelled['letter'], pitch: number, alter = 0): Spelled => ({ letter, alter, pitch });

describe('a staff position', () => {
  it('is 28 for middle C, and even on every line', () => {
    assert.equal(stepOf(note('c', 60)), 28);
    // the treble staff's lines: E4 G4 B4 D5 F5
    assert.deepEqual(
      [note('e', 64), note('g', 67), note('b', 71), note('d', 74), note('f', 77)].map(stepOf),
      TREBLE,
    );
    // the bass staff's: G2 B2 D3 F3 A3
    assert.deepEqual(
      [note('g', 43), note('b', 47), note('d', 50), note('f', 53), note('a', 57)].map(stepOf),
      BASS,
    );
  });
  it('goes by the letter, not the key: an altered note stays on its letter’s place', () => {
    assert.equal(stepOf(note('b', 70, -1)), stepOf(note('b', 71)));
    assert.equal(stepOf(note('c', 61, 1)), 28);
    // C flat is the key of B, written a step above it; B sharp the key of C, a step below
    assert.equal(stepOf(note('c', 59, -1)), 28);
    assert.equal(stepOf(note('b', 60, 1)), 27);
    assert.equal(stepOf(note('f', 66, 1)) - stepOf(note('g', 66, -1)), -1);
  });
});

describe('ledger lines', () => {
  it('are none within the staff and a step beyond it', () => {
    for (let step = TREBLE[0] - 1; step <= TREBLE[4] + 1; step++)
      assert.deepEqual(ledgersOf(step, TREBLE), []);
  });
  it('are every line from the staff out to the note', () => {
    assert.deepEqual(ledgersOf(28, TREBLE), [28]); // middle C under the treble staff
    assert.deepEqual(ledgersOf(28, BASS), [28]); // and over the bass staff
    assert.deepEqual(ledgersOf(25, TREBLE), [28, 26]); // G3: two lines, the note under the second
    assert.deepEqual(ledgersOf(45, TREBLE), [40, 42, 44]); // D6: three lines, the note over the third
    assert.deepEqual(ledgersOf(14, BASS), [16, 14]);
  });
});

describe('the key signature', () => {
  it('is read off the notes: the accidental most notes of a letter carry', () => {
    const f = signatureOf([
      note('b', 70, -1),
      note('b', 58, -1),
      note('b', 71),
      note('f', 65),
      note('c', 61, 1),
      note('c', 60),
      note('c', 72),
    ]);
    assert.deepEqual([...f], [['b', -1]]);
    assert.equal(signatureOf([note('b', 70, -1), note('b', 71), note('b', 71)]).size, 0);
  });
  it('is written in the order its accidentals are added, on both staves', () => {
    const flats = new Map([
      ['b', -1],
      ['e', -1],
    ] as const);
    assert.deepEqual(signatureMarks(flats, 'treble'), [
      { alter: -1, step: 34 },
      { alter: -1, step: 37 },
    ]);
    // on the bass staff two octaves lower: the B flat on the second line
    assert.deepEqual(signatureMarks(flats, 'bass'), [
      { alter: -1, step: 20 },
      { alter: -1, step: 23 },
    ]);
    const sharps = new Map([['f', 1]] as const);
    assert.deepEqual(signatureMarks(sharps, 'treble'), [{ alter: 1, step: 38 }]);
    // a signature that skips its first accidental is none
    assert.deepEqual(signatureMarks(new Map([['e', -1]] as const), 'treble'), []);
  });
  it('spells a key the score does not: flat in a flat key, sharp in a sharp one', () => {
    assert.deepEqual(spell(70, new Map([['b', -1]] as const)), { letter: 'b', alter: -1, pitch: 70 });
    assert.deepEqual(spell(70, new Map([['f', 1]] as const)), { letter: 'a', alter: 1, pitch: 70 });
    assert.deepEqual(spell(65, new Map([['b', -1]] as const)), { letter: 'f', alter: 0, pitch: 65 });
  });
});

describe('a pitch’s name', () => {
  it('has its octave from the letter', () => {
    assert.equal(nameOf(note('c', 60)), 'C4');
    assert.equal(nameOf(note('b', 70, -1)), 'B♭4');
    assert.equal(nameOf(note('c', 59, -1)), 'C♭4');
    assert.equal(nameOf(note('f', 54, 1)), 'F♯3');
  });
});
