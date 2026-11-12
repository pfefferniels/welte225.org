// The take drawn over the roll: the roll's notes, the voice's pitch, the body's movements, and
// where they turn, against the taps and against where the published reconstruction begins its
// instructions.
import type { Seconds, Ticks } from '../shared/units.ts';
import { timeOf } from './body.ts';
import type { TakeResult } from './protocol.ts';
import type { TakeTiming } from './reading.ts';
import { timeAt, type Roll, type Section } from './roll.ts';

export interface View {
  readonly roll: Roll;
  readonly section: Section;
  /** The stretch of the roll's time shown. */
  readonly from: Seconds;
  readonly to: Seconds;
  readonly timing: TakeTiming | null;
  readonly result: TakeResult | null;
  /** Where the published reconstruction's tempo and dynamics instructions begin and end. */
  readonly desk: { readonly tempo: readonly Ticks[]; readonly dynamics: readonly Ticks[] };
  readonly playhead: Seconds | null;
}

const INK = '#16181d';
const MUTED = '#5b6270';
const RULE = '#e5e7eb';
const SOFT = '#f3f4f6';
const VOICE = '#a3232f';
const FOLDS = '#1f4e8c';
const LIPS = '#2f7d4f';
const LANES = { head: 20, roll: 150, pitch: 90, body: 170, row: 24 } as const;
const ROWS = ['taps', 'take', 'desk: tempo', 'desk: dynamics'] as const;
const LEFT = 104;
const RIGHT = 12;
export const VIEW_HEIGHT = LANES.head + LANES.roll + LANES.pitch + LANES.body + ROWS.length * LANES.row + 8;

