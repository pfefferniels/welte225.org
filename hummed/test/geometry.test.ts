// The roll's geometry: loudness as height, the two staves in the height there is, the outline round
// a set of notes, and where words find room.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  along,
  clearOf,
  fitted,
  HULL,
  hullOf,
  keyRows,
  loudness,
  loudnessScale,
  rowsOf,
  solidity,
  STAFF_STEP,
  staffReach,
  staffRows,
  tallness,
  zoomAbout,
  type Taken,
} from '../src/described/geometry.ts';
import { BASS, TREBLE } from '../src/described/staff.ts';

describe('along', () => {
  it('goes straight between the points, and on past both ends', () => {
    assert.equal(along([0, 10, 20], [0, 100, 150], 5), 50);
    assert.equal(along([0, 10, 20], [0, 100, 150], 15), 125);
    assert.equal(along([0, 10, 20], [0, 100, 150], -1), -10);
    assert.equal(along([0, 10, 20], [0, 100, 150], 30), 200);
    assert.equal(along([3], [7], 99), 7);
    assert.equal(along([], [], 5), 5);
  });
});

describe('loudness', () => {
  const velocities = Array.from({ length: 100 }, (_, i) => 20 + i * 0.4);
  const scale = loudnessScale(velocities);
  it('has the median one row tall and the 98th percentile three', () => {
    assert.ok(Math.abs(tallness(scale, scale.level) - 1) < 1e-9);
    const loudest = [...velocities].sort((a, b) => a - b)[98];
    assert.ok(Math.abs(tallness(scale, loudest) - 3) < 1e-9);
  });
  it('is logarithmic: as many rows for every doubling', () => {
    const step = loudness(scale, 40) - loudness(scale, 20);
    assert.ok(Math.abs(loudness(scale, 80) - loudness(scale, 40) - step) < 1e-9);
    assert.ok(Math.abs(step - scale.perOctave) < 1e-9);
  });
  it('keeps a note to be seen however soft, and within bounds however loud', () => {
    assert.equal(tallness(scale, 0.001), 0.3);
    assert.equal(tallness(scale, 1e6), 6);
    assert.equal(solidity(scale, 0.001), 0.3);
    assert.equal(solidity(scale, 1e6), 1);
    assert.ok(solidity(scale, 50) > solidity(scale, 25));
  });
  it('does not fail on one level throughout', () => {
    const flat = loudnessScale([30, 30, 30]);
    assert.ok(Number.isFinite(tallness(flat, 30)) && Number.isFinite(tallness(flat, 60)));
  });
});

describe('the two staves', () => {
  const reach = staffReach([
    { staff: 'treble', step: 25 }, // G3, under the treble staff
    { staff: 'treble', step: 42 },
    { staff: 'bass', step: 31 }, // F4, over the bass staff
    { staff: 'bass', step: 12 },
  ]);
  it('reach as far as what is written on them, and their own lines at the least', () => {
    assert.deepEqual(reach, { treble: { lo: 25, hi: 42 }, bass: { lo: 12, hi: 31 } });
    assert.deepEqual(staffReach([]), {
      treble: { lo: TREBLE[0] - 1, hi: TREBLE[4] + 1 },
      bass: { lo: BASS[0] - 1, hi: BASS[4] + 1 },
    });
  });
  it('are set apart so that what hangs under the one never meets what stands on the other', () => {
    for (const room of [120, 300, 600]) {
      const rows = staffRows(room, reach);
      const lowestTreble = reach.treble.lo + rows.shift;
      assert.ok(lowestTreble - reach.bass.hi >= 3, `room ${room}`);
      assert.ok(rows.rowH <= STAFF_STEP && rows.rowH >= 3);
      // everything fits in the room, the rest shared above and below
      const used = rows.rowH * (rows.hi - rows.lo + 1) + 2 * rows.pad;
      assert.ok(Math.abs(used - room) < 1e-6 || rows.rowH === 3, `room ${room}: ${used}`);
    }
  });
  it('stand further apart where there is room, but not without end', () => {
    const tight = staffRows(200, reach);
    const wide = staffRows(2000, reach);
    assert.ok(wide.shift > tight.shift);
    assert.ok(wide.shift - tight.shift <= 18);
  });
  it('give way to a row for every key', () => {
    const rows = keyRows(490, 36, 84);
    assert.equal(rows.rowH, 10);
    assert.deepEqual([rows.lo, rows.hi, rows.shift, rows.unit], [36, 84, 0, 10]);
  });
});

