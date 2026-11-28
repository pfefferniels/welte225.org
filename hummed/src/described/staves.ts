// What the roll is ruled with: the two staves or a line under every C, the bars and their beats,
// the ruler with the bars' numbers, the playhead, and the gutter with the clefs and the key.
import type { Ms } from '../shared/units.ts';
import { clamp, smoothstep } from './geometry.ts';
import { accidental, fClef, G_CLEF_WIDTH, gClef } from './glyphs.ts';
import type { Bar } from './piece.ts';
import type { PedalKind } from './rendering.ts';
import { LANE, PEDAL, RULER, type Sheet } from './sheet.ts';
import { BASS, signatureMarks, TREBLE, type Signature } from './staff.ts';

/** A bar on the roll's clock: when it begins, and when the beats in it fall. */
export interface BarAt {
  readonly bar: Bar;
  readonly ms: Ms;
  readonly beats: readonly Ms[];
}

/** The two staves, or a line under every C. */
export function paintStaves(sheet: Sheet): void {
  const { c, palette, gutter, width, rows } = sheet;
  c.lineWidth = 1;
  if (sheet.staff) {
    c.strokeStyle = palette.faint;
    c.globalAlpha = 0.55;
    for (const row of sheet.staffRows()) sheet.staffLine(row, gutter, width);
  } else {
    c.strokeStyle = palette.grid;
    c.globalAlpha = 0.7;
    for (let pitch = rows.lo; pitch <= rows.hi; pitch++)
      if (pitch % 12 === 0) sheet.staffLine(pitch - 0.5, gutter, width);
  }
  c.globalAlpha = 1;
}

/**
 * From afar the bars are too thin for a number each: every which bar has one (1, 2, 5, 10, …), and
 * how much is left of the lines of the others, which go as the bars get thinner than a few pixels.
 */
function thinned(sheet: Sheet, bars: readonly BarAt[], total: Ms): { every: number; others: number } {
  const wide = (total * sheet.ppt) / Math.max(1, bars.length);
  return {
    every: [1, 2, 5, 10, 20, 50].find((n) => n * wide >= 26) ?? 100,
    others: smoothstep(6, 14, wide),
  };
}

/** Bar lines, and the beats where there is room for them. */
export function paintBars(sheet: Sheet, bars: readonly BarAt[], total: Ms): void {
  const { c, palette, gutter, width, top, floor } = sheet;
  const { every, others } = thinned(sheet, bars, total);
  bars.forEach(({ bar, ms, beats }, i) => {
    const x = sheet.x(ms);
    const next = sheet.x(bars.at(i + 1)?.ms ?? total);
    if (!sheet.seen(x, next)) return;
    if ((next - x) / (beats.length + 1) > 16) {
      c.strokeStyle = palette.grid;
      c.globalAlpha = 0.9;
      for (const beat of beats) {
        const bx = Math.round(sheet.x(beat)) + 0.5;
        if (bx >= gutter && bx <= width) sheet.line(bx, top, bx, floor);
      }
    }
    const strength = bar.number % every === 0 ? 1 : others;
    if (x < gutter - 1 || x > width || strength <= 0) return;
    c.strokeStyle = palette.muted;
    c.globalAlpha = 0.7 * strength;
    sheet.line(Math.round(x) + 0.5, top - 5, Math.round(x) + 0.5, floor);
  });
  c.globalAlpha = 1;
}

/** The ground above the roll, for the remarks about the whole piece and the ruler. */
export function paintHeader(sheet: Sheet): void {
  const { c, palette, width, top } = sheet;
  c.fillStyle = palette.ground;
  c.fillRect(0, 0, width, top - 5);
  c.strokeStyle = palette.rule;
  c.lineWidth = 1;
  sheet.line(0, top - 5.5, width, top - 5.5);
}

/** The bars' numbers, as many as have room. */
export function paintRuler(sheet: Sheet, bars: readonly BarAt[], total: Ms): void {
  const { c, palette, gutter, width } = sheet;
  const { every } = thinned(sheet, bars, total);
  const y = sheet.lanes * LANE + RULER / 2 + 2;
  c.font = `500 11px ${palette.sans}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = palette.ink;
  let last = -Infinity;
  for (const { bar, ms } of bars) {
    const x = sheet.x(ms);
    if (x < gutter - 2 || x > width || bar.number % every !== 0 || x - last < 18) continue;
    last = x;
    c.fillText(String(bar.number), x + 4, y);
  }
}

/** The line where the playing is, or where it rests. */
export function paintPlayhead(sheet: Sheet, ms: Ms, playing: boolean): void {
  const { c, palette, gutter, width, top, floor } = sheet;
  const head = sheet.x(ms);
  if (!(playing || ms > 0) || head < gutter - 1 || head > width) return;
  const hx = Math.round(head) + 0.5;
  c.strokeStyle = palette.ink;
  c.fillStyle = palette.ink;
  c.lineWidth = playing ? 1.5 : 1;
  c.globalAlpha = playing ? 0.85 : 0.3;
  sheet.line(hx, top - 6, hx, floor);
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

/** The gutter: the staves' beginning, the clefs on their lines, the key; the pedals' names. */
export function paintGutter(
  sheet: Sheet,
  signature: Signature,
  pedals: readonly (readonly [PedalKind, string])[],
): void {
  const { c, palette, gutter, height, rows, floor } = sheet;
  c.fillStyle = palette.ground;
  c.fillRect(0, 0, gutter, height);
  c.strokeStyle = palette.rule;
  c.lineWidth = 1;
  sheet.line(gutter - 0.5, 0, gutter - 0.5, height);
  if (sheet.staff) {
    c.strokeStyle = palette.faint;
    c.globalAlpha = 0.55;
    for (const row of sheet.staffRows()) sheet.staffLine(row, 5, gutter);
    c.globalAlpha = 1;
    c.strokeStyle = palette.muted;
    c.fillStyle = palette.muted;
    const space = rows.rowH * 2;
    const axis = 8 + (G_CLEF_WIDTH / 2) * space;
    // the G clef curls round the second line from the bottom; the F clef's dots sit either side of the fourth
    gClef(c, axis, Math.round(sheet.y(TREBLE[1] + sheet.lift('treble'))) + 0.5, space);
    fClef(c, axis, Math.round(sheet.y(BASS[3])) + 0.5, space);
    for (const staff of ['treble', 'bass'] as const)
      signatureMarks(signature, staff).forEach(({ alter, step }, index) => {
        accidental(c, alter, 66 + index * 7, sheet.y(step + sheet.lift(staff)), clamp(space, 8, 15));
      });
  }
  c.font = `400 10.5px ${palette.sans}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = palette.faint;
  if (!sheet.staff)
    for (let pitch = rows.lo; pitch <= rows.hi; pitch++)
      if (pitch % 12 === 0) c.fillText(`C${Math.floor(pitch / 12) - 1}`, 7, sheet.y(pitch));
  pedals.forEach(([, label], row) => {
    c.fillText(label, 7, floor + 6 + row * (PEDAL + 4) + PEDAL / 2 + 0.5);
  });
}
