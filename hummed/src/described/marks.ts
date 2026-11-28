// What marks a remark's range on the roll, drawn as lines: a brace over a passage, a bowed arrow
// from a note to another, the outline of a hull round a set of notes.
import type { Point } from './geometry.ts';

type Context = CanvasRenderingContext2D;

/** How tall a brace is. */
export const BRACE = 9;

/** A brace lying over the stretch from `x0` to `x1`, its ends at the height `y`, its point above. */
export function brace(c: Context, x0: number, x1: number, y: number): void {
  const mid = (x0 + x1) / 2;
  const q = Math.min(BRACE, (x1 - x0) / 4);
  const half = y - BRACE / 2;
  c.beginPath();
  c.moveTo(x0, y);
  c.quadraticCurveTo(x0, half, x0 + q, half);
  c.lineTo(mid - q, half);
  c.quadraticCurveTo(mid, half, mid, y - BRACE);
  c.quadraticCurveTo(mid, half, mid + q, half);
  c.lineTo(x1 - q, half);
  c.quadraticCurveTo(x1, half, x1, y);
  c.stroke();
}

/** A bowed arrow whose middle passes through the height `apex`. */
export function arrow(c: Context, from: Point, to: Point, apex: number): void {
  const control = { x: (from.x + to.x) / 2, y: 2 * apex - (from.y + to.y) / 2 };
  const angle = Math.atan2(to.y - control.y, to.x - control.x);
  c.beginPath();
  c.moveTo(from.x, from.y);
  c.quadraticCurveTo(control.x, control.y, to.x, to.y);
  for (const turn of [-0.45, 0.45]) {
    c.moveTo(to.x, to.y);
    c.lineTo(to.x - 9 * Math.cos(angle + turn), to.y - 9 * Math.sin(angle + turn));
  }
  c.stroke();
}

/** The path of a closed, smooth line through the middles between the points. */
export function soft(c: Context, points: readonly Point[]): void {
  const n = points.length;
  c.beginPath();
  if (n < 3) return;
  const between = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = between(points[n - 1], points[0]);
  c.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const to = between(points[i], points[(i + 1) % n]);
    c.quadraticCurveTo(points[i].x, points[i].y, to.x, to.y);
  }
  c.closePath();
}
