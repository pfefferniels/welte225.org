// The notes on the roll, as far as they are in sight: a box where the MPM renders each, behind it
// its shadow, gray and dashed, where it was played; the grace notes; under the keys the pedals.
// At rest none of them is seen. They come into sight for the remark that is lit, around the line
// while the piece plays from it, or all of them when that is asked for (`Light`).
import type { Ms } from '../shared/units.ts';
import { clamp, smoothstep } from './geometry.ts';
import { accidental } from './glyphs.ts';
import type { Grace } from './piece.ts';
import type { PedalKind, Sounded } from './rendering.ts';
import { PEDAL, type NoteRect, type Sheet } from './sheet.ts';
import { ledgersOf, linesOf, type Signature } from './staff.ts';
import type { RollData, RollNote } from './types.ts';

/** How solid the notes played around a remark's own are beside them; and, with all notes shown, the rest. */
const AROUND = 0.38;
const ELSEWHERE = 0.22;
/**
 * While the piece plays from the line, the notes are in sight from so long behind the line to so
 * long ahead of it, coming and going over the first and the last part of each.
 */
const BEHIND: readonly [Ms, Ms] = [1500, 300];
const AHEAD: readonly [Ms, Ms] = [2500, 4500];
/** From how solid on a note can be pointed at. */
const POINTED_FROM = 0.3;
/** Over how many pixels the pedals come and go at the ends of a stretch. */
const PEDAL_FADE = 28;

/** A remark that is lit, as far as the notes are concerned: its own, those around, when they sound. */
export interface Lit {
  readonly own: readonly RollNote[];
  readonly around: readonly RollNote[];
  readonly lit: number;
  readonly from: Ms;
  readonly to: Ms;
  readonly heard: readonly [Ms, Ms];
}

/** How much of the notes is in sight: of a note, and of whatever else sounds at a time. */
export interface Light {
  readonly note: (note: RollNote) => number;
  readonly at: (ms: Ms) => number;
  /** What is in sight everywhere, whatever is lit. */
  readonly rest: number;
  /** How lit the most lit remark is. */
  readonly any: number;
  /** The stretches the pedals are in sight over, beyond what is in sight everywhere. */
  readonly stretches: readonly {
    readonly from: Ms;
    readonly to: Ms;
    readonly alpha: number;
    /** Over how long they come at its beginning and go at its end; null for a few pixels. */
    readonly fade: readonly [Ms, Ms] | null;
  }[];
}

/**
 * What is in sight: the notes of the remarks that are lit (`whole`: of one about the whole
 * piece), all notes as far as `every` asks for them, and those around the playhead as far as the
 * piece plays from it (`following`).
 */
export function lightOf(
  lit: readonly Lit[],
  whole: number,
  every: number,
  following: number,
  head: Ms,
): Light {
  const own = new Map<string, number>();
  let any = whole;
  for (const one of lit) {
    any = Math.max(any, one.lit);
    for (const note of one.around) own.set(note.id, Math.max(own.get(note.id) ?? 0, AROUND * one.lit));
    for (const note of one.own) own.set(note.id, Math.max(own.get(note.id) ?? 0, one.lit));
  }
  // with all notes in sight, those that are no part of what is lit step back
  const rest = Math.max(whole, every * (1 - (1 - ELSEWHERE) * (any - whole)));
  const lantern = (from: Ms, to: Ms): number => {
    if (following <= 0) return 0;
    const ahead = head < from ? from - head : 0;
    const behind = head > to ? head - to : 0;
    return (
      following * (1 - smoothstep(AHEAD[0], AHEAD[1], ahead)) * (1 - smoothstep(BEHIND[1], BEHIND[0], behind))
    );
  };
  return {
    any,
    rest,
    note: (note) => Math.max(rest, own.get(note.id) ?? 0, lantern(note.mpm.ms, note.mpm.msEnd)),
    at: (ms) =>
      Math.max(
        rest,
        lantern(ms, ms),
        ...lit.map((one) =>
          ms >= one.from && ms < one.to
            ? one.lit
            : ms >= one.heard[0] && ms < one.heard[1]
              ? AROUND * one.lit
              : 0,
        ),
      ),
    stretches: [
      ...lit.map((one) => ({ from: one.heard[0], to: one.heard[1], alpha: one.lit - rest, fade: null })),
      {
        from: head - BEHIND[0],
        to: head + AHEAD[1],
        alpha: following - rest,
        fade: [BEHIND[0] - BEHIND[1], AHEAD[1] - AHEAD[0]] as const,
      },
    ].filter((stretch) => stretch.alpha > 0.01),
  };
}

