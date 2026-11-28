// The roll: the recording as a piano roll on its own clock, laid over a grand staff. A note is a
// box where the MPM renders it, on the staff it is written on, the louder the taller and the more
// solid; behind it, gray and dashed, its shadow, the same note as it was played. Over the notes
// stand the remarks: a brace over a passage, a hull round a set of notes, a bowed arrow for a
// direction, each with its words; those about the whole piece in rows above. Under the keys, the
// pedals. Nothing here is written: the roll is read.
import type { Ms, Ticks } from '../shared/units.ts';
import {
  clamp,
  clearOf,
  fitted,
  HULL,
  hullOf,
  keyRows,
  loudnessScale,
  rowsOf,
  solidity,
  staffReach,
  staffRows,
  tallness,
  zoomAbout,
  type LoudnessScale,
  type Point,
  type Rect,
  type Rows,
  type StaffReach,
  type Taken,
} from './geometry.ts';
import { accidental, fClef, G_CLEF_WIDTH, gClef } from './glyphs.ts';
import type { Bar, Grace, PieceNote, Press } from './piece.ts';
import type { Remark } from './remarks.ts';
import type { PedalKind, Sounded } from './rendering.ts';
import { BASS, ledgersOf, linesOf, signatureMarks, TREBLE, type Signature, type StaffName } from './staff.ts';

/** A note of the roll: as it was played, and as the MPM renders it on the recording's clock. */
export interface RollNote extends PieceNote {
  readonly mpm: Sounded;
}

/** A remark as the roll holds it: with the notes it is about, and the two an arrow goes between. */
export interface Marked {
  readonly remark: Remark;
  readonly own: readonly RollNote[];
  readonly ends: readonly [RollNote, RollNote] | null;
}

export interface RollData {
  readonly notes: readonly RollNote[];
  readonly graces: readonly Grace[];
  /** The pedals as they were pressed, and as the MPM moves them (0 to 127 from each move on). */
  readonly presses: readonly Press[];
  readonly moves: readonly { readonly kind: PedalKind; readonly ms: Ms; readonly value: number }[];
  readonly bars: readonly Bar[];
  readonly signature: Signature;
  /** When the tempo has a score position, on the recording's clock. */
  readonly msAt: (date: Ticks) => Ms;
  /** How long the roll is. */
  readonly total: Ms;
}

/** What the pointer is on. */
export interface Hit {
  readonly marked: Marked | null;
  readonly note: RollNote | null;
  /** Whether it is above the notes, among the rows of the whole piece and the ruler. */
  readonly above: boolean;
}

const LANE = 22; // a row of remarks about the whole piece
const RULER = 18;
const BRACE = 9;
const PEDAL = 9; // a pedal's row
const WORDS = 20; // the height of a remark's words on their ground
const FAR = 4 * (WORDS + 6); // how far above its marker a remark's words may stand
const PEDALS: readonly (readonly [PedalKind, string])[] = [
  ['sustain', 'Ped'],
  ['soft', 'u.c.'],
];
/** How long the notes take to move to where they are drawn next. */
const GLIDE: Ms = 420;

interface Palette {
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

interface NoteRect extends Rect {
  readonly ink: number;
}

/** Where a remark's marker stands: its extent, its lower edge, and the height its words sit above. */
interface Spot {
  readonly xa: number;
  readonly xb: number;
  readonly y: number;
  readonly point: number;
}

export class RollView {
  readonly #canvas: HTMLCanvasElement;
  readonly #scroller: HTMLElement;
  readonly #spacer: HTMLElement;
  readonly #c: CanvasRenderingContext2D;
  #palette: Palette | null = null;
  #data: RollData | null = null;
  #marked: readonly Marked[] = [];
  /** The remarks in the roll, the shortest first: its marker goes nearest its notes. */
  #inRoll: readonly Marked[] = [];
  #whole: readonly Marked[] = [];
  #scale: LoudnessScale = { level: 1, perOctave: 1 };
  #reach: StaffReach | null = null;
  #keys: readonly [number, number] = [36, 84];
  #width = 0;
  #height = 0;
  #gutter = 34;
  #lanes = 0;
  #top = 0;
  #head = 62;
  #bottom = 8;
  #rows: Rows = { rowH: 8, unit: 8, shift: 0, lo: 36, hi: 84, pad: 0 };
  #pedals: readonly (readonly [PedalKind, string])[] = [];
  /** Pixels per millisecond. */
  #ppt = 0.03;
  #staff = true;
  #pointed: Marked | null = null;
  #chosen: Marked | null = null;
  #pointedNote: string | null = null;
  /** A remark's rendering brought out: its notes drawn where that rendering has them. */
  #brought: { readonly marked: Marked | null; readonly shown: ReadonlyMap<string, Sounded> } | null = null;
  #tween: { readonly from: ReadonlyMap<string, Sounded>; readonly start: number; t: number } | null = null;
  #playhead: { ms: Ms; playing: boolean } = { ms: 0, playing: false };
  #frame = 0;
  /** What was drawn last, for the pointer: the notes, their shadows, the remarks' words and markers. */
  #rects: (NoteRect & { readonly note: RollNote })[] = [];
  #shades: (NoteRect & { readonly note: RollNote })[] = [];
  #marks: (Rect & { readonly marked: Marked })[] = [];
  readonly #widths = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement, scroller: HTMLElement, spacer: HTMLElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2D canvas');
    this.#canvas = canvas;
    this.#scroller = scroller;
    this.#spacer = spacer;
    this.#c = context;
    new ResizeObserver(() => {
      this.#resize();
    }).observe(scroller);
    scroller.addEventListener('scroll', () => {
      this.draw();
    });
  }

