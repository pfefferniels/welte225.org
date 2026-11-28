// The remarks on the roll: each one's words where its notes are, and what marks its range. At rest
// the roll is words and arrows: a direction's bowed arrow is always there with its words; the brace
// over a passage and the hull round a set of notes come with the notes, when the remark is lit, and
// go with them. A remark is there by how wide its passage is on the screen (geometry.ts), and its
// words stand so that none lie on one another, wherever the roll is scrolled to.
import type { Ms, Ticks } from '../shared/units.ts';
import {
  clamp,
  fitted,
  HULL,
  hullOf,
  LEAST,
  MARGIN,
  placeWords,
  presence,
  rowsOf,
  smoothstep,
  standing,
  type Point,
  type Rect,
} from './geometry.ts';
import { arrow, BRACE, brace, soft } from './marks.ts';
import { Eased } from './motion.ts';
import type { Lit } from './notes.ts';
import type { Sounded } from './rendering.ts';
import { AFTER, LANE, type Sheet } from './sheet.ts';
import type { Marked, RollData, RollNote } from './types.ts';

const WORDS = 20; // the height of a remark's words on their ground
/** How much there a remark has to be for the pointer and the arrow keys to find it. */
const FOUND = 0.3;
/** How strong an arrow is at rest; lit, it is whole. */
const ARROW = 0.5;
/** While something is lit, how much is left of the other remarks' words, their ground and their arrows. */
const BESIDE = { words: 0.3, ground: 0.12, arrow: 0.5 } as const;
/** Words whose room changes by less than this as the zoom goes simply have it; by more, they glide. */
const STEP = 12;
/** Words that found no room are read once their remark is lit: they grow from so wide. */
const UNPLACED = 130;
/** The words' faces, by how long the passage is in the score: a bar and more, half a bar and more, less. */
const FACES: readonly (readonly [Ticks, string])[] = [
  [2880, '600 16px'],
  [1440, '500 14.5px'],
  [0, '400 13.5px'],
];

/** A remark's passage in the roll's time, and the stretch that is played for it. */
interface Span {
  readonly from: Ms;
  readonly to: Ms;
  readonly heard: readonly [Ms, Ms];
}

/**
 * What of a remark moves in time: how lit it is, how far its words are off their place, up or
 * down, and how far their room reaches to either side of the middle of its passage.
 */
interface Moving {
  readonly lit: Eased;
  readonly off: Eased;
  readonly left: Eased;
  readonly right: Eased;
  /**
   * Whether it was there when the roll was last drawn, and its words had a place: what comes into
   * sight is where it belongs at once.
   */
  there: boolean;
  placed: boolean;
}

/** What marks a remark's range, as it stands in a frame. */
type Spot =
  | { readonly kind: 'brace'; readonly xa: number; readonly xb: number; readonly y: number }
  | { readonly kind: 'arrow'; readonly from: Point; readonly to: Point; readonly apex: number }
  | {
      readonly kind: 'hull';
      readonly rects: readonly Rect[];
      readonly xa: number;
      readonly xb: number;
      readonly y: number;
    };

/** A remark as it is drawn in a frame. */
export interface Shown {
  readonly marked: Marked;
  readonly xa: number;
  readonly xb: number;
  /** How lit it is, how much there (lit, it is), and how far forward it stands, each 0 to 1. */
  readonly lit: number;
  readonly there: number;
  readonly forward: number;
  readonly spot: Spot;
  /**
   * Its words at rest: their face, the middle of its passage, which they stand over, their height
   * (none where they found no room), and from where to where they have room.
   */
  readonly words: {
    readonly font: string;
    readonly cx: number;
    readonly cy: number | null;
    readonly left: number;
    readonly right: number;
  };
}

