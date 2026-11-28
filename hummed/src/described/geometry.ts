// The roll's geometry, apart from the canvas it is drawn on: how loud is how tall, how the two
// staves share the height, the outline round a set of notes, where a remark's words find room.
import { BASS, TREBLE } from './staff.ts';

export const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(Math.max(value, lo), Math.max(lo, hi));

/** Linear interpolation through (xs, ys), carried on straight past both ends. */
export function along(xs: readonly number[], ys: readonly number[], x: number): number {
  const last = xs.length - 1;
  if (last < 0) return x;
  if (last === 0) return ys[0];
  let lo = 0;
  let hi = last;
  if (x <= xs[0]) hi = 1;
  else if (x >= xs[last]) lo = last - 1;
  else
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
  return ys[lo] + ((x - xs[lo]) / (xs[hi] - xs[lo])) * (ys[hi] - ys[lo]);
}

/**
 * The loudness scale of a recording: its median velocity is one row tall, its 98th percentile
 * three. Loudness is heard in ratios, so the scale is logarithmic.
 */
export interface LoudnessScale {
  readonly level: number;
  readonly perOctave: number;
}

export function loudnessScale(velocities: readonly number[]): LoudnessScale {
  const sorted = [...velocities].sort((a, b) => a - b);
  const level = Math.max(1, sorted.at(sorted.length >> 1) ?? 1);
  const loudest = sorted.at(Math.floor(sorted.length * 0.98)) ?? level;
  return { level, perOctave: 2 / Math.max(0.15, Math.log2(Math.max(loudest, level + 1) / level)) };
}

/** Rows a velocity stands above the scale's level (below, if negative): height and opacity share it. */
export const loudness = (scale: LoudnessScale, velocity: number): number =>
  scale.perOctave * Math.log2(Math.max(velocity, 1) / scale.level);
/** How tall a note is drawn, in units of a note at the level. */
export const tallness = (scale: LoudnessScale, velocity: number, emphasis = 1): number =>
  clamp(1 + emphasis * loudness(scale, velocity), 0.3, 6);
/** Opacity of a note: the louder, the more solid. */
export const solidity = (scale: LoudnessScale, velocity: number): number =>
  clamp(0.7 + 0.15 * loudness(scale, velocity), 0.3, 1);

/** The staff positions each staff has to show: what is written on it, and its own five lines. */
export interface StaffReach {
  readonly treble: { readonly lo: number; readonly hi: number };
  readonly bass: { readonly lo: number; readonly hi: number };
}

export function staffReach(
  notes: readonly { readonly staff: 'treble' | 'bass'; readonly step: number }[],
): StaffReach {
  const reach = (staff: 'treble' | 'bass', lines: readonly number[]): { lo: number; hi: number } => {
    const steps = [
      ...notes.filter((note) => note.staff === staff).map((note) => note.step),
      lines[0] - 1,
      lines[4] + 1,
    ];
    return { lo: Math.min(...steps), hi: Math.max(...steps) };
  };
  return { treble: reach('treble', TREBLE), bass: reach('bass', BASS) };
}

/** How the rows are laid over the height there is. */
export interface Rows {
  /** The height of a row: a staff position, or a key. */
  readonly rowH: number;
  /** How tall a note at the level is drawn. */
  readonly unit: number;
  /** How far the treble staff's positions are lifted above the bass's, in rows. */
  readonly shift: number;
  /** The lowest and the highest row. */
  readonly lo: number;
  readonly hi: number;
  /** What is left over above and below, each. */
  readonly pad: number;
}

/** A staff position is at most this tall, in pixels: a staff is eight of them. */
export const STAFF_STEP = 8.5;

/**
 * Two compact staves, the treble lifted clear of the bass: far enough that what hangs under the
 * one never meets what stands on the other, and further where there is room.
 */
export function staffRows(room: number, { treble, bass }: StaffReach): Rows {
  const least = Math.max(bass.hi - treble.lo + 3, 6);
  const rows = (shift: number): number => treble.hi + shift - bass.lo + 1;
  const rowH = clamp(room / rows(least), 3, STAFF_STEP);
  const shift = least + Math.max(0, Math.min((room / rowH - rows(least)) * 0.6, 18));
  return {
    rowH,
    // a note at the level is a good half of a notehead, so a box on a line is told from one in a space
    unit: rowH * 1.15,
    shift,
    lo: bass.lo,
    hi: treble.hi + shift,
    pad: Math.max(0, (room - rowH * rows(shift)) / 2),
  };
}

