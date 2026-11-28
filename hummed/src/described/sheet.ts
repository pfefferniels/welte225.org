// The sheet the roll is drawn on: where a time and a pitch lie on the canvas as it is laid out,
// zoomed and scrolled, and the colours of the page. The view sets it; whoever draws reads it.
import type { Ms } from '../shared/units.ts';
import { solidity, tallness, type LoudnessScale, type Rect, type Rows } from './geometry.ts';
import type { Sounded } from './rendering.ts';
import { BASS, TREBLE, type StaffName } from './staff.ts';

export const LANE = 22; // a row of remarks about the whole piece
export const RULER = 18;
export const PEDAL = 9; // a pedal's row
/** How far the roll scrolls past its end. */
export const AFTER = 60;

export interface Palette {
  readonly ground: string;
  readonly roll: string;
  readonly ink: string;
  readonly muted: string;
  readonly faint: string;
  readonly rule: string;
  readonly grid: string;
  readonly right: string;
  readonly left: string;
  readonly grace: string;
  readonly ghost: string;
  readonly apart: string;
  readonly sans: string;
  readonly serif: string;
}

/** A note as it is drawn: its box, and how solid. */
export interface NoteRect extends Rect {
  readonly ink: number;
}

export class Sheet {
  readonly c: CanvasRenderingContext2D;
  #palette: Palette | null = null;
  readonly #clear = new Map<string, string>();
  width = 0;
  height = 0;
  /** The gutter with the clefs on the left; the rows of the whole piece above; the ruler's lower edge. */
  gutter = 34;
  lanes = 0;
  top = 0;
  /** Room above the top note, and under the bottom one for the pedals. */
  head = 56;
  foot = 8;
  rows: Rows = { rowH: 8, unit: 8, shift: 0, lo: 36, hi: 84, pad: 0 };
  /** Whether the notes are on the two staves, or key by key. */
  staff = true;
  /** Pixels per millisecond, and how far the roll is scrolled. */
  ppt = 0.03;
  left = 0;
  scale: LoudnessScale = { level: 1, perOctave: 1 };

  constructor(c: CanvasRenderingContext2D) {
    this.c = c;
  }

  /** The stylesheet's colours and faces, read once: asking in every frame has the browser work out styles in each. */
  get palette(): Palette {
    if (this.#palette) return this.#palette;
    const style = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
    this.#palette = {
      ground: get('--ground', '#ffffff'),
      roll: get('--roll', '#fcfcfd'),
      ink: get('--ink', '#16181d'),
      muted: get('--muted', '#5b6270'),
      faint: get('--faint', '#8a909c'),
      rule: get('--rule', '#e5e7eb'),
      grid: get('--grid', '#d9dce2'),
      right: get('--right', '#1f4e8c'),
      left: get('--left', '#a3232f'),
      grace: get('--grace', '#6b3fa0'),
      ghost: get('--ghost', '#74808e'),
      apart: get('--apart', '#a3232f'),
      sans: get('--sans', 'Helvetica, Arial, sans-serif'),
      serif: get('--serif', 'Georgia, serif'),
    };
    return this.#palette;
  }

  /** A colour with nothing of it, which a fade goes to: the canvas says what the colour is. */
  clear(colour: string): string {
    let clear = this.#clear.get(colour);
    if (clear === undefined) {
      this.c.fillStyle = colour;
      const parts = /^#(..)(..)(..)$/.exec(this.c.fillStyle)?.slice(1);
      clear = parts ? `rgba(${parts.map((part) => parseInt(part, 16)).join(', ')}, 0)` : 'transparent';
      this.#clear.set(colour, clear);
    }
    return clear;
  }

  /** The lower edge of the notes' part of the roll: under it, the pedals. */
  get floor(): number {
    return this.height - this.foot;
  }
  /** How much of the roll's length is seen. */
  get view(): number {
    return this.width - this.gutter;
  }

  x(ms: Ms): number {
    return this.gutter + ms * this.ppt - this.left;
  }
  y(row: number): number {
    return this.top + this.head + this.rows.pad + (this.rows.hi - row + 0.5) * this.rows.rowH;
  }
  /** Whether a stretch from `xa` to `xb` has any part in the roll as it is seen. */
  seen(xa: number, xb: number): boolean {
    return xb >= this.gutter && xa <= this.width;
  }

  /** How far a staff's positions are lifted, in rows: the treble staff stands apart from the bass. */
  lift(staff: StaffName): number {
    return staff === 'treble' ? this.rows.shift : 0;
  }
  /** The row a note is drawn in: its position on its staff, or its key. */
  rowOf(note: { readonly staff: StaffName; readonly step: number; readonly pitch: number }): number {
    return this.staff ? note.step + this.lift(note.staff) : note.pitch;
  }
  /** The rows of the ten lines of the two staves. */
  staffRows(): number[] {
    return [...BASS, ...TREBLE.map((step) => step + this.lift('treble'))];
  }

  /** A note's box where it sounds: the louder the taller and the more solid. */
  rect(
    note: { readonly staff: StaffName; readonly step: number; readonly pitch: number },
    sounded: Sounded,
  ): NoteRect {
    const h = this.rows.unit * tallness(this.scale, sounded.velocity);
    return {
      x: this.x(sounded.ms),
      y: this.y(this.rowOf(note)) - h / 2,
      w: Math.max(2, (sounded.msEnd - sounded.ms) * this.ppt),
      h,
      ink: solidity(this.scale, sounded.velocity),
    };
  }

  rounded(x: number, y: number, w: number, h: number, r: number): void {
    this.c.beginPath();
    this.c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  }
  line(x0: number, y0: number, x1: number, y1: number): void {
    this.c.beginPath();
    this.c.moveTo(x0, y0);
    this.c.lineTo(x1, y1);
    this.c.stroke();
  }
  /** A line of a staff, or a ledger line, sharp on the pixels. */
  staffLine(row: number, from: number, to: number): void {
    const y = Math.round(this.y(row)) + 0.5;
    this.line(from, y, to, y);
  }
}