describe('a hull', () => {
  const rects = [
    { x: 100, y: 200, w: 60, h: 10 },
    { x: 180, y: 120, w: 40, h: 10 },
  ];
  const points = hullOf(rects, 0, 1000);
  it('goes once round: along the top, and back along the bottom', () => {
    const half = points.length / 2;
    for (let i = 1; i < half; i++) assert.ok(points[i].x > points[i - 1].x);
    for (let i = half + 1; i < points.length; i++) assert.ok(points[i].x < points[i - 1].x);
    assert.equal(points[0].x, points[points.length - 1].x);
  });
  it('holds every note, standing off it', () => {
    const half = points.length / 2;
    for (const r of rects)
      for (let x = r.x; x <= r.x + r.w; x += 4) {
        const i = Math.round((x - points[0].x) / 4);
        const top = points[i].y;
        const bottom = points[points.length - 1 - i].y;
        assert.ok(top <= r.y - 7.9, `over the note at ${x}: ${top}`);
        assert.ok(bottom >= r.y + r.h + 7.9, `under the note at ${x}: ${bottom}`);
      }
    assert.ok(half > 10);
  });
  it('reaches a hull’s width beyond the notes, and no further than it may', () => {
    assert.equal(points[0].x, 100 - HULL);
    assert.ok(Math.max(...points.map((p) => p.x)) >= 220 + HULL - 4);
    const cut = hullOf(rects, 150, 200);
    assert.ok(Math.min(...cut.map((p) => p.x)) >= 150);
    assert.ok(Math.max(...cut.map((p) => p.x)) <= 204);
  });
});

describe('where words find room', () => {
  const taken: Taken[] = [
    { xa: 100, xb: 200, top: 80, bottom: 100 },
    { xa: 100, xb: 200, top: 50, bottom: 76 },
  ];
  it('is where they are put, if nothing stands there', () => {
    assert.equal(clearOf(taken, 300, 400, 95, 20), 95);
    assert.equal(clearOf(taken, 100, 200, 140, 20), 140);
    assert.equal(clearOf([], 0, 10, 5, 20), 5);
  });
  it('is the least above what stands there, and above what stands over that', () => {
    assert.equal(clearOf(taken, 150, 250, 95, 20), 46);
    // from the side, within a few pixels: kept off one another
    assert.equal(clearOf(taken, 205, 260, 95, 20), 46);
    assert.equal(clearOf(taken, 209, 260, 95, 20), 95);
  });
});

describe('words cut to a width', () => {
  const measure = (text: string): number => text.length * 10;
  it('are whole where they fit', () => {
    assert.equal(fitted('Hinspielen zur 1', 160, measure), 'Hinspielen zur 1');
  });
  it('are cut with the cut marked, and never end on a space', () => {
    assert.equal(fitted('Hinspielen zur 1', 150, measure), 'Hinspielen zur…');
    assert.equal(fitted('Hinspielen zur 1', 120, measure), 'Hinspielen…');
  });
  it('are none where only a letter or two would be left', () => {
    assert.equal(fitted('Hinspielen zur 1', 40, measure), null);
  });
});

describe('the rows of the whole piece', () => {
  it('go one after the other, a new row where the width is used up', () => {
    const { places, rows } = rowsOf([100, 100, 100], 10, 260);
    assert.deepEqual(places, [
      { x: 10, row: 0 },
      { x: 136, row: 0 },
      { x: 10, row: 1 },
    ]);
    assert.equal(rows, 2);
  });
  it('are none without remarks, and one for a remark wider than the roll', () => {
    assert.equal(rowsOf([], 10, 260).rows, 0);
    assert.deepEqual(rowsOf([900], 10, 260), { places: [{ x: 10, row: 0 }], rows: 1 });
  });
});

describe('zooming', () => {
  it('keeps the moment under the pointer where it is', () => {
    const gutter = 75;
    const before = { ppt: 0.03, scrollLeft: 400 };
    const anchor = 500;
    const ms = (anchor - gutter + before.scrollLeft) / before.ppt;
    const after = zoomAbout(before.ppt, 1.3, anchor, gutter, before.scrollLeft);
    assert.ok(Math.abs(after.ppt - 0.039) < 1e-12);
    assert.ok(Math.abs(gutter + ms * after.ppt - after.scrollLeft - anchor) < 1e-9);
  });
  it('stops at its limits, and never scrolls before the beginning', () => {
    assert.equal(zoomAbout(0.3, 10, 100, 75, 0).ppt, 0.4);
    assert.equal(zoomAbout(0.003, 0.1, 100, 75, 0).ppt, 0.002);
    assert.equal(zoomAbout(0.03, 0.5, 700, 75, 0).scrollLeft, 0);
  });
});