export function draw(canvas: HTMLCanvasElement, view: View): void {
  const scale = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(VIEW_HEIGHT * scale)) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(VIEW_HEIGHT * scale);
  }
  const c = canvas.getContext('2d');
  if (!c) return;
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.clearRect(0, 0, width, VIEW_HEIGHT);
  c.font = '12px Helvetica, Arial, sans-serif';
  c.textBaseline = 'middle';
  const { roll, section, timing, result } = view;
  const x = (t: Seconds): number => LEFT + ((t - view.from) / (view.to - view.from)) * (width - LEFT - RIGHT);
  const xDate = (date: Ticks): number => x(timeAt(roll, date));
  const inView = (t: Seconds): boolean => t >= view.from && t <= view.to;
  const label = (text: string, y: number, colour: string = MUTED): void => {
    c.fillStyle = colour;
    c.textAlign = 'left';
    c.fillText(text, 6, y);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, colour: string, w = 1): void => {
    c.strokeStyle = colour;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  };

  const top = {
    roll: LANES.head,
    pitch: LANES.head + LANES.roll,
    body: LANES.head + LANES.roll + LANES.pitch,
  };
  const rows = top.body + LANES.body + 4;
  const bottom = rows + ROWS.length * LANES.row;

  // what lies before and after the bars hummed
  c.fillStyle = SOFT;
  const sectionFrom = Math.max(LEFT, xDate(section.from));
  const sectionTo = Math.min(width - RIGHT, xDate(section.to));
  c.fillRect(LEFT, LANES.head, sectionFrom - LEFT, bottom - LANES.head);
  c.fillRect(sectionTo, LANES.head, width - RIGHT - sectionTo, bottom - LANES.head);
  for (const bar of roll.bars) {
    const t = timeAt(roll, bar.date);
    if (!inView(t) || bar.number === 0) continue;
    line(x(t), LANES.head, x(t), bottom, RULE);
    c.fillStyle = MUTED;
    c.textAlign = 'center';
    c.fillText(String(bar.number), x(t), LANES.head / 2);
  }
  for (const y of [top.pitch, top.body, rows]) line(LEFT, y, width - RIGHT, y, RULE);

  // the roll
  label('the roll', top.roll + 12, INK);
  const shown = roll.notes.filter((n) => n.end >= view.from && n.onset <= view.to);
  const pitches = shown.map((n) => n.pitch);
  const low = Math.min(...pitches, 127) - 1;
  const high = Math.max(...pitches, 0) + 1;
  for (const n of shown) {
    const y = top.roll + LANES.roll - 6 - ((n.pitch - low) / Math.max(1, high - low)) * (LANES.roll - 12);
    c.fillStyle = INK;
    c.globalAlpha = 0.25 + 0.75 * Math.min(1, n.velocity / 60);
    const x0 = Math.max(LEFT, x(n.onset));
    c.fillRect(x0, y - 1.5, Math.max(2, Math.min(width - RIGHT, x(n.end)) - x0), 3);
  }
  c.globalAlpha = 1;

  if (result && timing) {
    const take = (frame: number): Seconds => timeOf(frame) + timing.start;
    const m = result.movements;

    // the breaths, through the voice's lanes
    c.fillStyle = 'rgba(91, 98, 112, 0.14)';
    for (const b of m.breaths)
      c.fillRect(
        x(b.from + timing.start),
        top.pitch,
        x(b.to + timing.start) - x(b.from + timing.start),
        rows - top.pitch,
      );

    // the pitch
    label('pitch', top.pitch + 12, INK);
    const st = (hz: number): number => 12 * Math.log2(Math.max(hz, 1));
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 0; i < result.frames; i++)
      if (result.voiced[i]) {
        lowest = Math.min(lowest, st(result.f0[i]));
        highest = Math.max(highest, st(result.f0[i]));
      }
    const yPitch = (s: number): number =>
      top.pitch + LANES.pitch - 8 - ((s - lowest) / Math.max(1, highest - lowest)) * (LANES.pitch - 16);
    c.fillStyle = VOICE;
    for (let i = 0; i < result.frames; i++)
      if (result.voiced[i] && inView(take(i))) c.fillRect(x(take(i)), yPitch(st(result.f0[i])) - 1, 1.5, 2);
    for (const note of m.notes) {
      const y = yPitch(note.semitones);
      line(
        x(note.from + timing.start),
        y - 5,
        x(note.from + timing.start),
        y + 5,
        note.onset === 'slide' ? MUTED : INK,
      );
    }

    // the body: the lungs' effort, the folds, the lips
    label('lungs', top.body + 12, VOICE);
    label('folds', top.body + 28, FOLDS);
    label('lips', top.body + 44, LIPS);
    const yDb = (db: number): number =>
      top.body + 8 + Math.min(1, Math.max(0, (3 - db) / 33)) * (LANES.body - 16);
    const yUnit = (v: number): number => top.body + LANES.body - 8 - v * (LANES.body - 16);
    const reference = [...result.pressure].filter((p) => p > 0).sort((a, b) => a - b);
    const loud = reference[Math.round(0.9 * Math.max(0, reference.length - 1))] ?? 1;
    const curve = (value: (i: number) => number | null, colour: string, w: number): void => {
      c.strokeStyle = colour;
      c.lineWidth = w;
      c.beginPath();
      let pen = false;
      for (let i = 0; i < result.frames; i++) {
        const v = value(i);
        if (v === null || !inView(take(i))) {
          pen = false;
          continue;
        }
        if (pen) c.lineTo(x(take(i)), v);
        else c.moveTo(x(take(i)), v);
        pen = true;
      }
      c.stroke();
    };
    c.fillStyle = 'rgba(47, 125, 79, 0.25)';
    for (let i = 0; i < result.frames; i++)
      if (result.voiced[i] && result.opening[i] > 0.02 && inView(take(i)))
        c.fillRect(x(take(i)), yUnit(result.opening[i]), 1.5, yUnit(0) - yUnit(result.opening[i]));
    curve((i) => (result.voiced[i] ? yUnit(result.adduction[i]) : null), FOLDS, 1);
    curve(
      (i) =>
        result.voiced[i] && result.pressure[i] > 0 ? yDb(20 * Math.log10(result.pressure[i] / loud)) : null,
      'rgba(163, 35, 47, 0.3)',
      1,
    );
    curve((i) => (Number.isFinite(m.effort[i]) ? yDb(m.effort[i]) : null), VOICE, 2.5);
    for (const turn of m.turns) {
      const tx = x(turn.at + timing.start);
      const ty = yDb(turn.db);
      const up = turn.kind === 'peak' ? -1 : 1;
      c.fillStyle = INK;
      c.beginPath();
      c.moveTo(tx, ty + up * 4);
      c.lineTo(tx - 5, ty + up * 12);
      c.lineTo(tx + 5, ty + up * 12);
      c.fill();
    }

    // the rows: taps, and where the take turns
    const rowY = (k: number): number => rows + k * LANES.row + LANES.row / 2;
    for (const beat of result.reading.beats) {
      c.strokeStyle = MUTED;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(x(beat.expected), rowY(0), 3, 0, 2 * Math.PI);
      c.stroke();
    }
    for (const tap of timing.taps)
      line(x(tap + timing.start), rowY(0) - 8, x(tap + timing.start), rowY(0) + 8, INK, 1.5);
    for (const b of result.reading.boundaries) {
      const colour =
        b.kind === 'breath' ? INK : b.kind === 'peak' ? VOICE : b.kind === 'trough' ? FOLDS : MUTED;
      line(xDate(b.date), rowY(1) - 9, xDate(b.date), rowY(1) + 9, colour, 2.5);
    }
  }
  const rowY = (k: number): number => rows + k * LANES.row + LANES.row / 2;
  ROWS.forEach((name, k) => {
    label(name, rowY(k), INK);
  });
  const within = (date: Ticks): boolean => date >= section.from && date <= section.to;
  for (const date of view.desk.tempo.filter(within))
    line(xDate(date), rowY(2) - 9, xDate(date), rowY(2) + 9, MUTED, 2.5);
  for (const date of view.desk.dynamics.filter(within))
    line(xDate(date), rowY(3) - 9, xDate(date), rowY(3) + 9, MUTED, 2.5);

  if (view.playhead !== null && inView(view.playhead))
    line(x(view.playhead), LANES.head, x(view.playhead), bottom, VOICE, 1.5);
}
