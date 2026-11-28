// The roll: the recording on its own clock over a grand staff, and on it what was said of the
// playing. It is read like a map. At rest it is the staves, the bars and the remarks: each one's
// words where its notes are, and a bowed arrow for a direction; a remark is there by how wide its
// passage is on the screen, so that from afar the long passages' remarks are read and the short
// ones' come as one goes closer. The notes themselves come into sight for the remark that is
// pointed at or chosen, with the brace over its passage or the hull round its notes, and its words
// move out of their way: a box where the MPM renders each, on the staff it is written on, the
// louder the taller and the more solid, and behind it, gray and dashed, its shadow, the same note
// as it was played.
//
// This is the view: what is shown, how far it is zoomed and scrolled, and one frame after another.
// What a frame is made of is drawn by staves.ts, notes.ts and words.ts on the sheet (sheet.ts);
// what the pointer finds in it, pointer.ts says.
import type { Ms } from '../shared/units.ts';
import {
  clamp,
  FARTHEST,
  keyRows,
  loudnessScale,
  MARGIN,
  staffReach,
  staffRows,
  zoomAbout,
  type StaffReach,
} from './geometry.ts';
import { ease, Eased, GLIDE } from './motion.ts';
import { lightOf, paintGraces, paintNotes, paintPedals } from './notes.ts';
import { hitAt, noTargets, type Targets } from './pointer.ts';
import type { PedalKind, Sounded } from './rendering.ts';
import { AFTER, LANE, PEDAL, RULER, Sheet } from './sheet.ts';
import {
  paintBars,
  paintGutter,
  paintHeader,
  paintPlayhead,
  paintRuler,
  paintStaves,
  type BarAt,
} from './staves.ts';
import type { Hit, Marked, RollData, RollNote } from './types.ts';
import { Remarks } from './words.ts';