/** The remarks about the whole piece in their rows above the ruler. */
export interface Lanes {
  readonly rows: number;
  readonly places: readonly {
    readonly x: number;
    readonly row: number;
    readonly text: string | null;
    readonly font: string;
  }[];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const length = ({ remark }: Marked): Ticks => remark.about.to - remark.about.from;

export class Remarks {
  /** The remarks in the roll, the shortest passage's first, and those about the whole piece. */
  #inRoll: readonly Marked[] = [];
  #whole: readonly Marked[] = [];
  #total: Ms = 0;
  readonly #spans = new Map<Marked, Span>();
  /** The notes an arrow bows over: those of its hand between its two ends. */
  readonly #between = new Map<Marked, readonly RollNote[]>();
  /** The remarks on shorter passages within each remark's own: those it steps back for. */
  readonly #within = new Map<Marked, readonly Marked[]>();
  readonly #moving = new Map<Marked, Moving>();
  /** Where each remark's notes are in the height: their top, their bottom, their middle. As laid out. */
  readonly #extents = new Map<
    Marked,
    { readonly top: number; readonly bottom: number; readonly cy: number }
  >();
  readonly #widths = new Map<string, number>();

  set(data: RollData, marked: readonly Marked[]): void {
    this.#inRoll = marked
      .filter(({ remark, own }) => remark.about.kind !== 'piece' && own.length > 0)
      .sort((a, b) => length(a) - length(b));
    this.#whole = marked.filter(({ remark }) => remark.about.kind === 'piece');
    this.#total = data.total;
    this.#spans.clear();
    this.#between.clear();
    this.#within.clear();
    this.#moving.clear();
    this.#extents.clear();
    for (const one of marked) {
      const { from, to } = one.remark.about;
      const heard = one.heard ?? { from, to };
      this.#spans.set(one, {
        from: data.msAt(from),
        to: data.msAt(to),
        heard: [data.msAt(heard.from), data.msAt(heard.to)],
      });
      this.#moving.set(one, {
        lit: new Eased(0),
        off: new Eased(0),
        left: new Eased(0),
        right: new Eased(0),
        there: false,
        placed: false,
      });
      if (!one.ends) continue;
      const [first, last] = one.ends;
      this.#between.set(
        one,
        data.notes.filter((n) => n.part === first.part && n.date > first.date && n.date < last.date),
      );
    }
    for (const one of this.#inRoll)
      this.#within.set(
        one,
        this.#inRoll.filter(
          (other) =>
            length(other) < length(one) &&
            other.remark.about.from < one.remark.about.to &&
            other.remark.about.to > one.remark.about.from,
        ),
      );
  }

  get any(): boolean {
    return this.#inRoll.length > 0;
  }

  /** The roll is laid out anew: where the notes are in the height is to be found again. */
  laidOut(): void {
    this.#extents.clear();
  }

  /** A remark's passage in the roll's time. */
  spanOf(marked: Marked): { readonly from: Ms; readonly to: Ms } | undefined {
    return this.#spans.get(marked);
  }

  /** How much a remark is there at a zoom (`ppt`), in a window whose roll is `view` wide. */
  presenceOf(marked: Marked, ppt: number, view: number): number {
    const span = this.#spans.get(marked);
    if (!span) return 0;
    return marked.remark.about.kind === 'piece' ? 1 : presence((span.to - span.from) * ppt, view - MARGIN);
  }

  /** Whether a remark is there enough to be read and found. */
  found(marked: Marked, ppt: number, view: number): boolean {
    return this.presenceOf(marked, ppt, view) >= FOUND;
  }

  /** Light the remarks that `on` says, and let the others go out, each in `glide`. */
  relight(on: (marked: Marked) => boolean, now: number, glide: Ms): void {
    for (const [marked, { lit }] of this.#moving) lit.aim(on(marked) ? 1 : 0, now, glide);
  }

  /** Whether anything of the remarks is on its way. */
  gliding(now: number): boolean {
    for (const { lit, off, left, right } of this.#moving.values())
      if (lit.moving(now) || off.moving(now) || left.moving(now) || right.moving(now)) return true;
    return false;
  }

  /** What is lit, for the notes: the remarks in the roll, and how lit the most lit about the whole piece is. */
  lit(shown: readonly Shown[], now: number): { readonly lit: Lit[]; readonly whole: number } {
    const lit = shown.flatMap(({ marked, lit: by }): Lit[] => {
      const span = this.#spans.get(marked);
      return by > 0 && span ? [{ own: marked.own, around: marked.around, lit: by, ...span }] : [];
    });
    const whole = Math.max(0, ...this.#whole.map((marked) => this.#moving.get(marked)?.lit.at(now) ?? 0));
    return { lit, whole };
  }

  /** Where a remark's notes are in the height, as the MPM and the playing have them. */
  #extentOf(
    sheet: Sheet,
    marked: Marked,
  ): { readonly top: number; readonly bottom: number; readonly cy: number } {
    let extent = this.#extents.get(marked);
    if (extent) return extent;
    let top = Infinity;
    let bottom = -Infinity;
    for (const note of marked.own) {
      const louder = note.mpm.velocity > note.played.velocity ? note.mpm : note.played;
      const r = sheet.rect(note, louder);
      top = Math.min(top, r.y);
      bottom = Math.max(bottom, r.y + r.h);
    }
    // an arrow's words stand with the hand it runs through, a passage's between all its notes
    const hand = marked.ends?.[0].part;
    const line = marked.own.filter((note) => hand === undefined || note.part === hand);
    const cy = line.reduce((sum, note) => sum + sheet.y(sheet.rowOf(note)), 0) / Math.max(1, line.length);
    extent = { top, bottom, cy };
    this.#extents.set(marked, extent);
    return extent;
  }

  /** The face of a remark's words: the longer its passage in the score, the larger. */
  #faceOf(sheet: Sheet, marked: Marked): string {
    const reach = marked.remark.about.kind === 'piece' ? Infinity : length(marked);
    const face = FACES.find(([least]) => reach >= least) ?? FACES[FACES.length - 1];
    return `${face[1]} ${sheet.palette.serif}`;
  }
  #widthOf(sheet: Sheet, text: string, font: string): number {
    const key = `${font}\n${text}`;
    let width = this.#widths.get(key);
    if (width === undefined) {
      sheet.c.font = font;
      width = sheet.c.measureText(text).width;
      this.#widths.set(key, width);
    }
    return width;
  }
  /** A remark's words on one line, cut to a width; null where they do not fit at all. */
  #words(sheet: Sheet, marked: Marked, font: string, most: number): string | null {
    return fitted(marked.remark.text.replace(/\s+/g, ' ').trim(), Math.ceil(most / 6) * 6, (text) =>
      this.#widthOf(sheet, text, font),
    );
  }

  /**
   * The remarks that are there, each where it stands in this frame: what marks it by its notes, and
   * its words over the middle of its passage at the height of its notes, with room for all they
   * say where nothing stands in the way, and otherwise less of it, or put off their place
   * (`placeWords`), the longer passage's before the shorter's. Where they stand does not depend on
   * where the roll is scrolled to; with the zoom it changes, and they glide there (`glide`: in how
   * long).
   */
  arrange(sheet: Sheet, now: number, glide: Ms, sounded: (note: RollNote) => Sounded): Shown[] {
    const { view, gutter, width, ppt } = sheet;
    const ceiling = sheet.top + 3;
    const present: (Omit<Shown, 'words'> & {
      readonly moving: Moving;
      readonly come: boolean;
      readonly lasts: Ms;
    })[] = [];

    for (const marked of this.#inRoll) {
      const moving = this.#moving.get(marked);
      const span = this.#spans.get(marked);
      if (!moving || !span) continue;
      const xa = sheet.x(span.from);
      const xb = Math.max(sheet.x(span.to), xa + 14);
      const lit = moving.lit.at(now);
      const there = Math.max(this.presenceOf(marked, ppt, view), lit);
      const come = !moving.there;
      moving.there = there > 0;
      if (there <= 0) continue;
      const extent = this.#extentOf(sheet, marked);
      // gone into closely, it steps back for the shorter passages' remarks in it, as far as they are there
      const shorter = Math.max(
        0,
        ...(this.#within.get(marked) ?? []).map((other) => this.presenceOf(other, ppt, view)),
      );
      const forward = lerp(1 - (1 - standing(xb - xa, view)) * shorter, 1, lit);
      const kind = marked.remark.about.kind;
      let spot: Spot;
      if (kind === 'arrow' && marked.ends) {
        const [a, b] = [
          sheet.rect(marked.ends[0], sounded(marked.ends[0])),
          sheet.rect(marked.ends[1], sounded(marked.ends[1])),
        ];
        const from = { x: a.x + Math.min(a.w / 2, 5), y: a.y - 3 };
        const to = { x: Math.max(b.x + Math.min(b.w / 2, 3), from.x + 14), y: b.y - 4 };
        // over the notes of its hand that lie between
        const between = (this.#between.get(marked) ?? []).map((note) => sheet.rect(note, sounded(note)).y);
        spot = {
          kind: 'arrow',
          from,
          to,
          apex: Math.min(from.y, to.y, ...between) - clamp((to.x - from.x) * 0.08, 8, 22),
        };
      } else if (kind === 'span' || kind === 'arrow') {
        spot = { kind: 'brace', xa, xb, y: Math.max(extent.top - 5, ceiling + BRACE) };
      } else {
        const rects = marked.own.map((note) => sheet.rect(note, sounded(note)));
        spot = {
          kind: 'hull',
          rects,
          xa: Math.min(...rects.map((r) => r.x)) - HULL,
          xb: Math.max(...rects.map((r) => r.x + r.w)) + HULL,
          y: Math.min(...rects.map((r) => r.y)) - HULL - 1,
        };
      }
      present.push({ marked, xa, xb, lit, there, forward, spot, moving, come, lasts: span.to - span.from });
    }

    // the words: those of the passage that lasts longer first, which is there the more
    const worded = present.map(({ marked, xa, xb, lasts }, index) => {
      const font = this.#faceOf(sheet, marked);
      // all they say, as far as the window is wide
      const w = this.#widthOf(sheet, this.#words(sheet, marked, font, view - 24) ?? '', font);
      // a passage wider than half of what is seen keeps its words in sight as it is scrolled through
      const mid = (xa + xb) / 2;
      const lo = Math.max(xa, gutter) + w / 2 + 8;
      const hi = Math.min(xb, width) - w / 2 - 8;
      const held = smoothstep(view / 2, view, xb - xa);
      const cx = lerp(mid, lo <= hi ? clamp(mid, lo, hi) : mid, held);
      return { marked, index, font, w, cx, lasts, held: held > 0 };
    });
    const order = [...worded].sort(
      (a, b) =>
        Number(a.held) - Number(b.held) ||
        b.lasts - a.lasts ||
        a.marked.remark.about.from - b.marked.remark.about.from,
    );
    const placed = placeWords(
      order.map(({ marked, cx, w }) => ({
        cx,
        cy: this.#extentOf(sheet, marked).cy,
        w,
        h: WORDS,
        // on the roll, and past its end as far as the window is free there
        lo: sheet.x(0) + 6,
        hi: sheet.x(this.#total) + AFTER - 8,
      })),
      ceiling,
      sheet.floor - 2,
    );
    const words = worded.map(({ font, cx }): Shown['words'] => ({
      font,
      cx,
      cy: null,
      left: cx - UNPLACED / 2,
      right: cx + UNPLACED / 2,
    }));
    order.forEach(({ marked, index, font, cx }, i) => {
      const place = placed[i];
      const { moving, come } = present[index];
      const at = come || !moving.placed ? 0 : glide;
      moving.placed = place !== null;
      if (place === null) return;
      const reach = (side: Eased, to: number): number => {
        if (at > 0 && Math.abs(to - side.target) < STEP) side.shift(to - side.target);
        else side.aim(to, now, at);
        return cx + side.at(now);
      };
      moving.off.aim(place.off, now, at);
      words[index] = {
        font,
        cx,
        cy: this.#extentOf(sheet, marked).cy + moving.off.at(now),
        left: reach(moving.left, place.left - cx),
        right: reach(moving.right, place.left + place.width - cx),
      };
    });
    return present.map(({ marked, xa, xb, lit, there, forward, spot }, index) => ({
      marked,
      xa,
      xb,
      lit,
      there,
      forward,
      spot,
      words: words[index],
    }));
  }

  /** Words with their middle at a place, on a pale ground: `strength` of the ink, `ground` of the ground. */
  #label(
    sheet: Sheet,
    text: string,
    font: string,
    cx: number,
    cy: number,
    look: { readonly strength: number; readonly ground: number; readonly lit: number },
  ): Rect {
    const { c, palette } = sheet;
    const width = this.#widthOf(sheet, text, font);
    const x = cx - width / 2;
    if (look.ground > 0) {
      c.globalAlpha = look.ground;
      c.fillStyle = '#ffffff';
      sheet.rounded(x - 4, cy - WORDS / 2, width + 8, WORDS, 3);
      c.fill();
    }
    c.font = font;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.globalAlpha = look.strength;
    c.fillStyle = palette.ink;
    c.fillText(text, x, cy + 0.5);
    if (look.lit > 0) {
      c.globalAlpha = look.lit;
      c.strokeStyle = palette.ink;
      c.lineWidth = 1;
      sheet.line(x, cy + 9.5, x + width, cy + 9.5);
    }
    c.globalAlpha = 1;
    return { x: x - 4, y: cy - WORDS / 2, w: width + 8, h: WORDS };
  }

  /**
   * The remarks: an arrow quiet at rest, its words and every other remark's on their pale ground.
   * What is lit is drawn last and whole, its brace or hull with it, its words out of the way of its
   * notes, over what marks it; beside it the others are pale. `any` is how lit the most lit is.
   * Returns what the pointer finds: the words and arrows, and where it stays with a lit remark.
   */
  paint(
    sheet: Sheet,
    shown: readonly Shown[],
    any: number,
    pointed: Marked | null,
    chosen: Marked | null,
  ): { marks: (Rect & { readonly marked: Marked })[]; holds: (Rect & { readonly marked: Marked })[] } {
    const { c, palette, gutter, width, view } = sheet;
    const ceiling = sheet.top + 3;
    const marks: (Rect & { readonly marked: Marked })[] = [];
    const holds: (Rect & { readonly marked: Marked })[] = [];

    c.strokeStyle = palette.ink;
    c.fillStyle = palette.ink;
    for (const { marked, lit, there, forward, spot } of shown) {
      c.lineWidth = lerp(1, 1.5, lit);
      if (spot.kind === 'arrow') {
        if (!sheet.seen(spot.from.x, spot.to.x)) continue;
        const quiet = ARROW * forward * lerp(1, BESIDE.arrow, Math.max(0, any - lit));
        c.globalAlpha = there * lerp(quiet, 1, lit);
        arrow(c, spot.from, spot.to, spot.apex);
        if (there >= FOUND)
          marks.push({ marked, x: spot.from.x, y: spot.apex - 6, w: spot.to.x - spot.from.x, h: 14 });
      } else if (lit > 0 && sheet.seen(spot.xa, spot.xb)) {
        // a brace or a hull comes with the notes
        c.globalAlpha = lit;
        if (spot.kind === 'brace') brace(c, spot.xa, spot.xb, spot.y);
        else {
          soft(c, hullOf(spot.rects, gutter - 60, width + 60));
          c.stroke();
          c.globalAlpha = lit * 0.05;
          c.fill();
        }
      }
    }
    c.globalAlpha = 1;

    /** The lit remarks' words are drawn last, over everything. */
    const later: (() => void)[] = [];
    for (const { marked, xa, xb, lit, there, forward, spot, words } of [...shown].reverse()) {
      const held = marked === pointed || marked === chosen;
      const { font } = words;
      if (!held && lit <= 0 && (words.cy === null || !sheet.seen(words.left, words.right))) continue;
      // at rest: as much of them as has room in what is seen of their place, from their beginning
      // on, over the middle of the passage or as near it as may be
      const from = Math.max(words.left, gutter + 6);
      const to = Math.min(words.right, width - 8);
      const rest = words.cy === null ? null : this.#words(sheet, marked, font, to - from);
      const restW = rest === null ? 0 : this.#widthOf(sheet, rest, font);
      const at = Math.max(from + restW / 2, Math.min(words.cx, to - restW / 2));
      // lit: all they say, out of the way of its notes, over what marks it, in the middle of what is
      // seen of its passage
      const text =
        lit > 0 ? this.#words(sheet, marked, font, lerp(Math.max(to - from, restW), view - 20, lit)) : rest;
      const w = text === null ? 0 : this.#widthOf(sheet, text, font);
      const over = spot.kind === 'brace' ? spot.y - BRACE : spot.kind === 'arrow' ? spot.apex - 2 : spot.y;
      const out = {
        x: clamp((Math.max(xa, gutter) + Math.min(xb, width)) / 2, gutter + 6 + w / 2, width - 8 - w / 2),
        y: Math.max(over - 3 - WORDS / 2, ceiling + WORDS / 2),
      };
      // on it, the pointer stays on it over its notes, and where its words were
      if (held) {
        const extent = this.#extentOf(sheet, marked);
        const were =
          rest !== null && words.cy !== null ? { xa: at - restW / 2, xb: at + restW / 2, y: words.cy } : null;
        const left = Math.min(xa, were?.xa ?? xa) - 6;
        const right = Math.max(xb, were?.xb ?? xb) + 6;
        const top = Math.min(out.y - WORDS / 2, extent.top, (were?.y ?? Infinity) - WORDS / 2) - 4;
        const bottom = Math.max(extent.bottom, (were?.y ?? -Infinity) + WORDS / 2) + 6;
        holds.push({ marked, x: left, y: top, w: right - left, h: bottom - top });
      }
      if (text === null) continue;
      const cx = lerp(at, out.x, lit);
      const cy = words.cy === null ? out.y : lerp(words.cy, out.y, lit);
      const beside = Math.max(0, any - lit);
      // with little of their place in sight, they go out
      const enough = Math.max(1, Math.min(words.right - words.left, LEAST));
      const whole = there * smoothstep(enough / 2, enough, to - from);
      const look = {
        strength: Math.max(lit, whole * forward * lerp(1, BESIDE.words, beside)),
        ground: Math.max(0.96 * lit, 0.8 * whole * lerp(1, BESIDE.ground, beside)),
        lit,
      };
      const draw = (): void => {
        const box = this.#label(sheet, text, font, cx, cy, look);
        if (whole >= FOUND || lit > 0) marks.push({ marked, ...box });
      };
      if (lit > 0) later.push(draw);
      else draw();
    }
    for (const draw of later) draw();
    // the remark the pointer is on comes before the one that is chosen
    holds.sort((a, b) => Number(b.marked === pointed) - Number(a.marked === pointed));
    return { marks, holds };
  }

  /** The remarks about the whole piece in rows along the top, as many as they take. */
  lanes(sheet: Sheet): Lanes {
    const said = this.#whole.map((marked) => {
      const font = this.#faceOf(sheet, marked);
      return { font, text: this.#words(sheet, marked, font, 420) };
    });
    const { places, rows } = rowsOf(
      said.map(({ text, font }) => this.#widthOf(sheet, text ?? '', font)),
      sheet.gutter + 8,
      sheet.width - 8,
    );
    return { rows, places: places.map((place, i) => ({ ...place, ...said[i] })) };
  }

  /** The remarks about the whole piece, each in its place above the ruler. */
  paintWhole(sheet: Sheet, lanes: Lanes, any: number, now: number): (Rect & { readonly marked: Marked })[] {
    const marks: (Rect & { readonly marked: Marked })[] = [];
    this.#whole.forEach((marked, i) => {
      const { x, row, text, font } = lanes.places[i];
      if (row >= sheet.lanes || text === null) return;
      const lit = this.#moving.get(marked)?.lit.at(now) ?? 0;
      const strength = lerp(1, BESIDE.words, Math.max(0, any - lit));
      const cx = x + this.#widthOf(sheet, text, font) / 2;
      marks.push({
        marked,
        ...this.#label(sheet, text, font, cx, 3 + row * LANE + 10, { strength, ground: 0, lit }),
      });
    });
    return marks;
  }
}
