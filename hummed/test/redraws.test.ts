import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { differs, LEAST_STEP, type Frame } from '../src/page/frame.ts';
import { leastInterval, Redraws, type Frames } from '../src/page/redraws.ts';

/** Frames by hand: a display of 60 frames a second, each drawing costing what the test says. */
function display(cost = 0) {
  let waiting: ((time: number) => void) | null = null;
  let report: ((ms: number) => void) | null = null;
  let time = 0;
  let asked = 0;
  const frames: Frames = {
    next(callback) {
      assert.equal(waiting, null, 'one frame is asked for at a time');
      waiting = callback;
      asked++;
    },
    cost(callback) {
      report = callback;
    },
  };
  return {
    frames,
    get asked() {
      return asked;
    },
    get waiting() {
      return waiting !== null;
    },
    cost,
    /** The next frame, if one was asked for; then what it cost is told. */
    frame(): void {
      time += 1000 / 60;
      const callback = waiting;
      waiting = null;
      callback?.(time);
      const told = report;
      report = null;
      told?.(this.cost);
    },
  };
}

describe('Redraws', () => {
  it('draws once in a frame however often it is asked', () => {
    const screen = display();
    let drawn = 0;
    const redraws = new Redraws(
      () => {
        drawn++;
        return true;
      },
      () => false,
      screen.frames,
    );
    for (let i = 0; i < 30; i++) redraws.request();
    assert.equal(screen.asked, 1);
    assert.equal(drawn, 0);
    screen.frame();
    assert.equal(drawn, 1);
  });
  it('asks for no frame while nothing changes and nothing moves', () => {
    const screen = display();
    const redraws = new Redraws(
      () => true,
      () => false,
      screen.frames,
    );
    redraws.request();
    screen.frame();
    assert.equal(screen.waiting, false);
    screen.frame();
    assert.equal(screen.asked, 1);
  });
  it('draws in every frame while the playhead moves, and stops when it stops', () => {
    const screen = display();
    let moving = true;
    const times: number[] = [];
    const redraws = new Redraws(
      (time) => {
        times.push(time);
        return true;
      },
      () => moving,
      screen.frames,
    );
    redraws.request();
    for (let i = 0; i < 5; i++) screen.frame();
    assert.equal(times.length, 5);
    moving = false;
    screen.frame();
    screen.frame();
    assert.equal(times.length, 6);
    assert.equal(screen.waiting, false);
  });
  it('draws what is asked for while drawing in the frame after', () => {
    const screen = display();
    let drawn = 0;
    const redraws: Redraws = new Redraws(
      () => {
        if (drawn++ === 0) redraws.request();
        return true;
      },
      () => false,
      screen.frames,
    );
    redraws.request();
    screen.frame();
    assert.equal(screen.waiting, true);
    screen.frame();
    assert.equal(drawn, 2);
    assert.equal(screen.waiting, false);
  });
  it('leaves frames out, evenly, where drawing is costly', () => {
    // 12 ms a drawing: half of the time is one drawing in 24 ms, every other frame of 60
    const screen = display(12);
    const times: number[] = [];
    const redraws = new Redraws(
      (time) => {
        times.push(time);
        return true;
      },
      () => true,
      screen.frames,
    );
    redraws.request();
    for (let i = 0; i < 120; i++) screen.frame();
    const late = times.slice(-20);
    const steps = late.slice(1).map((time, i) => time - (late[i] ?? 0));
    assert.ok(steps.every((step) => Math.abs(step - 2000 / 60) < 1e-6));
  });
  it('draws 20 times a second however costly drawing is', () => {
    const screen = display(40);
    const times: number[] = [];
    const redraws = new Redraws(
      (time) => {
        times.push(time);
        return true;
      },
      () => true,
      screen.frames,
    );
    redraws.request();
    for (let i = 0; i < 120; i++) screen.frame();
    const late = times.slice(-10);
    assert.ok(late.slice(1).every((time, i) => Math.abs(time - (late[i] ?? 0) - 50) < 1e-6));
  });
  it('draws what was asked for during a costly drawing’s wait, in a later frame', () => {
    const screen = display(12);
    let drawn = 0;
    const redraws = new Redraws(
      () => {
        drawn++;
        return true;
      },
      () => false,
      screen.frames,
    );
    for (let i = 0; i < 6; i++) {
      redraws.request();
      screen.frame();
      screen.frame();
    }
    const before = drawn;
    redraws.request();
    screen.frame();
    redraws.request();
    screen.frame();
    assert.equal(drawn, before + 1, 'the frame right after a drawing is left out');
    screen.frame();
    assert.equal(drawn, before + 2);
    assert.equal(screen.waiting, false);
  });
  it('does not count the cost of frames in which nothing had to be drawn', () => {
    const screen = display(30);
    let calls = 0;
    const redraws = new Redraws(
      () => {
        calls++;
        return false;
      },
      () => true,
      screen.frames,
    );
    redraws.request();
    for (let i = 0; i < 30; i++) screen.frame();
    assert.equal(calls, 30);
  });
});

describe('leastInterval', () => {
  it('keeps cheap drawings in every frame', () => {
    assert.equal(leastInterval([]), 0);
    assert.ok(leastInterval([0.3, 0.4, 0.2, 0.3, 0.5]) < 4);
    // 6 ms: every frame of a display of 60 a second still
    assert.ok(leastInterval([6, 6, 6]) < 1000 / 60);
  });
  it('judges by the median, so that one stall does not count', () => {
    assert.equal(leastInterval([1, 1, 80, 1, 1]), leastInterval([1, 1, 1, 1, 1]));
  });
  it('never keeps drawings more than 50 ms apart', () => {
    assert.equal(leastInterval([100, 100, 100]), 50);
  });
});

describe('differs', () => {
  const strip = {};
  const frame = (scroll: number, ...content: unknown[]): Frame => ({ scroll, content });
  it('draws the first frame', () => {
    assert.equal(differs(null, frame(0), false), true);
  });
  it('draws nothing where nothing changed', () => {
    assert.equal(differs(frame(1200, strip, 7, null, 0.5), frame(1200, strip, 7, null, 0.5), false), false);
    assert.equal(differs(frame(1200, strip, 7), frame(1200, strip, 7), true), false);
  });
  it('draws when columns in view have come, another strip is shown, or it is shown otherwise', () => {
    const drawn = frame(1200, strip, 7, null, 0.5);
    assert.equal(differs(drawn, frame(1200, strip, 8, null, 0.5), false), true);
    assert.equal(differs(drawn, frame(1200, {}, 7, null, 0.5), false), true);
    assert.equal(differs(drawn, frame(1200, strip, 7, null, 0.6), false), true);
    assert.equal(differs(drawn, frame(1200, strip, 7, null), false), true);
  });
  it('draws every position at rest, however near', () => {
    assert.equal(differs(frame(1200, strip), frame(1200.001, strip), false), true);
  });
  it('leaves out a step too small to see while the playhead moves', () => {
    assert.equal(differs(frame(1200, strip), frame(1200 + LEAST_STEP / 2, strip), true), false);
    assert.equal(differs(frame(1200, strip), frame(1200 + LEAST_STEP, strip), true), true);
    assert.equal(differs(frame(1200, strip), frame(1200 - 2, strip), true), true);
  });
});
