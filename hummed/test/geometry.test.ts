// The roll's geometry: loudness as height, the two staves in the height there is, the outline round
// a set of notes, and where words find room.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  along,
  BACK,
  CLOSEST,
  FARTHEST,
  fitted,
  HULL,
  hullOf,
  keyRows,
  loudness,
  loudnessScale,
  MARGIN,
  placeWords,
  presence,
  rowsOf,
  shows,
  SHOWS,
  smoothstep,
  solidity,
  STAFF_STEP,
  staffReach,
  staffRows,
  standing,
  tallness,
  zoomAbout,
  type Placed,
  type Words,
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
    assert.equal(zoomAbout(0.2, 10, 100, 75, 0).ppt, CLOSEST);
    assert.equal(zoomAbout(0.003, 0.1, 100, 75, 0).ppt, FARTHEST);
    assert.equal(zoomAbout(0.03, 0.5, 700, 75, 0).scrollLeft, 0);
  });
});

describe('how much a remark is there', () => {
  // a window 1360 wide: the roll fitted into it is 1215 wide
  const room = 1360 - 75 - MARGIN;
  const [from, whole] = shows(room);
  it('is nothing below a width of its passage on the screen, all of it from another', () => {
    assert.deepEqual([from, whole].map(Math.round), [30, 72]);
    assert.equal(presence(0, room), 0);
    assert.equal(presence(from, room), 0);
    assert.equal(presence(whole, room), 1);
    assert.equal(presence(5000, room), 1);
  });
  it('comes continuously between the two, the wider the more, without a corner at either end', () => {
    assert.equal(presence((from + whole) / 2, room), 0.5);
    for (let w = from + 1; w <= whole; w++) assert.ok(presence(w, room) > presence(w - 1, room), `at ${w}`);
    assert.ok(presence(from + 1, room) < 0.005 && presence(whole - 1, room) > 0.995);
  });
  it('is the same for the same width at any zoom: a passage twice as long comes at half the scale', () => {
    const ms = 2800;
    for (const ppt of [0.01, 0.02, 0.04])
      assert.equal(presence(ms * ppt, room), presence(2 * ms * (ppt / 2), room));
  });
  it('goes by the share of the fitted roll: the whole piece shows the same remarks in any window', () => {
    const total = 150000;
    for (const passage of [2000, 4000, 6000, 9000, 20000]) {
      const there = [1215, 255, 1775].map((fitted) => presence((passage * fitted) / total, fitted));
      for (const one of there) assert.ok(Math.abs(one - there[0]) < 1e-9, `${passage} ms`);
    }
    assert.deepEqual(shows(2 * room), [2 * from, 2 * whole]);
    assert.ok(Math.abs(SHOWS[1] / SHOWS[0] - 2.4) < 1e-9);
  });
  it('has a floor: words of passages a few pixels wide could not be told apart', () => {
    assert.deepEqual(shows(100), [6, 14]);
    assert.equal(presence(6, 100), 0);
    assert.equal(presence(14, 100), 1);
  });
  it('steps back, and no further, once the passage is wider than what is seen of the roll', () => {
    const view = 1285;
    assert.equal(standing(300, view), 1);
    assert.equal(standing(view, view), 1);
    assert.equal(standing(2 * view, view), BACK);
    assert.equal(standing(20 * view, view), BACK);
    assert.ok(standing(1.5 * view, view) < 1 && standing(1.5 * view, view) > BACK);
  });
  it('rises smoothly', () => {
    assert.equal(smoothstep(2, 6, 1), 0);
    assert.equal(smoothstep(2, 6, 4), 0.5);
    assert.equal(smoothstep(2, 6, 9), 1);
  });
});

