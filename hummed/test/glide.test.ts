import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Glide } from '../src/page/glide.ts';

const FRAME = 1000 / 60;
/** An audio clock as the page reads it: it advances a buffer of 10 ms at a time. */
const inBursts = (seconds: number): number => Math.floor(seconds / 0.01) * 0.01;

describe('Glide', () => {
  it('is where the transport is while the playhead rests', () => {
    const glide = new Glide();
    assert.equal(glide.at(12.345, 0, false), 12.345);
    assert.equal(glide.at(40, FRAME, false), 40);
  });
  it('moves by a frame’s time in every frame though the transport’s clock comes in bursts', () => {
    const glide = new Glide();
    const drawn: number[] = [];
    for (let i = 0; i < 600; i++) drawn.push(glide.at(inBursts(30 + (i * FRAME) / 1000), i * FRAME, true));
    const steps = drawn.slice(1).map((position, i) => (position - (drawn[i] ?? 0)) * 1000);
    // the transport itself steps by 10 or 20 ms from frame to frame
    for (const step of steps.slice(60)) assert.ok(Math.abs(step - FRAME) < 0.7, `a step of ${step} ms`);
    // and it stays with the transport: within the burst it is read in
    const last = drawn.at(-1) ?? 0;
    assert.ok(Math.abs(last - (30 + (599 * FRAME) / 1000)) < 0.01);
  });
  it('waits where the transport waits before a start, and sets off with it', () => {
    const glide = new Glide();
    // a start scheduled 60 ms ahead: the position stays for four frames
    const position = (i: number): number => 5 + Math.max(0, (i * FRAME - 60) / 1000);
    const drawn = Array.from({ length: 30 }, (_, i) => glide.at(position(i), i * FRAME, true));
    assert.deepEqual(drawn.slice(0, 4), [5, 5, 5, 5]);
    for (let i = 4; i < 30; i++) assert.ok(Math.abs((drawn[i] ?? 0) - position(i)) < 0.012);
    for (let i = 5; i < 30; i++) assert.ok((drawn[i] ?? 0) > (drawn[i - 1] ?? 0));
  });
  it('follows a seek at once', () => {
    const glide = new Glide();
    for (let i = 0; i < 20; i++) glide.at(10 + (i * FRAME) / 1000, i * FRAME, true);
    assert.equal(glide.at(90, 20 * FRAME, true), 90);
    assert.equal(glide.at(3, 21 * FRAME, true), 3);
  });
  it('is at the transport’s position exactly when the playhead comes to rest', () => {
    const glide = new Glide();
    for (let i = 0; i < 20; i++) glide.at(inBursts(10 + (i * FRAME) / 1000), i * FRAME, true);
    assert.equal(glide.at(10.3371, 20 * FRAME, false), 10.3371);
  });
  it('catches up after frames were left out', () => {
    const glide = new Glide();
    let drawn = 0;
    // a frame every 50 ms only
    for (let i = 0; i < 100; i++) drawn = glide.at(inBursts(i * 0.05), i * 50, true);
    assert.ok(Math.abs(drawn - 99 * 0.05) < 0.01);
  });
});