  /** The roll to show, and the remarks over it. */
  set(data: RollData, marked: readonly Marked[]): void {
    this.#data = data;
    this.#marked = marked;
    this.#inRoll = marked
      .filter(({ remark }) => remark.about.kind !== 'piece')
      .sort((a, b) => a.remark.about.to - a.remark.about.from - (b.remark.about.to - b.remark.about.from));
    this.#whole = marked.filter(({ remark }) => remark.about.kind === 'piece');
    this.#scale = loudnessScale(data.notes.map((note) => note.played.velocity));
    this.#reach = staffReach([...data.notes, ...data.graces]);
    const pitches = [...data.notes, ...data.graces].map((note) => note.pitch);
    this.#keys = [Math.min(...pitches), Math.max(...pitches)];
    this.#resize();
    // some 22 s across to begin with, a few bars, so that the remarks' words have room; in a
    // narrow window less, or a bar would be a finger wide
    this.#ppt = clamp((this.#width - this.#gutter) / 22000, 0.034, 0.09);
    this.#layout();
    this.draw();
  }

  get staff(): boolean {
    return this.#staff;
  }
  set staff(on: boolean) {
    this.#staff = on;
    this.#layout();
    this.draw();
  }

  get chosen(): Marked | null {
    return this.#chosen;
  }
  get pointed(): Marked | null {
    return this.#pointed;
  }
  get brought(): Marked | null {
    return this.#brought?.marked ?? null;
  }
  get remarks(): readonly Marked[] {
    return this.#marked;
  }