const PEDALS: readonly (readonly [PedalKind, string])[] = [
  ['sustain', 'Ped'],
  ['soft', 'u.c.'],
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class RollView {
  readonly #canvas: HTMLCanvasElement;
  readonly #scroller: HTMLElement;
  readonly #spacer: HTMLElement;
  readonly #sheet: Sheet;
  readonly #calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  readonly #remarks = new Remarks();
  #data: RollData | null = null;
  /** What does not change with the zoom: the bars and their beats, the notes from the loudest on. */
  #bars: BarAt[] = [];
  #loudFirst: readonly RollNote[] = [];
  #reach: StaffReach | null = null;
  #keys: readonly [number, number] = [36, 84];
  #pedals: readonly (readonly [PedalKind, string])[] = [];
  /** A zoom under way: from one scale to another about a place, or to the roll's beginning. */
  #zooming: {
    readonly from: number;
    readonly to: number;
    readonly start: number;
    readonly scroll: number;
    readonly anchor: number | null;
  } | null = null;
  /** Whether all notes are in sight all the time, and whether the piece plays from the line. */
  readonly #every = new Eased(0);
  readonly #following = new Eased(0);
  #pointed: Marked | null = null;
  #chosen: Marked | null = null;
  #pointedNote: string | null = null;
  /** A remark's rendering brought out: its notes drawn where that rendering has them. */
  #brought: { readonly marked: Marked | null; readonly shown: ReadonlyMap<string, Sounded> } | null = null;
  #tween: { readonly from: ReadonlyMap<string, Sounded>; readonly start: number; t: number } | null = null;
  #playhead: { ms: Ms; playing: boolean } = { ms: 0, playing: false };
  #frame = 0;
  /** After the layout has changed, everything is where it belongs at once: nothing glides there. */
  #fresh = true;
  /** What was drawn last, for the pointer. */
  #targets: Targets = noTargets();

  constructor(canvas: HTMLCanvasElement, scroller: HTMLElement, spacer: HTMLElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2D canvas');
    this.#canvas = canvas;
    this.#scroller = scroller;
    this.#spacer = spacer;
    this.#sheet = new Sheet(context);
    new ResizeObserver(() => {
      this.#resize();
    }).observe(scroller);
    scroller.addEventListener('scroll', () => {
      this.draw();
    });
  }

  /** The roll to show, and the remarks over it. */
  set(data: RollData, marked: readonly Marked[]): void {
    const sheet = this.#sheet;
    this.#data = data;
    this.#remarks.set(data, marked);
    this.#bars = data.bars.map((bar) => {
      const beats: Ms[] = [];
      for (let date = bar.from + bar.beat; date < bar.to - 1; date += bar.beat) beats.push(data.msAt(date));
      return { bar, ms: data.msAt(bar.from), beats };
    });
    this.#loudFirst = [...data.notes].sort((a, b) => b.mpm.velocity - a.mpm.velocity);
    sheet.scale = loudnessScale(data.notes.map((note) => note.played.velocity));
    this.#reach = staffReach([...data.notes, ...data.graces]);
    const pitches = [...data.notes, ...data.graces].map((note) => note.pitch);
    this.#keys = [Math.min(...pitches), Math.max(...pitches)];
    this.#pedals = PEDALS.filter(
      ([kind]) =>
        data.presses.some((press) => press.kind === kind) || data.moves.some((move) => move.kind === kind),
    );
    this.#resize();
    // some 22 s across to begin with, a few bars; in a narrow window less, or a bar would be a
    // finger wide
    sheet.ppt = clamp(sheet.view / 22000, 0.034, 0.09);
    this.#layout();
    this.draw();
  }

  get staff(): boolean {
    return this.#sheet.staff;
  }
  set staff(on: boolean) {
    this.#sheet.staff = on;
    this.#fresh = true;
    this.#layout();
    this.draw();
  }

  /** Whether all notes are in sight all the time, not only those of the remark in hand. */
  get allNotes(): boolean {
    return this.#every.target === 1;
  }
  set allNotes(on: boolean) {
    this.#every.aim(on ? 1 : 0, performance.now(), this.#glide);
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

  choose(marked: Marked | null): void {
    if (this.#chosen === marked) return;
    this.#chosen = marked;
    this.#relight();
  }

  point(marked: Marked | null, note: RollNote | null = null): void {
    if (this.#pointed === marked && this.#pointedNote === (note?.id ?? null)) return;
    this.#pointed = marked;
    this.#pointedNote = note?.id ?? null;
    this.#relight();
  }

  /** Light the remark pointed at, the one chosen and the one brought out; let the others go out. */
  #relight(): void {
    const held = (marked: Marked): boolean => marked === this.#pointed || marked === this.#chosen;
    this.#remarks.relight(
      (marked) => held(marked) || marked === this.#brought?.marked,
      performance.now(),
      this.#glide,
    );
    // a remark that is let go holds the pointer no longer, though the roll still shows it lit
    this.#targets.holds = this.#targets.holds.filter(({ marked }) => held(marked));
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
    if (glide && this.#data && this.#glide > 0) {
      const from = new Map(this.#data.notes.map((note) => [note.id, this.#tweened(note)]));
      this.#tween = { from, start: performance.now(), t: 0 };
    }
    this.#brought = rendering;
    this.#relight();
  }

  /** Where the playhead is, on the roll's clock, and whether it moves. */
  playhead(ms: Ms, playing: boolean): void {
    this.#playhead = { ms, playing };
    this.draw();
  }

  get playheadMs(): Ms {
    return this.#playhead.ms;
  }

  /** Whether the piece plays from the line, no remark's passage: the notes then come into sight around the line. */
  follow(on: boolean): void {
    this.#following.aim(on ? 1 : 0, performance.now(), this.#glide);
    this.draw();
  }

  /** The time under a pixel of the canvas. */
  msOf(px: number): Ms {
    return (px - this.#sheet.gutter + this.#scroller.scrollLeft) / this.#sheet.ppt;
  }

  /** The stretch of the roll's time in view. */
  get inView(): { readonly from: Ms; readonly to: Ms } {
    return { from: this.msOf(this.#sheet.gutter), to: this.msOf(this.#sheet.width) };
  }

  /** Pixels per millisecond: the scale the roll is at, or is going to. */
  get scale(): number {
    return this.#zooming?.to ?? this.#sheet.ppt;
  }

  /** Zoom about a place of the canvas; `glide` goes there, otherwise it is there at once. */
  zoom(factor: number, anchor: number = (this.#sheet.gutter + this.#sheet.width) / 2, glide = true): void {
    this.#zoomTo(zoomAbout(this.scale, factor, anchor, this.#sheet.gutter, 0).ppt, anchor, glide);
  }

  /** The whole roll across the window. */
  fit(): void {
    if (!this.#data) return;
    this.#zoomTo(Math.max(FARTHEST, (this.#sheet.view - MARGIN) / this.#data.total), null, true);
  }

  #zoomTo(to: number, anchor: number | null, glide: boolean): void {
    this.#zooming = {
      from: this.#sheet.ppt,
      to,
      start: performance.now(),
      scroll: this.#scroller.scrollLeft,
      anchor,
    };
    if (!glide || this.#glide === 0) this.#zoomOn(Infinity);
    this.draw();
  }

  /** The zoom under way, as far as it has come at `now`. */
  #zoomOn(now: number): void {
    const zooming = this.#zooming;
    if (!zooming) return;
    const t = Math.min(1, (now - zooming.start) / GLIDE);
    // by ratios: every step of the way looks as far as the last
    const factor = (zooming.to / zooming.from) ** ease(t);
    const next =
      zooming.anchor === null
        ? { ppt: zooming.from * factor, scrollLeft: zooming.scroll * factor * (1 - ease(t)) }
        : zoomAbout(zooming.from, factor, zooming.anchor, this.#sheet.gutter, zooming.scroll);
    this.#sheet.ppt = next.ppt;
    this.#layout();
    this.#scroller.scrollLeft = next.scrollLeft;
    if (t >= 1) this.#zooming = null;
  }

  /** Scroll so that a remark's passage is in view, a little of what comes before it with it. */
  reveal(marked: Marked): void {
    const span = this.#remarks.spanOf(marked);
    if (!span || marked.remark.about.kind === 'piece') return;
    const { gutter, width, view, ppt } = this.#sheet;
    const scroll = this.#scroller.scrollLeft;
    const from = gutter + span.from * ppt - scroll;
    const to = gutter + span.to * ppt - scroll;
    if (from >= gutter + 20 && to <= width - 20) return;
    const lead = Math.max(40, Math.min(view * 0.25, (view - (to - from)) / 2));
    this.#scroller.scrollLeft = Math.max(0, scroll + from - gutter - lead);
    this.draw();
  }

  /** Whether a remark is there at this zoom, enough to be read and found. */
  readable(marked: Marked): boolean {
    return marked === this.#chosen || this.#remarks.found(marked, this.scale, this.#sheet.view);
  }

  /** What is drawn at a point of the canvas. */
  hit(x: number, y: number): Hit {
    return hitAt(this.#targets, x, y, this.#sheet.top, this.#sheet.gutter);
  }

  get gutter(): number {
    return this.#sheet.gutter;
  }
  get width(): number {
    return this.#sheet.width;
  }
  get height(): number {
    return this.#sheet.height;
  }

  /** Draw at the next frame; asked many times before it, it draws once. */
  draw(): void {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#paint();
    });
  }

  /** How long a glide takes: no time for a reader who has asked for less motion. */
  get #glide(): Ms {
    return this.#calm.matches ? 0 : GLIDE;
  }

  #resize(): void {
    const sheet = this.#sheet;
    const ratio = window.devicePixelRatio || 1;
    sheet.width = this.#scroller.clientWidth;
    sheet.height = this.#scroller.clientHeight;
    this.#canvas.style.width = `${sheet.width}px`;
    this.#canvas.style.height = `${sheet.height}px`;
    this.#canvas.width = Math.max(1, Math.round(sheet.width * ratio));
    this.#canvas.height = Math.max(1, Math.round(sheet.height * ratio));
    sheet.c.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.#fresh = true;
    this.#layout();
    this.draw();
  }

  #layout(): void {
    const sheet = this.#sheet;
    const data = this.#data;
    if (!data || !this.#reach) return;
    sheet.gutter = sheet.staff ? 68 + 7 * data.signature.size : 34;
    this.#spacer.style.width = `${Math.ceil(sheet.gutter + data.total * sheet.ppt + AFTER)}px`;
    sheet.top = sheet.lanes * LANE + RULER + 6;
    sheet.foot = 8 + this.#pedals.length * (PEDAL + 4);
    // room above the top note for a brace, and for the words of a remark that have given way
    sheet.head = this.#remarks.any ? clamp(sheet.height * 0.11, 46, 68) : 26;
    const room = sheet.height - sheet.top - sheet.head - sheet.foot;
    sheet.rows = sheet.staff ? staffRows(room, this.#reach) : keyRows(room, ...this.#keys);
    this.#remarks.laidOut();
  }

  /** A note as it is drawn now: where a remark brought out has it, else where the MPM does, on the way there. */
  #tweened(note: RollNote): Sounded {
    const to = this.#brought?.shown.get(note.id) ?? note.mpm;
    const from = this.#tween?.from.get(note.id);
    if (!this.#tween || !from) return to;
    const t = this.#tween.t;
    return {
      ms: lerp(from.ms, to.ms, t),
      msEnd: lerp(from.msEnd, to.msEnd, t),
      velocity: lerp(from.velocity, to.velocity, t),
    };
  }

  #paint(): void {
    const sheet = this.#sheet;
    const { c } = sheet;
    const data = this.#data;
    const now = performance.now();
    this.#zoomOn(now);
    sheet.left = this.#scroller.scrollLeft;
    if (this.#tween) {
      const elapsed = (now - this.#tween.start) / GLIDE;
      if (elapsed >= 1) this.#tween = null;
      else this.#tween.t = ease(elapsed);
    }
    c.clearRect(0, 0, sheet.width, sheet.height);
    c.fillStyle = sheet.palette.roll;
    c.fillRect(0, 0, sheet.width, sheet.height);
    this.#targets = noTargets();
    if (!data) return;

    // the rows of the remarks about the whole piece, as many as they take
    const lanes = this.#remarks.lanes(sheet);
    if (Math.min(lanes.rows, 6) !== sheet.lanes) {
      sheet.lanes = Math.min(lanes.rows, 6);
      this.#fresh = true;
      this.#layout();
    }
    paintStaves(sheet);
    paintBars(sheet, this.#bars, data.total);

    const sounded = (note: RollNote): Sounded => this.#tweened(note);
    const shown = this.#remarks.arrange(sheet, now, this.#fresh ? 0 : this.#glide, sounded);
    const { lit, whole } = this.#remarks.lit(shown, now);
    const { ms, playing } = this.#playhead;
    const light = lightOf(lit, whole, this.#every.at(now), this.#following.at(now), ms);
    const notes = paintNotes(sheet, this.#loudFirst, light, data.signature, sounded, this.#pointedNote);
    paintPedals(sheet, data, this.#pedals, light);
    paintGraces(sheet, data.graces, light);
    c.save();
    c.beginPath();
    c.rect(sheet.gutter, sheet.top - 4, sheet.view, sheet.height - sheet.top + 4);
    c.clip();
    const remarks = this.#remarks.paint(sheet, shown, light.any, this.#pointed, this.#chosen);
    c.restore();

    paintHeader(sheet);
    const above = this.#remarks.paintWhole(sheet, lanes, light.any, now);
    paintRuler(sheet, this.#bars, data.total);
    // the roll scrolls a page when the playhead comes to the edge
    const head = sheet.x(ms);
    if (playing && head > sheet.width - 36 && head < sheet.width + 260)
      this.#scroller.scrollLeft += head - sheet.gutter - 48;
    paintPlayhead(sheet, ms, playing);
    paintGutter(sheet, data.signature, this.#pedals);

    this.#targets = { ...notes, marks: [...remarks.marks, ...above], holds: remarks.holds };
    this.#fresh = false;
    // again while anything is on its way
    if (
      this.#remarks.gliding(now) ||
      this.#zooming ||
      this.#tween ||
      playing ||
      this.#every.moving(now) ||
      this.#following.moving(now)
    )
      this.draw();
  }
}