/** A note as it was drawn, for the pointer. */
export type Drawn = NoteRect & { readonly note: RollNote };

/**
 * The notes that are in sight: their shadows, their ledger lines, the notes themselves, the
 * loudest first so that a soft note over a loud one stays to be seen; and the one pointed at tied
 * to its shadow. `sounded` is where a note is drawn now. Returns what can be pointed at.
 */
export function paintNotes(
  sheet: Sheet,
  loudFirst: readonly RollNote[],
  light: Light,
  signature: Signature,
  sounded: (note: RollNote) => Sounded,
  pointed: string | null,
): { rects: Drawn[]; shades: Drawn[] } {
  const { c, palette } = sheet;
  const rects: Drawn[] = [];
  const shades: Drawn[] = [];
  const apart = (a: NoteRect, b: NoteRect): boolean =>
    Math.abs(a.x - b.x) >= 1.5 || Math.abs(a.h - b.h) >= 1 || Math.abs(a.x + a.w - b.x - b.w) >= 2.5;
  const drawn: { note: RollNote; r: NoteRect; was: NoteRect; alpha: number }[] = [];
  for (const note of loudFirst) {
    const alpha = light.note(note);
    if (alpha <= 0.01) continue;
    const r = sheet.rect(note, sounded(note));
    const was = sheet.rect(note, note.played);
    if (sheet.seen(r.x - 14, r.x + r.w) || sheet.seen(was.x, was.x + was.w))
      drawn.push({ note, r, was, alpha });
  }

  // shadows: the notes as recorded, only where they differ from the rendering to the eye
  c.lineWidth = 1;
  c.fillStyle = palette.ghost;
  c.strokeStyle = palette.ghost;
  for (const { note, r, was, alpha } of drawn) {
    if (!apart(was, r)) continue;
    // a shadow stays fainter than any note, and within that the louder is the darker
    c.globalAlpha = (0.08 + 0.48 * (was.ink - 0.3)) * alpha;
    sheet.rounded(was.x, was.y, was.w, was.h, 2.5);
    c.fill();
    c.setLineDash([3, 2]);
    c.globalAlpha = 0.7 * alpha;
    sheet.rounded(was.x + 0.5, was.y + 0.5, Math.max(1, was.w - 1), Math.max(1, was.h - 1), 2.5);
    c.stroke();
    c.setLineDash([]);
    if (alpha >= POINTED_FROM) shades.push({ note, ...was });
  }

  if (sheet.staff) {
    c.strokeStyle = palette.muted;
    for (const { note, r, alpha } of drawn) {
      c.globalAlpha = 0.75 * alpha;
      for (const line of ledgersOf(note.step, linesOf(note.staff)))
        sheet.staffLine(line + sheet.lift(note.staff), r.x - 5, r.x + r.w + 5);
    }
  }
  const space = clamp(sheet.rows.rowH * 2, 8, 15);
  for (const { note, r, alpha } of drawn) {
    const colour = note.part === 1 ? palette.right : palette.left;
    c.globalAlpha = r.ink * alpha;
    c.fillStyle = colour;
    sheet.rounded(r.x, r.y, r.w, r.h, 2.5);
    c.fill();
    c.globalAlpha = Math.min(1, r.ink + 0.25) * alpha;
    c.fillRect(r.x, r.y, Math.min(2, r.w), r.h);
    // an accidental where the note departs from the key signature
    if (sheet.staff && note.alter !== (signature.get(note.letter) ?? 0)) {
      c.strokeStyle = colour;
      accidental(c, note.alter, r.x - 2.5, r.y + r.h / 2, space);
    }
    if (alpha >= POINTED_FROM) rects.push({ note, ...r });
  }
  c.globalAlpha = 1;

  // the note pointed at, tied to its shadow
  const one = drawn.find(({ note, alpha }) => note.id === pointed && alpha >= POINTED_FROM);
  if (one) {
    const y = Math.round(sheet.y(sheet.rowOf(one.note))) + 0.5;
    c.strokeStyle = palette.apart;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.9;
    sheet.line(one.r.x, y, one.was.x, y);
    sheet.rounded(
      one.was.x + 0.5,
      one.was.y + 0.5,
      Math.max(1, one.was.w - 1),
      Math.max(1, one.was.h - 1),
      2.5,
    );
    c.stroke();
    c.globalAlpha = 1;
    c.lineWidth = 1;
  }
  return { rects, shades };
}

