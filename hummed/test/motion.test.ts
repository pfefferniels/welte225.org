// How things on the roll get where they are going.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ease, Eased, GLIDE } from '../src/described/motion.ts';

describe('the easing', () => {
  it('goes from nothing to all of the way, and no further', () => {
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
    assert.equal(ease(-3), 0);
    assert.equal(ease(7), 1);
  });
  it('goes on all the while, slowly at both ends, and as much before the middle as after it', () => {
    for (let t = 0.05; t <= 1; t += 0.05) assert.ok(ease(t) > ease(t - 0.05), `at ${t}`);
    assert.equal(ease(0.5), 0.5);
    assert.ok(ease(0.1) < 0.01 && ease(0.9) > 0.99);
    for (const t of [0.1, 0.25, 0.4]) assert.ok(Math.abs(ease(t) + ease(1 - t) - 1) < 1e-12);
  });
  it('takes a quarter to a third of a second', () => {
    assert.ok(GLIDE >= 250 && GLIDE <= 334);
  });
});

describe('a number on its way', () => {
  it('is where it was put until it is aimed elsewhere', () => {
    const x = new Eased(3);
    assert.equal(x.at(0), 3);
    assert.equal(x.at(1e6), 3);
    assert.equal(x.target, 3);
    assert.equal(x.moving(5), false);
  });
  it('goes to where it is aimed in the time it is given, eased', () => {
    const x = new Eased(0);
    x.aim(10, 1000, 280);
    assert.equal(x.target, 10);
    assert.equal(x.at(1000), 0);
    assert.equal(x.at(1140), 5);
    assert.equal(x.at(1280), 10);
    assert.equal(x.at(5000), 10);
    assert.ok(x.at(1050) < 10 * (50 / 280), 'slowly at first');
    assert.equal(x.moving(1100), true);
    assert.equal(x.moving(1280), false);
  });
  it('aimed anew on its way, goes on from where it is', () => {
    const x = new Eased(0);
    x.aim(10, 0, 280);
    const there = x.at(100);
    x.aim(-4, 100, 280);
    assert.equal(x.at(100), there);
    assert.equal(x.at(380), -4);
    // aimed again at where it is going already, it goes on as it was
    const mid = x.at(200);
    x.aim(-4, 200, 280);
    assert.equal(x.at(200), mid);
    assert.equal(x.at(380), -4);
  });
  it('shifted, is so much further on at once, on its way as before', () => {
    const x = new Eased(0);
    x.aim(10, 0, 280);
    x.shift(3);
    assert.equal(x.at(0), 3);
    assert.equal(x.at(140), 8);
    assert.equal(x.at(280), 13);
    assert.equal(x.target, 13);
  });
  it('given no time, is there at once: for a reader who asks for less motion', () => {
    const x = new Eased(0);
    x.aim(1, 50, 0);
    assert.equal(x.at(50), 1);
    assert.equal(x.moving(50), false);
  });
});