  choose(marked: Marked | null): void {
    if (this.#chosen === marked) return;
    this.#chosen = marked;
    this.draw();
  }

  point(marked: Marked | null, note: RollNote | null = null): void {
    if (this.#pointed === marked && this.#pointedNote === (note?.id ?? null)) return;
    this.#pointed = marked;
    this.#pointedNote = note?.id ?? null;
    this.draw();
  }

  /**
   * Draw the notes where a rendering has them (`shown`, on the roll's clock), or with null where
   * the MPM does; `glide` moves them there.
   */
  bring(
    rendering: { readonly marked: Marked | null; readonly shown: ReadonlyMap<string, Sounded> } | null,
    glide: boolean,
  ): void {
    if (glide && this.#data && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const from = new Map(this.#data.notes.map((note) => [note.id, this.#tweened(note)]));
      this.#tween = { from, start: performance.now(), t: 0 };
    }
    this.#brought = rendering;
    this.draw();
  }

  /** Where the playhead is, on the roll's clock, and whether it moves. */
  playhead(ms: Ms, playing: boolean): void {
    this.#playhead = { ms, playing };
    this.draw();
  }

  get playheadMs(): Ms {
    return this.#playhead.ms;
  }

  /** The time under a pixel of the canvas, and back. */
  msOf(px: number): Ms {
    return (px - this.#gutter + this.#scroller.scrollLeft) / this.#ppt;
  }
  #x(ms: Ms): number {
    return this.#gutter + ms * this.#ppt - this.#scroller.scrollLeft;
  }

  /** The stretch of the roll's time in view. */
  get inView(): { readonly from: Ms; readonly to: Ms } {
    return { from: this.msOf(this.#gutter), to: this.msOf(this.#width) };
  }

  zoom(factor: number, anchor: number = (this.#gutter + this.#width) / 2): void {
    const next = zoomAbout(this.#ppt, factor, anchor, this.#gutter, this.#scroller.scrollLeft);
    this.#ppt = next.ppt;
    this.#layout();
    this.#scroller.scrollLeft = next.scrollLeft;
    this.draw();
  }

  /** The whole roll across the window. */
  fit(): void {
    if (!this.#data) return;
    this.#ppt = Math.max(0.002, (this.#width - this.#gutter - 70) / this.#data.total);
    this.#layout();
    this.#scroller.scrollLeft = 0;
    this.draw();
  }

  /** Scroll so that a remark's passage is in view, a little of what comes before it with it. */
  reveal(marked: Marked): void {
    if (!this.#data || marked.remark.about.kind === 'piece') return;
    const from = this.#x(this.#data.msAt(marked.remark.about.from));
    const to = this.#x(this.#data.msAt(marked.remark.about.to));
    const room = this.#width - this.#gutter;
    if (from >= this.#gutter + 20 && to <= this.#width - 20) return;
    const lead = Math.max(40, Math.min(room * 0.25, (room - (to - from)) / 2));
    this.#scroller.scrollLeft = Math.max(0, this.#scroller.scrollLeft + from - this.#gutter - lead);
    this.draw();
  }

  /** What is drawn at a point of the canvas. */
  hit(x: number, y: number): Hit {
    const above = y < this.#top - 5;
    let marked: Marked | null = null;
    for (let i = this.#marks.length - 1; i >= 0 && !marked; i--) {
      const m = this.#marks[i];
      if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) marked = m.marked;
    }
    let note: RollNote | null = null;
    if (!marked && !above && x >= this.#gutter) {
      // the note itself, else the note whose shadow is there; of several, the smallest
      for (const rects of [this.#rects, this.#shades]) {
        let best: (NoteRect & { readonly note: RollNote }) | null = null;
        for (const rect of rects) {
          if (x < rect.x - 2 || x > rect.x + rect.w + 2 || y < rect.y - 2 || y > rect.y + rect.h + 2)
            continue;
          if (!best || rect.w * rect.h < best.w * best.h) best = rect;
        }
        if (best) {
          note = best.note;
          break;
        }
      }
    }
    return { marked, note, above };
  }

  get gutter(): number {
    return this.#gutter;
  }
  get width(): number {
    return this.#width;
  }
  get height(): number {
    return this.#height;
  }

  /** Draw at the next frame; asked many times before it, it draws once. */
  draw(): void {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#paint();
    });
  }

  /** The stylesheet's colours and faces, read once: asking in every frame has the browser work out styles in each. */
  get #colours(): Palette {
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

  #resize(): void {
    const ratio = window.devicePixelRatio || 1;
    this.#width = this.#scroller.clientWidth;
    this.#height = this.#scroller.clientHeight;
    this.#canvas.style.width = `${this.#width}px`;
    this.#canvas.style.height = `${this.#height}px`;
    this.#canvas.width = Math.max(1, Math.round(this.#width * ratio));
    this.#canvas.height = Math.max(1, Math.round(this.#height * ratio));
    this.#c.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.#layout();
    this.draw();
  }

  #layout(): void {
    const data = this.#data;
    if (!data || !this.#reach) return;
    this.#gutter = this.#staff ? 68 + 7 * data.signature.size : 34;
    this.#spacer.style.width = `${Math.ceil(this.#gutter + data.total * this.#ppt + 60)}px`;
    this.#top = this.#lanes * LANE + RULER + 6;
    this.#pedals = PEDALS.filter(
      ([kind]) =>
        data.presses.some((press) => press.kind === kind) || data.moves.some((move) => move.kind === kind),
    );
    this.#bottom = 8 + this.#pedals.length * (PEDAL + 4);
    // room for the remarks' words above the top note: the more, the taller the window
    this.#head = this.#inRoll.length > 0 ? clamp(this.#height * 0.25, 62, 164) : 26;
    const room = this.#height - this.#top - this.#head - this.#bottom;
    this.#rows = this.#staff ? staffRows(room, this.#reach) : keyRows(room, ...this.#keys);
  }

  /** How far a staff's positions are lifted, in rows: the treble staff stands apart from the bass. */
  #lift(staff: StaffName): number {
    return staff === 'treble' ? this.#rows.shift : 0;
  }
  /** The row a note is drawn in: its position on its staff, or its key. */
  #rowOf(note: { readonly staff: StaffName; readonly step: number; readonly pitch: number }): number {
    return this.#staff ? note.step + this.#lift(note.staff) : note.pitch;
  }
  #y(row: number): number {
    return this.#top + this.#head + this.#rows.pad + (this.#rows.hi - row + 0.5) * this.#rows.rowH;
  }

  /** A note as it is drawn now: where a remark brought out has it, else where the MPM does, on the way there. */
  #tweened(note: RollNote): Sounded {
    const to = this.#brought?.shown.get(note.id) ?? note.mpm;
    const from = this.#tween?.from.get(note.id);
    if (!this.#tween || !from) return to;
    const t = this.#tween.t;
    return {
      ms: from.ms + (to.ms - from.ms) * t,
      msEnd: from.msEnd + (to.msEnd - from.msEnd) * t,
      velocity: from.velocity + (to.velocity - from.velocity) * t,
    };
  }
  #rect(note: RollNote, sounded: Sounded): NoteRect {
    const h = this.#rows.unit * tallness(this.#scale, sounded.velocity);
    return {
      x: this.#x(sounded.ms),
      y: this.#y(this.#rowOf(note)) - h / 2,
      w: Math.max(2, (sounded.msEnd - sounded.ms) * this.#ppt),
      h,
      ink: solidity(this.#scale, sounded.velocity),
    };
  }
  #rectOf(note: RollNote): NoteRect {
    return this.#rect(note, this.#tweened(note));
  }
  #shadowOf(note: RollNote): NoteRect {
    return this.#rect(note, note.played);
  }

  #rounded(x: number, y: number, w: number, h: number, r: number): void {
    this.#c.beginPath();
    this.#c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  }
  #line(x0: number, y0: number, x1: number, y1: number): void {
    this.#c.beginPath();
    this.#c.moveTo(x0, y0);
    this.#c.lineTo(x1, y1);
    this.#c.stroke();
  }
  /** A line of a staff, or a ledger line, sharp on the pixels. */
  #staffLine(row: number, from: number, to: number): void {
    const y = Math.round(this.#y(row)) + 0.5;
    this.#line(from, y, to, y);
  }
  #staffRowsDrawn(): number[] {
    return [...BASS, ...TREBLE.map((step) => step + this.#lift('treble'))];
  }

  get #wordsFont(): string {
    return `500 14.5px ${this.#colours.serif}`;
  }
  #widthOf(text: string): number {
    let width = this.#widths.get(text);
    if (width === undefined) {
      this.#c.font = this.#wordsFont;
      width = this.#c.measureText(text).width;
      this.#widths.set(text, width);
    }
    return width;
  }
  /** A remark's words on one line, cut to a width; null where they do not fit at all. */
  #words(marked: Marked, most: number): string | null {
    return fitted(marked.remark.text.replace(/\s+/g, ' ').trim(), most, (text) => this.#widthOf(text));
  }

  /** A remark's words at a place, on a pale ground where they stand over the notes. */
  #label(
    marked: Marked,
    text: string,
    x: number,
    y: number,
    lit: boolean,
    alpha: number,
    over: boolean,
  ): void {
    const c = this.#c;
    const width = this.#widthOf(text);
    if (over) {
      c.globalAlpha = 1;
      c.fillStyle = lit ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.78)';
      this.#rounded(x - 4, y - WORDS / 2, width + 8, WORDS, 3);
      c.fill();
    }
    c.font = this.#wordsFont;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.globalAlpha = alpha;
    c.fillStyle = this.#colours.ink;
    c.fillText(text, x, y + 0.5);
    if (lit) {
      c.strokeStyle = this.#colours.ink;
      c.lineWidth = 1;
      this.#line(x, y + 9.5, x + width, y + 9.5);
    }
    c.globalAlpha = 1;
    this.#marks.push({ marked, x: x - 4, y: y - WORDS / 2, w: width + 8, h: WORDS });
  }

  #brace(x0: number, x1: number, y: number): void {
    const c = this.#c;
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
  #arrow(from: Point, to: Point, apex: number): void {
    const c = this.#c;
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

  /** A closed, smooth line through the middles between the points. */
  #soft(points: readonly Point[]): void {
    const c = this.#c;
    const n = points.length;
    if (n < 3) return;
    const between = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start = between(points[n - 1], points[0]);
    c.beginPath();
    c.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
      const to = between(points[i], points[(i + 1) % n]);
      c.quadraticCurveTo(points[i].x, points[i].y, to.x, to.y);
    }
    c.closePath();
  }

  #paint(): void {
    const c = this.#c;
    const data = this.#data;
    const palette = this.#colours;
    if (this.#tween) {
      const elapsed = (performance.now() - this.#tween.start) / GLIDE;
      if (elapsed >= 1) this.#tween = null;
      else this.#tween.t = 1 - (1 - elapsed) ** 3;
    }
    const width = this.#width;
    const height = this.#height;
    c.clearRect(0, 0, width, height);
    c.fillStyle = palette.roll;
    c.fillRect(0, 0, width, height);
    this.#rects = [];
    this.#shades = [];
    this.#marks = [];
    if (!data) return;

    // the rows of the remarks about the whole piece, as many as they take
    const whole = rowsOf(
      this.#whole.map((marked) => this.#widthOf(this.#words(marked, 420) ?? '')),
      this.#gutter + 8,
      width - 8,
    );
    const lanes = Math.min(whole.rows, 6);
    if (lanes !== this.#lanes) {
      this.#lanes = lanes;
      this.#layout();
    }
    const top = this.#top;
    const bottom = height - this.#bottom;
    const gutter = this.#gutter;
    const seen = (xa: number, xb: number): boolean => xb >= gutter && xa <= width;

    // the two staves, or a line under every C
    c.lineWidth = 1;
    if (this.#staff) {
      c.strokeStyle = palette.faint;
      c.globalAlpha = 0.55;
      for (const row of this.#staffRowsDrawn()) this.#staffLine(row, gutter, width);
    } else {
      c.strokeStyle = palette.grid;
      c.globalAlpha = 0.7;
      for (let pitch = this.#rows.lo; pitch <= this.#rows.hi; pitch++)
        if (pitch % 12 === 0) this.#staffLine(pitch - 0.5, gutter, width);
    }
    c.globalAlpha = 1;

    // bar lines, and the beats where there is room for them
    const bars: { bar: Bar; x: number }[] = [];
    for (const bar of data.bars) {
      const x = this.#x(data.msAt(bar.from));
      bars.push({ bar, x });
      const beat = ((this.#x(data.msAt(bar.to)) - x) * bar.beat) / (bar.to - bar.from);
      if (beat > 9) {
        c.strokeStyle = palette.grid;
        c.globalAlpha = 0.9;
        for (let date = bar.from + bar.beat; date < bar.to - 1; date += bar.beat) {
          const bx = Math.round(this.#x(data.msAt(date))) + 0.5;
          if (bx >= gutter && bx <= width) this.#line(bx, top, bx, bottom);
        }
      }
      if (x < gutter - 1 || x > width) continue;
      c.strokeStyle = palette.muted;
      c.globalAlpha = 0.7;
      this.#line(Math.round(x) + 0.5, top - 5, Math.round(x) + 0.5, bottom);
    }
    c.globalAlpha = 1;

    // what is lit: the remark pointed at, the one chosen, the one brought out; its notes stand out
    const focus = this.#pointed ?? this.#chosen ?? this.#brought?.marked ?? null;
    const evidence = focus && focus.own.length > 0 ? new Set(focus.own.map((note) => note.id)) : null;
    const dimmed = (id: string): boolean => evidence !== null && !evidence.has(id);
    const apart = (a: NoteRect, b: NoteRect): boolean =>
      Math.abs(a.x - b.x) >= 1.5 || Math.abs(a.h - b.h) >= 1 || Math.abs(a.x + a.w - b.x - b.w) >= 2.5;

    // shadows: the notes as recorded, only where they differ from the rendering to the eye
    c.lineWidth = 1;
    for (const note of data.notes) {
      const was = this.#shadowOf(note);
      if (!seen(was.x, was.x + was.w)) continue;
      if (!apart(was, this.#rectOf(note))) continue;
      const dim = dimmed(note.id);
      c.fillStyle = palette.ghost;
      c.strokeStyle = palette.ghost;
      // a shadow stays fainter than any note, and within that the louder is the darker
      c.globalAlpha = (0.08 + 0.48 * (was.ink - 0.3)) * (dim ? 0.3 : 1);
      this.#rounded(was.x, was.y, was.w, was.h, 2.5);
      c.fill();
      c.setLineDash([3, 2]);
      c.globalAlpha = dim ? 0.18 : 0.7;
      this.#rounded(was.x + 0.5, was.y + 0.5, Math.max(1, was.w - 1), Math.max(1, was.h - 1), 2.5);
      c.stroke();
      c.setLineDash([]);
      this.#shades.push({ note, ...was });
    }
    c.globalAlpha = 1;

    // the notes, the loudest first, so that a soft note over a loud one stays to be seen
    if (this.#staff) {
      c.strokeStyle = palette.muted;
      c.globalAlpha = 0.75;
      for (const note of data.notes) {
        const lines = ledgersOf(note.step, linesOf(note.staff));
        if (lines.length === 0) continue;
        const r = this.#rectOf(note);
        if (!seen(r.x, r.x + r.w)) continue;
        for (const line of lines) this.#staffLine(line + this.#lift(note.staff), r.x - 5, r.x + r.w + 5);
      }
    }
    const space = clamp(this.#rows.rowH * 2, 8, 15);
    for (const note of [...data.notes].sort((a, b) => b.mpm.velocity - a.mpm.velocity)) {
      const r = this.#rectOf(note);
      if (!seen(r.x - 14, r.x + r.w)) continue;
      const faded = dimmed(note.id) ? 0.22 : 1;
      const colour = note.part === 1 ? palette.right : palette.left;
      c.globalAlpha = r.ink * faded;
      c.fillStyle = colour;
      this.#rounded(r.x, r.y, r.w, r.h, 2.5);
      c.fill();
      c.globalAlpha = Math.min(1, r.ink + 0.25) * faded;
      c.fillRect(r.x, r.y, Math.min(2, r.w), r.h);
      // an accidental where the note departs from the key signature
      if (this.#staff && note.alter !== (data.signature.get(note.letter) ?? 0)) {
        c.strokeStyle = colour;
        accidental(c, note.alter, r.x - 2.5, r.y + r.h / 2, space);
      }
      this.#rects.push({ note, ...r });
    }
    c.globalAlpha = 1;

    // the note pointed at, tied to its shadow
    const pointedNote =
      this.#pointedNote === null ? null : data.notes.find((n) => n.id === this.#pointedNote);
    if (pointedNote) {
      const now = this.#rectOf(pointedNote);
      const was = this.#shadowOf(pointedNote);
      const y = Math.round(this.#y(this.#rowOf(pointedNote))) + 0.5;
      c.strokeStyle = palette.apart;
      c.lineWidth = 1.5;
      c.globalAlpha = 0.9;
      this.#line(now.x, y, was.x, y);
      this.#rounded(was.x + 0.5, was.y + 0.5, Math.max(1, was.w - 1), Math.max(1, was.h - 1), 2.5);
      c.stroke();
      c.globalAlpha = 1;
      c.lineWidth = 1;
    }

    // the pedals: a press as it was recorded is a shadow, how deep the MPM has the pedal solid
    const pedalY = (row: number): number => bottom + 6 + row * (PEDAL + 4);
    this.#pedals.forEach(([kind], row) => {
      const y = pedalY(row);
      c.fillStyle = palette.ghost;
      c.strokeStyle = palette.ghost;
      c.setLineDash([3, 2]);
      for (const press of data.presses) {
        if (press.kind !== kind) continue;
        const [xa, xb] = [this.#x(press.ms), this.#x(press.msEnd)];
        if (!seen(xa, xb)) continue;
        c.globalAlpha = 0.16;
        c.fillRect(xa, y, xb - xa, PEDAL);
        c.globalAlpha = 0.7;
        c.strokeRect(xa + 0.5, y + 0.5, Math.max(1, xb - xa - 1), PEDAL - 1);
      }
      c.setLineDash([]);
      // one outline for all its moves: drawn move by move, a ramp would be striped where they meet
      const moves = data.moves.filter((move) => move.kind === kind);
      const floor = y + PEDAL;
      c.fillStyle = palette.muted;
      c.globalAlpha = 0.85;
      c.beginPath();
      c.moveTo(this.#x(moves.at(0)?.ms ?? 0), floor);
      moves.forEach((move, i) => {
        const [xa, xb] = [this.#x(move.ms), this.#x(moves.at(i + 1)?.ms ?? data.total)];
        if (!seen(xa, xb)) return;
        const depth = (move.value / 127) * PEDAL;
        c.lineTo(xa, floor);
        c.lineTo(xa, floor - depth);
        c.lineTo(xb, floor - depth);
        c.lineTo(xb, floor);
      });
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
    });

    // the grace notes, where they were played
    for (const grace of data.graces) {
      const x = this.#x(grace.ms);
      if (x < gutter - 6 || x > width) continue;
      const y = this.#y(this.#rowOf(grace));
      const size = clamp(this.#rows.unit, 5, 13);
      c.fillStyle = palette.grace;
      c.globalAlpha = evidence ? 0.25 : 0.85;
      c.beginPath();
      c.moveTo(x, y - size * 0.7);
      c.lineTo(x + size, y);
      c.lineTo(x, y + size * 0.7);
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;

    c.save();
    c.beginPath();
    c.rect(gutter, top - 4, width - gutter, height - top + 4);
    c.clip();
    this.#paintRemarks(data, top, bottom, seen);
    c.restore();

    // above the roll: the remarks about the whole piece, and the ruler
    c.fillStyle = palette.ground;
    c.fillRect(0, 0, width, top - 5);
    c.strokeStyle = palette.rule;
    c.lineWidth = 1;
    this.#line(0, top - 5.5, width, top - 5.5);
    const anyLit = this.#pointed ?? this.#chosen;
    this.#whole.forEach((marked, i) => {
      const { x, row } = whole.places[i];
      const text = this.#words(marked, 420);
      if (row >= this.#lanes || text === null) return;
      const lit = this.#pointed === marked || this.#chosen === marked;
      this.#label(marked, text, x, 3 + row * LANE + 10, lit, lit || !anyLit ? 1 : 0.45, false);
    });
    const rulerY = this.#lanes * LANE + RULER / 2 + 2;
    c.font = `500 11px ${palette.sans}`;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = palette.ink;
    let lastLabel = -Infinity;
    for (const { bar, x } of bars) {
      if (x < gutter - 2 || x > width || x - lastLabel < 26) continue;
      lastLabel = x;
      c.fillText(String(bar.number), x + 4, rulerY);
    }

    // the playhead; the roll scrolls a page when it comes to the edge
    const { ms, playing } = this.#playhead;
    const head = this.#x(ms);
    if (playing && head > width - 36 && head < width + 260) this.#scroller.scrollLeft += head - gutter - 48;
    if ((playing || ms > 0) && head >= gutter - 1 && head <= width) {
      const hx = Math.round(head) + 0.5;
      c.strokeStyle = palette.ink;
      c.fillStyle = palette.ink;
      c.lineWidth = playing ? 1.5 : 1;
      c.globalAlpha = playing ? 0.85 : 0.3;
      this.#line(hx, top - 6, hx, bottom);
      c.globalAlpha = playing ? 1 : 0.5;
      c.beginPath();
      c.moveTo(hx - 5, top - 14);
      c.lineTo(hx + 5, top - 14);
      c.lineTo(hx, top - 6);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
      c.lineWidth = 1;
    }

    // the gutter: the staves' beginning, the clefs on their lines, the key
    c.fillStyle = palette.ground;
    c.fillRect(0, 0, gutter, height);
    c.strokeStyle = palette.rule;
    c.lineWidth = 1;
    this.#line(gutter - 0.5, 0, gutter - 0.5, height);
    if (this.#staff) {
      c.strokeStyle = palette.faint;
      c.globalAlpha = 0.55;
      for (const row of this.#staffRowsDrawn()) this.#staffLine(row, 5, gutter);
      c.globalAlpha = 1;
      c.strokeStyle = palette.muted;
      c.fillStyle = palette.muted;
      const staffSpace = this.#rows.rowH * 2;
      const axis = 8 + (G_CLEF_WIDTH / 2) * staffSpace;
      // the G clef curls round the second line from the bottom; the F clef's dots sit either side of the fourth
      gClef(c, axis, Math.round(this.#y(TREBLE[1] + this.#lift('treble'))) + 0.5, staffSpace);
      fClef(c, axis, Math.round(this.#y(BASS[3])) + 0.5, staffSpace);
      for (const staff of ['treble', 'bass'] as const)
        signatureMarks(data.signature, staff).forEach(({ alter, step }, index) => {
          accidental(c, alter, 66 + index * 7, this.#y(step + this.#lift(staff)), space);
        });
    }
    c.font = `400 10.5px ${palette.sans}`;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = palette.faint;
    if (!this.#staff)
      for (let pitch = this.#rows.lo; pitch <= this.#rows.hi; pitch++)
        if (pitch % 12 === 0) c.fillText(`C${Math.floor(pitch / 12) - 1}`, 7, this.#y(pitch));
    this.#pedals.forEach(([, label], row) => {
      c.fillText(label, 7, pedalY(row) + PEDAL / 2 + 0.5);
    });

    // again while the notes move or the playhead does
    if (this.#tween || playing) this.draw();
  }

  /**
   * The remarks in the roll: each marker where its notes are, the shortest passage's nearest its
   * notes, and the words above it wherever there is room, kept off one another. Where there is
   * none, the marker stands without words until it is pointed at.
   */
  #paintRemarks(
    data: RollData,
    top: number,
    bottom: number,
    seen: (xa: number, xb: number) => boolean,
  ): void {
    const c = this.#c;
    const palette = this.#colours;
    const width = this.#width;
    const gutter = this.#gutter;
    const taken: Taken[] = [];
    const ceiling = top + 3;
    const active = (marked: Marked): boolean => this.#pointed === marked || this.#chosen === marked;
    const anyLit = this.#pointed ?? this.#chosen;
    const strength = (marked: Marked): number => (active(marked) ? 1 : anyLit ? 0.28 : 0.7);
    const pencil = (alpha: number): void => {
      c.strokeStyle = palette.ink;
      c.fillStyle = palette.ink;
      c.lineWidth = 1.25;
      c.globalAlpha = alpha;
    };
    const topOf = (notes: readonly RollNote[]): number => {
      let y = bottom;
      for (const note of notes) y = Math.min(y, this.#rectOf(note).y, this.#shadowOf(note).y);
      return y;
    };

    /** A set of notes in its hull, an arrow from a note to another: they stand where their notes are. */
    const set = (marked: Marked, alpha: number): Spot | null => {
      const rects = marked.own.map((note) => this.#rectOf(note));
      if (rects.length === 0) return null;
      const xa = Math.min(...rects.map((r) => r.x)) - HULL;
      const xb = Math.max(...rects.map((r) => r.x + r.w)) + HULL;
      if (!seen(xa, xb)) return null;
      pencil(alpha);
      this.#soft(hullOf(rects, gutter - 60, width + 60));
      c.stroke();
      c.globalAlpha = alpha * 0.05;
      c.fill();
      const y = Math.min(...rects.map((r) => r.y)) - HULL - 1;
      taken.push({ xa, xb, top: y, bottom: Math.max(...rects.map((r) => r.y + r.h)) + HULL });
      this.#marks.push({ marked, x: xa, y: y - 4, w: xb - xa, h: 12 });
      return { xa, xb, y, point: y };
    };
    const arrow = (marked: Marked, alpha: number): Spot | null => {
      if (!marked.ends) return null;
      const [first, last] = marked.ends;
      const [a, b] = [this.#rectOf(first), this.#rectOf(last)];
      const from = { x: a.x + Math.min(a.w / 2, 5), y: a.y - 3 };
      const to = { x: Math.max(b.x + Math.min(b.w / 2, 3), from.x + 14), y: b.y - 4 };
      if (!seen(from.x, to.x)) return null;
      // over the notes of its hand that lie between
      const between = data.notes
        .filter((note) => note.part === first.part && note.date > first.date && note.date < last.date)
        .map((note) => this.#rectOf(note).y);
      const apex = Math.min(from.y, to.y, ...between) - clamp((to.x - from.x) * 0.08, 8, 22);
      pencil(alpha);
      this.#arrow(from, to, apex);
      taken.push({ xa: from.x, xb: to.x, top: apex - 2, bottom: Math.min(from.y, to.y) });
      this.#marks.push({ marked, x: from.x, y: apex - 6, w: to.x - from.x, h: 14 });
      return { xa: from.x, xb: to.x, y: apex - 2, point: apex - 2 };
    };
    /** A passage under its brace, which stands over its notes and over what is over them already. */
    const stretch = (marked: Marked, alpha: number): Spot | null => {
      const { from, to } = marked.remark.about;
      const xa = this.#x(data.msAt(from));
      const xb = Math.max(this.#x(data.msAt(to)), xa + 14);
      if (marked.own.length === 0 || !seen(xa, xb)) return null;
      const y = Math.max(clearOf(taken, xa, xb, topOf(marked.own) - 5, BRACE + 2), ceiling + BRACE);
      pencil(alpha);
      this.#brace(xa, xb, y);
      taken.push({ xa, xb, top: y - BRACE - 1, bottom: y });
      this.#marks.push({
        marked,
        x: Math.max(xa, gutter),
        y: y - BRACE - 2,
        w: Math.min(xb, width) - Math.max(xa, gutter),
        h: BRACE + 5,
      });
      return { xa, xb, y, point: y - BRACE };
    };

    // The hulls and the arrows first: they cannot move, and no words are to lie across them.
    const spots = new Map<Marked, Spot | null>();
    for (const marked of this.#inRoll) {
      const kind = marked.remark.about.kind;
      if (kind !== 'span') spots.set(marked, (kind === 'arrow' ? arrow : set)(marked, strength(marked)));
    }
    c.globalAlpha = 1;

    /** The lit remarks' words are drawn last, over everything, wherever they have to stand. */
    const later: (() => void)[] = [];
    for (const marked of this.#inRoll) {
      const lit = active(marked);
      const alpha = strength(marked);
      const spot = marked.remark.about.kind === 'span' ? stretch(marked, alpha) : spots.get(marked);
      c.globalAlpha = 1;
      if (!spot) continue;
      const mid = (spot.xa + spot.xb) / 2;
      // the words of a short passage are cut before they push everything else away
      const most = lit
        ? width - gutter - 20
        : clamp(spot.xb - spot.xa + 90, 130, Math.min(300, (width - gutter) * 0.6));
      const text = this.#words(marked, most);
      if (text === null) continue;
      const w = this.#widthOf(text);
      const x = clamp(mid - w / 2, gutter + 6, width - w - 8);
      const base = clearOf(taken, x - 4, x + w + 4, spot.point, WORDS + 2);
      // words stay near what they are about: further up than a few lines, they would be anyone's
      const fits = base - WORDS - 2 >= ceiling && spot.point - base <= FAR;
      if (!fits && !lit) continue;
      // lit, they stand right over their marker whatever stands there: they are drawn over it
      const y = fits ? base : Math.max(spot.point, ceiling + WORDS + 2);
      if (fits) taken.push({ xa: x - 4, xb: x + w + 4, top: y - WORDS - 2, bottom: y });
      const words = (): void => {
        // a hairline from the marker up to its words, where others stand between
        if (spot.point - y > 5 && mid > x && mid < x + w) {
          pencil(alpha * 0.6);
          c.lineWidth = 1;
          this.#line(Math.round(mid) + 0.5, spot.point - 1, Math.round(mid) + 0.5, y + 1);
          c.globalAlpha = 1;
        }
        this.#label(marked, text, x, y - WORDS / 2 - 1, lit, lit ? 1 : anyLit ? 0.4 : 1, true);
      };
      if (lit) later.push(words);
      else words();
    }
    for (const words of later) words();
  }
}