/** The grace notes, where they were played. */
export function paintGraces(sheet: Sheet, graces: readonly Grace[], light: Light): void {
  const { c, palette, gutter, width } = sheet;
  for (const grace of graces) {
    const x = sheet.x(grace.ms);
    const alpha = light.at(grace.ms);
    if (x < gutter - 6 || x > width || alpha <= 0.01) continue;
    const y = sheet.y(sheet.rowOf(grace));
    const size = clamp(sheet.rows.unit, 5, 13);
    c.fillStyle = palette.grace;
    c.globalAlpha = 0.85 * alpha;
    c.beginPath();
    c.moveTo(x, y - size * 0.7);
    c.lineTo(x + size, y);
    c.lineTo(x, y + size * 0.7);
    c.closePath();
    c.fill();
  }
  c.globalAlpha = 1;
}

/**
 * The pedals, where the notes are in sight: everywhere, or over the stretches that are played for
 * what is lit, coming and going at their ends. A press as it was recorded is a shadow; how deep the
 * MPM has the pedal is solid.
 */
export function paintPedals(
  sheet: Sheet,
  data: Pick<RollData, 'presses' | 'moves' | 'total'>,
  pedals: readonly (readonly [PedalKind, string])[],
  light: Light,
): void {
  const { c, palette, gutter, width, floor } = sheet;
  type Ink = (colour: string) => string | CanvasGradient;
  /** The rows from `xa` to `xb`, as strong as `alpha`; `ink` is what a colour is drawn with there. */
  const rows = (xa: number, xb: number, alpha: number, ink: Ink): void => {
    const [from, to] = [Math.max(xa, gutter), Math.min(xb, width)];
    if (alpha <= 0.01 || to <= from) return;
    c.save();
    c.beginPath();
    c.rect(from, floor, to - from, sheet.foot);
    c.clip();
    pedals.forEach(([kind], row) => {
      const y = floor + 6 + row * (PEDAL + 4);
      c.fillStyle = ink(palette.ghost);
      c.strokeStyle = ink(palette.ghost);
      c.setLineDash([3, 2]);
      for (const press of data.presses) {
        if (press.kind !== kind) continue;
        const [pa, pb] = [sheet.x(press.ms), sheet.x(press.msEnd)];
        if (pb < from || pa > to) continue;
        c.globalAlpha = 0.16 * alpha;
        c.fillRect(pa, y, pb - pa, PEDAL);
        c.globalAlpha = 0.7 * alpha;
        c.strokeRect(pa + 0.5, y + 0.5, Math.max(1, pb - pa - 1), PEDAL - 1);
      }
      c.setLineDash([]);
      // one outline for all its moves: drawn move by move, a ramp would be striped where they meet
      const moves = data.moves.filter((move) => move.kind === kind);
      const low = y + PEDAL;
      c.fillStyle = ink(palette.muted);
      c.globalAlpha = 0.85 * alpha;
      c.beginPath();
      c.moveTo(sheet.x(moves.at(0)?.ms ?? 0), low);
      moves.forEach((move, i) => {
        const [ma, mb] = [sheet.x(move.ms), sheet.x(moves.at(i + 1)?.ms ?? data.total)];
        if (mb < from || ma > to) return;
        const depth = (move.value / 127) * PEDAL;
        c.lineTo(ma, low);
        c.lineTo(ma, low - depth);
        c.lineTo(mb, low - depth);
        c.lineTo(mb, low);
      });
      c.closePath();
      c.fill();
    });
    c.restore();
  };
  /** A colour that comes over `rise` pixels from `xa` on and goes over `fall` before `xb`. */
  const fading =
    (xa: number, xb: number, rise: number, fall: number): Ink =>
    (colour) => {
      const ink = c.createLinearGradient(xa, 0, xb, 0);
      ink.addColorStop(0, sheet.clear(colour));
      ink.addColorStop(Math.min(0.5, rise / (xb - xa)), colour);
      ink.addColorStop(Math.max(0.5, 1 - fall / (xb - xa)), colour);
      ink.addColorStop(1, sheet.clear(colour));
      return ink;
    };
  rows(gutter, width, light.rest, (colour) => colour);
  for (const { from, to, alpha, fade } of light.stretches) {
    const [xa, xb] = [sheet.x(from), sheet.x(to)];
    const [rise, fall] = fade ? [fade[0] * sheet.ppt, fade[1] * sheet.ppt] : [PEDAL_FADE, PEDAL_FADE];
    if (xb > xa) rows(xa, xb, alpha, fading(xa, xb, rise, fall));
  }
  c.globalAlpha = 1;
}