/** Key by key: a row for every key from the lowest to the highest. */
export function keyRows(room: number, lo: number, hi: number): Rows {
  const rowH = Math.max(3, room / (hi - lo + 1));
  return { rowH, unit: rowH, shift: 0, lo, hi, pad: 0 };
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** How far a hull stands off the notes it holds. */
export const HULL = 14;

/**
 * Outline round note rectangles: smoothed upper and lower envelopes, sampled every few pixels
 * between `from` and `to`. Its points go once round it: along the top, and back along the bottom.
 */
export function hullOf(rects: readonly Rect[], from: number, to: number): Point[] {
  const STEP = 4;
  const NEAR = 8; // never nearer to a note than this
  const WIDE = 10; // steps: a hollow narrower than twice this is filled
  const ROUND = 6; // steps: how far the smoothing reaches
  const left = Math.max(from, Math.min(...rects.map((r) => r.x)) - HULL);
  const right = Math.min(to, Math.max(...rects.map((r) => r.x + r.w)) + HULL);
  const n = Math.max(2, Math.ceil((right - left) / STEP) + 1);
  const column = (): (number | null)[] => new Array<number | null>(n).fill(null);
  const [top, bottom, topMost, bottomMost] = [column(), column(), column(), column()];
  for (const r of rects) {
    const a = Math.max(0, Math.floor((r.x - HULL - left) / STEP));
    const b = Math.min(n - 1, Math.ceil((r.x + r.w + HULL - left) / STEP));
    for (let i = a; i <= b; i++) {
      top[i] = Math.min(top[i] ?? Infinity, r.y - HULL);
      bottom[i] = Math.max(bottom[i] ?? -Infinity, r.y + r.h + HULL);
      const x = left + i * STEP;
      if (x < r.x - NEAR || x > r.x + r.w + NEAR) continue;
      topMost[i] = Math.min(topMost[i] ?? Infinity, r.y - NEAR);
      bottomMost[i] = Math.max(bottomMost[i] ?? -Infinity, r.y + r.h + NEAR);
    }
  }
  /** Across the columns without a note, a straight line from the last with one to the next. */
  const bridge = (values: readonly (number | null)[]): number[] => {
    const out = new Array<number>(n).fill(0);
    let before = -1;
    for (let i = 0; i < n; i++) {
      const value = values[i];
      if (value === null) continue;
      out[i] = value;
      for (let j = before + 1; j < i; j++)
        out[j] = before < 0 ? value : out[before] + ((value - out[before]) * (j - before)) / (i - before);
      before = i;
    }
    for (let j = before + 1; j < n; j++) out[j] = before < 0 ? 0 : out[before];
    return out;
  };
  const sliding = (
    values: readonly number[],
    radius: number,
    pick: (...window: number[]) => number,
  ): number[] => values.map((_, i) => pick(...values.slice(Math.max(0, i - radius), i + radius + 1)));
  const mean = (...values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
  // fill the hollows, smooth, and stand off the notes again (`keep`)
  const eased = (
    values: readonly number[],
    out: (...window: number[]) => number,
    back: (...window: number[]) => number,
    keep: (y: number, i: number) => number,
  ): number[] => {
    let line = sliding(sliding(values, WIDE, out), WIDE, back);
    line = sliding(sliding(line, ROUND, mean), ROUND, mean).map(keep);
    return sliding(line, 2, mean).map(keep);
  };
  const offTop = (y: number, i: number): number => Math.min(y, topMost[i] ?? Infinity);
  const offBottom = (y: number, i: number): number => Math.max(y, bottomMost[i] ?? -Infinity);
  const over = eased(bridge(top), Math.min, Math.max, offTop);
  const under = eased(bridge(bottom), Math.max, Math.min, offBottom);
  // both ends rounded, by this much at most
  const END = 26;
  const close = (i: number, d: number): void => {
    const radius = Math.min((under[i] - over[i]) / 2, END);
    if (d >= radius) return;
    const inset = radius - Math.sqrt(radius * radius - (radius - d) ** 2);
    over[i] = offTop(over[i] + inset, i);
    under[i] = offBottom(under[i] - inset, i);
  };
  for (let k = 0; k * STEP < END && k < n / 2 - 1; k++) {
    close(k, k * STEP);
    close(n - 1 - k, k * STEP);
  }
  const points = over.map((y, i) => ({ x: left + i * STEP, y }));
  for (let i = n - 1; i >= 0; i--) points.push({ x: left + i * STEP, y: under[i] });
  return points;
}

/** What stands over the notes already: a remark's marker or its words. */
export interface Taken {
  readonly xa: number;
  readonly xb: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where something `room` tall and from `xa` to `xb` wide can stand, at `y` or the least above it,
 * clear of what stands there already: its lower edge. Nothing is moved down.
 */
export function clearOf(taken: readonly Taken[], xa: number, xb: number, y: number, room: number): number {
  for (let again = true, turns = 0; again && turns < 40; turns++) {
    again = false;
    for (const other of taken) {
      if (other.xa < xb + 8 && other.xb > xa - 8 && y - room < other.bottom && y > other.top) {
        y = other.top - 4;
        again = true;
      }
    }
  }
  return y;
}

/**
 * Words cut to a width, the cut marked: `measure` says how wide a text is. Null where not even a
 * few letters fit.
 */
export function fitted(text: string, width: number, measure: (text: string) => number): string | null {
  if (measure(text) <= width) return text;
  let lo = 0;
  let hi = text.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(`${text.slice(0, mid).trimEnd()}…`) <= width) lo = mid;
    else hi = mid - 1;
  }
  return lo >= 4 ? `${text.slice(0, lo).trimEnd()}…` : null;
}

/**
 * The remarks about the whole piece in rows along the top, each after the other, a new row where
 * the width is used up.
 */
export function rowsOf(
  widths: readonly number[],
  left: number,
  right: number,
): { places: { x: number; row: number }[]; rows: number } {
  const places: { x: number; row: number }[] = [];
  let x = left;
  let row = 0;
  for (const width of widths) {
    if (x + width > right && x > left) {
      row++;
      x = left;
    }
    places.push({ x, row });
    x += width + 26;
  }
  return { places, rows: places.length > 0 ? row + 1 : 0 };
}

/** The zoom that keeps a moment under the same pixel: the new scale, and where to scroll to. */
export function zoomAbout(
  ppt: number,
  factor: number,
  anchor: number,
  gutter: number,
  scrollLeft: number,
): { ppt: number; scrollLeft: number } {
  const ms = (anchor - gutter + scrollLeft) / ppt;
  const next = clamp(ppt * factor, 0.002, 0.4);
  return { ppt: next, scrollLeft: Math.max(0, gutter + ms * next - anchor) };
}