describe('placing the words', () => {
  const words = (cx: number, cy: number, w = 120, lo = -1000, hi = 3000): Words => ({
    cx,
    cy,
    w,
    h: 20,
    lo,
    hi,
  });
  const whole = (one: Words, off = 0): Placed => ({ off, left: one.cx - one.w / 2, width: one.w });

  it('leaves them where their notes are, saying all they say, as long as they lie on no others', () => {
    const apart = [words(100, 200), words(900, 200, 700), words(100, 300)];
    assert.deepEqual(
      placeWords(apart, 0, 600),
      apart.map((one) => whole(one)),
    );
  });
  it('puts the later one off its place by a line, up before down, then by two', () => {
    const same = [words(100, 200), words(110, 200), words(120, 200), words(130, 200), words(90, 200)];
    assert.deepEqual(
      placeWords(same, 0, 600),
      same.map((one, i) => whole(one, [0, -22, 22, -44, 44][i])),
    );
  });
  it('gives the first given the place: it is the others that move', () => {
    const [first, second] = placeWords([words(100, 200, 300), words(100, 205, 60)], 0, 600);
    assert.equal(first?.off, 0);
    assert.notEqual(second?.off, 0);
  });
  it('cuts them a little against a neighbour before it puts them off their place', () => {
    // the first reaches to 400, the roll to 650: the second has not quite the room for all it says
    const [first, second] = placeWords([words(250, 200, 300), words(520, 200, 260, -1000, 650)], 0, 600);
    assert.deepEqual(first, { off: 0, left: 100, width: 300 });
    assert.deepEqual(second, { off: 0, left: 414, width: 236 });
  });
  it('lets them stand aside rather than be cut, as long as they stand over their passage', () => {
    // at the roll's beginning: all of them, from the edge on
    assert.deepEqual(placeWords([words(60, 200, 300, 6)], 0, 600), [{ off: 0, left: 6, width: 300 }]);
    // beside a neighbour, with room on the other side
    const [, second] = placeWords([words(100, 200, 200), words(260, 200, 200)], 0, 600);
    assert.deepEqual(second, { off: 0, left: 214, width: 200 });
  });
  it('puts them off their place before it cuts them much, or where their middle is taken', () => {
    const [, far] = placeWords([words(250, 200, 300), words(450, 200, 400, -1000, 650)], 0, 600);
    assert.deepEqual(far, { off: -22, left: 250, width: 400 });
    const [, under] = placeWords([words(250, 200, 300), words(300, 200, 100)], 0, 600);
    assert.deepEqual(under, { off: -22, left: 250, width: 100 });
  });
  it("cuts them against the roll's two ends where no line has room for all of them", () => {
    assert.deepEqual(placeWords([words(150, 200, 500, 6, 306)], 0, 600), [{ off: 0, left: 6, width: 300 }]);
  });
  it('keeps them within the roll in the height', () => {
    // right under the top: the second can only go down
    assert.deepEqual(
      placeWords([words(100, 12), words(100, 12)], 0, 600).map((one) => one?.off),
      [0, 22],
    );
    assert.deepEqual(
      placeWords([words(100, 588), words(100, 588)], 0, 600).map((one) => one?.off),
      [0, -22],
    );
  });
  it('says so where no line is free', () => {
    const many = Array.from({ length: 5 }, () => words(100, 30));
    assert.deepEqual(
      placeWords(many, 0, 62).map((one) => one?.off ?? null),
      [0, 22, null, null, null],
    );
  });
  it('has none lie on another, however many crowd one place, and none cut to a stub', () => {
    const crowd = Array.from({ length: 12 }, (_, i) =>
      words(300 + 37 * (i % 5), 250 + 9 * (i % 3), 90 + 20 * (i % 4)),
    );
    const placed = placeWords(crowd, 0, 600).flatMap((place, i) =>
      place ? [{ ...place, y: crowd[i].cy + place.off, w: crowd[i].w, cx: crowd[i].cx }] : [],
    );
    assert.ok(placed.length >= 10);
    for (const a of placed) {
      assert.ok(a.width >= Math.min(a.w, 96));
      assert.ok(a.left <= a.cx && a.left + a.width >= a.cx, 'over the middle of its passage');
      for (const b of placed)
        assert.ok(
          a === b || a.left + a.width <= b.left || b.left + b.width <= a.left || Math.abs(a.y - b.y) >= 20,
        );
    }
  });
});
