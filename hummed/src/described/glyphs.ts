// The clefs and the accidentals, drawn as lines. A music font would have to be fetched, and a
// clef in whatever font a browser falls back on sits on another line; drawn, each is on its own.
// Everything is given in staff spaces (the distance between two lines), `space` pixels each.

type Context = CanvasRenderingContext2D;

/** A run of cubic curves, each `[c1x, c1y, c2x, c2y, x, y]`, from a starting point. */
type Curves = readonly (readonly [number, number, number, number, number, number])[];

function trace(
  c: Context,
  x: number,
  y: number,
  space: number,
  start: readonly [number, number],
  curves: Curves,
): void {
  c.moveTo(x + start[0] * space, y + start[1] * space);
  for (const [ax, ay, bx, by, px, py] of curves)
    c.bezierCurveTo(
      x + ax * space,
      y + ay * space,
      x + bx * space,
      y + by * space,
      x + px * space,
      y + py * space,
    );
}

function dot(c: Context, x: number, y: number, radius: number): void {
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.fill();
}

/** How far the G clef reaches left and right of its axis. */
export const G_CLEF_WIDTH = 2;

/**
 * The G clef, its curl round the line at `y` (the second from the bottom), its axis at `x`: from
 * the foot up the stem, over the top, down across the stem into the bowl, and curled in.
 */
export function gClef(c: Context, x: number, y: number, space: number): void {
  c.save();
  c.lineWidth = Math.max(1.2, space * 0.13);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  trace(
    c,
    x,
    y,
    space,
    [-0.5, 2.3],
    [
      [-0.5, 2.62, -0.2, 2.85, 0.08, 2.8],
      [0.42, 2.74, 0.5, 2.35, 0.42, 1.9],
    ],
  );
  c.lineTo(x + 0.06 * space, y - 3.1 * space);
  trace(
    c,
    x,
    y,
    space,
    [0.06, -3.1],
    [
      [-0.02, -3.75, 0.16, -4.3, 0.42, -4.3],
      [0.7, -4.3, 0.78, -3.45, 0.5, -2.85],
      [0.28, -2.35, -0.2, -1.95, -0.55, -1.35],
      [-0.85, -0.85, -0.97, -0.45, -0.97, 0.02],
      [-0.97, 0.62, -0.5, 1.02, 0.12, 1.02],
      [0.66, 1.02, 0.98, 0.6, 0.98, 0.12],
      [0.98, -0.42, 0.66, -0.8, 0.2, -0.8],
      [-0.22, -0.8, -0.46, -0.48, -0.46, -0.1],
      [-0.46, 0.22, -0.28, 0.42, -0.02, 0.44],
    ],
  );
  c.stroke();
  dot(c, x - 0.36 * space, y + 2.3 * space, space * 0.19);
  c.restore();
}

/** The F clef, its head on the line at `y` (the fourth from the bottom), its dots either side of it. */
export function fClef(c: Context, x: number, y: number, space: number): void {
  c.save();
  c.lineWidth = Math.max(1.4, space * 0.17);
  c.lineCap = 'round';
  c.beginPath();
  trace(
    c,
    x,
    y,
    space,
    [-0.72, -0.05],
    [
      [-0.78, -0.62, -0.3, -0.98, 0.18, -0.98],
      [0.78, -0.98, 1.02, -0.45, 1.02, 0.08],
      [1.02, 1.05, 0.15, 1.95, -0.92, 2.42],
    ],
  );
  c.stroke();
  dot(c, x - 0.6 * space, y - 0.02 * space, space * 0.24);
  dot(c, x + 1.5 * space, y - 0.5 * space, space * 0.13);
  dot(c, x + 1.5 * space, y + 0.5 * space, space * 0.13);
  c.restore();
}

/** How wide each accidental is drawn, in staff spaces. */
const WIDTHS: ReadonlyMap<number, number> = new Map([
  [-2, 1.02],
  [-1, 0.56],
  [0, 0.46],
  [1, 0.6],
  [2, 0.56],
]);

/** A flat: its stem, and its belly on the line or in the space at `y`. */
function flat(c: Context, x: number, y: number, space: number): void {
  c.beginPath();
  c.moveTo(x, y - 1.3 * space);
  c.lineTo(x, y + 0.46 * space);
  trace(
    c,
    x,
    y,
    space,
    [0, -0.12],
    [
      [0.2, -0.42, 0.52, -0.38, 0.5, -0.08],
      [0.48, 0.16, 0.22, 0.32, 0, 0.46],
    ],
  );
  c.stroke();
}

/**
 * An accidental ending at `right`, on the line or in the space at `y`: flats and sharps, single
 * and double, and the natural; nothing for an alteration there is no sign for.
 */
export function accidental(c: Context, alter: number, right: number, y: number, space: number): void {
  const width = WIDTHS.get(alter);
  if (width === undefined) return;
  const x = right - width * space;
  const line = (x0: number, y0: number, x1: number, y1: number): void => {
    c.beginPath();
    c.moveTo(x + x0 * space, y + y0 * space);
    c.lineTo(x + x1 * space, y + y1 * space);
    c.stroke();
  };
  c.save();
  c.lineCap = 'butt';
  const thin = Math.max(1, space * 0.1);
  const thick = Math.max(1.6, space * 0.2);
  c.lineWidth = thin;
  if (alter === -1) flat(c, x, y, space);
  else if (alter === -2) {
    flat(c, x, y, space);
    flat(c, x + 0.48 * space, y, space);
  } else if (alter === 1) {
    line(0.16, -0.78, 0.16, 0.9);
    line(0.44, -0.9, 0.44, 0.78);
    c.lineWidth = thick;
    line(0, -0.2, 0.6, -0.38);
    line(0, 0.38, 0.6, 0.2);
  } else if (alter === 0) {
    line(0.05, -0.95, 0.05, 0.4);
    line(0.41, -0.4, 0.41, 0.95);
    c.lineWidth = thick;
    line(0.05, -0.24, 0.41, -0.36);
    line(0.05, 0.36, 0.41, 0.24);
  } else {
    c.lineWidth = thick * 0.8;
    line(0.04, -0.26, 0.52, 0.26);
    line(0.04, 0.26, 0.52, -0.26);
  }
  c.restore();
}
