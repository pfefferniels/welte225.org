import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Clock } from '../src/hummer/clock.ts';
import { repair, type Note } from '../src/hummer/performance.ts';

const note = (id: string, date: number, onMs: number, endMs: number, duration = 720): Note => ({
  id,
  pitch: 60,
  date,
  duration,
  velocity: 64,
  ornamented: false,
  onMs,
  endMs,
});

describe('repair', () => {
  it('puts a note timed at its tick value back at the head of its chord', () => {
    const chord = [
      note('a', 50040, 50040, 94535),
      note('b', 50040, 93387, 94535),
      note('c', 50040, 93558, 94535),
    ];
    assert.equal(repair(chord), 1);
    assert.equal(chord[0].onMs, 93387 - (93558 - 93387));
  });
  it('gives a note that ends before it starts a length', () => {
    const notes = [note('a', 0, 1000, 900)];
    assert.equal(repair(notes), 1);
    assert.ok(notes[0].endMs > notes[0].onMs);
  });
  it('leaves a sane performance alone', () => {
    const notes = [note('a', 0, 0, 500), note('b', 0, 30, 500), note('c', 720, 600, 1100)];
    assert.equal(repair(notes), 0);
  });
});

describe('Clock', () => {
  const notes = [note('a', 0, 0, 500), note('b', 720, 600, 1100), note('c', 1440, 1300, 2600, 1440)];
  const clock = new Clock(notes, []);
  it('maps onsets to their times and back', () => {
    assert.equal(clock.toMs(720), 600);
    assert.equal(clock.toTicks(600), 720);
    assert.equal(clock.toMs(360), 300);
  });
  it('runs through the last chord to its written end', () => {
    assert.equal(clock.toMs(1440 + 1440), 2600);
  });
});
