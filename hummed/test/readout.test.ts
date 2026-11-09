import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Written } from '../src/page/dom.ts';
import { stretchAbout } from '../src/page/instructions-view.ts';
import { barAt, thumbMoves, thumbStep } from '../src/page/readout.ts';

describe('Written', () => {
  it('writes a value once, and again only when it changes', () => {
    const written: string[] = [];
    const text = new Written<string>((value) => written.push(value));
    for (const value of ['0:00', '0:00', '0:00', '0:01', '0:01', '0:00']) text.set(value);
    assert.deepEqual(written, ['0:00', '0:01', '0:00']);
  });
  it('writes the first value whatever it is', () => {
    const written: number[] = [];
    const count = new Written<number>((value) => written.push(value));
    count.set(0);
    count.set(0);
    assert.deepEqual(written, [0]);
  });
});

describe('barAt', () => {
  const bars = [
    [0.9, '1'],
    [4.1, '2'],
    [7.5, '3'],
  ] as const;
  it('names the upbeat before the first bar', () => {
    assert.equal(barAt(bars, 0), 'Upbeat');
    assert.equal(barAt([], 12), 'Upbeat');
  });
  it('names the bar the time lies in, a moment before it begins', () => {
    assert.equal(barAt(bars, 0.87), 'Upbeat');
    assert.equal(barAt(bars, 0.89), 'Bar 1');
    assert.equal(barAt(bars, 4.0), 'Bar 1');
    assert.equal(barAt(bars, 6), 'Bar 2');
    assert.equal(barAt(bars, 100), 'Bar 3');
  });
});

describe('the slider’s thumb', () => {
  it('crosses a device pixel in the piece’s length over the slider’s width in device pixels', () => {
    assert.equal(thumbStep(165, 330, 1), 0.5);
    assert.equal(thumbStep(165, 330, 2), 0.25);
  });
  it('follows exactly while its width is not known', () => {
    assert.equal(thumbStep(165, 0, 2), 0);
  });
  it('is moved at rest wherever the time differs, and while moving a pixel at a time', () => {
    assert.equal(thumbMoves(null, 30, 0.5), true);
    assert.equal(thumbMoves(30, 30, 0), false);
    assert.equal(thumbMoves(30, 30.001, 0), true);
    assert.equal(thumbMoves(30, 30.2, 0.5), false);
    assert.equal(thumbMoves(30, 30.5, 0.5), true);
    assert.equal(thumbMoves(30, 12, 0.5), true);
  });
});

describe('stretchAbout', () => {
  const calls = [
    { start: 0, end: 10 },
    { start: 4, end: 5.2 },
    { start: 8, end: 20 },
  ];
  it('reaches from the last beginning or end to the next', () => {
    assert.deepEqual(stretchAbout(calls, 4.5), [4, 5.2]);
    assert.deepEqual(stretchAbout(calls, 6), [5.2, 8]);
    assert.deepEqual(stretchAbout(calls, 12), [10, 20]);
  });
  it('begins at a call’s beginning and ends before the next', () => {
    assert.deepEqual(stretchAbout(calls, 8), [8, 10]);
    assert.deepEqual(stretchAbout(calls, 10), [10, 20]);
  });
  it('is open where nothing begins or ends any more', () => {
    assert.deepEqual(stretchAbout(calls, -1), [-Infinity, 0]);
    assert.deepEqual(stretchAbout(calls, 25), [20, Infinity]);
    assert.deepEqual(stretchAbout([], 3), [-Infinity, Infinity]);
  });
});
