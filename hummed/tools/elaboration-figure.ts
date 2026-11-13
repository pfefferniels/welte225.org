// The figure of what the elaboration does, drawn as TikZ in the dialect of the dissertation's
// figures (its figures/tikz with keynotefigures.sty, as scripts/condon_figures.py writes them: x=1bp,
// Zwo OT, every node named): (1) how far the performance is exaggerated, (2) what the piano plays,
// (3) the voice, how loud it is and how loosely it keeps to the pitch, (4) how fast it all goes. Each
// row has the fader across on the left, from levels.ts and mix.ts, and on the right what that does
// at its ends (and its middle), from espressivo's performances of the reconstruction as the worker
// makes them and from the hummer's own pitch line. Not to be changed by hand: run this again.
//   npm run figure [-- --out figures/elaboration.tex]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { exaggerateMpm, performMsmToData } from 'espressivo';
import { lagOf, LATENCY_MS, pitchLooseness, type PitchLooseness } from '../src/hummer/gestures.ts';
import { readPerformance, repair, type Note } from '../src/hummer/performance.ts';
import { mix, PIECE_FROM } from '../src/page/mix.ts';
import {
  approximateness,
  DEFAULT_ELABORATION,
  pianoFactors,
  pianoLevel,
  tempoFactor,
  voiceLevel,
} from '../src/worker/levels.ts';
import { pianoMpm } from '../src/worker/piano.ts';
import { loadPianoScore, loadReduction, loadStyle, ROOT } from './node-support.ts';

const { values } = parseArgs({ options: { out: { type: 'string', default: 'figures/elaboration.tex' } } });

/* ---------- the dialect ---------- */

/** The dissertation's text width, which its figures fill. */
const WIDTH = 451.45;
const num = (v: number): string => v.toFixed(2);
const pt = (x: number, y: number): string => `(${num(x)},${num(y)})`;
/** A number as the figures print it, with a dash for the minus. */
const print = (v: number, digits = 0): string => v.toFixed(digits).replace('-', '–');

const STYLES = [
  String.raw`lab/.style={inner sep=0pt, outer sep=0pt, font=\kzwo{#1}}`,
  'lab/.default=7',
  'klein/.style={lab=6, text=kgray37}',
  'achse/.style={draw=black, line width=.4bp}',
  'kurve/.style={draw=black, line width=1bp, line join=round, line cap=round}',
  'fein/.style={kurve, line width=.6bp}',
  'strichel/.style={draw=kgray23, line width=.6bp, line cap=round, line join=round, dash pattern=on 3bp off 2bp}',
  'bezug/.style={draw=kgray84, line width=.5bp}',
  'harmonien/.style={fill=kgray84}',
  'stueck/.style={fill=black}',
  'einstellung/.style={circle, inner sep=0pt, outer sep=0pt, minimum size=5bp, draw=white, line width=1bp}',
  // the three settings the right-hand plots are drawn at: the fader's ends and its middle
  'e0/.style={draw=kb51700}',
  'e05/.style={draw=kgray57}',
  'e1/.style={draw=black}',
];

class Figure {
  readonly #lines: string[] = [];
  readonly #names = new Set<string>();

  add(line: string): void {
    this.#lines.push(line);
  }

  node(name: string, at: string, text: string, style = 'lab'): void {
    if (this.#names.has(name)) throw new Error(`two nodes named ${name}`);
    this.#names.add(name);
    this.add(String.raw`\node[${style}] (${name}) at ${at} {${text}};`);
  }

  line(style: string, points: readonly (readonly [number, number])[]): void {
    this.add(String.raw`\draw[${style}] ${points.map(([x, y]) => pt(x, y)).join(' -- ')};`);
  }

  text(comments: readonly string[], height: number): string {
    return [
      ...comments.map((c) => `% ${c}`),
      String.raw`\begin{tikzpicture}[x=1bp, y=1bp, miter limit=4]`,
      String.raw`\useasboundingbox (0,0) rectangle ${pt(WIDTH, height)};`,
      String.raw`\tikzset{`,
      ...STYLES.map((s, i) => `  ${s}${i < STYLES.length - 1 ? ',' : ''}`),
      '}',
      ...this.#lines,
      String.raw`\end{tikzpicture}`,
      '',
    ].join('\n');
  }
}

/** A plot's frame: where it lies on the page and what it spans. */
interface Frame {
  readonly id: string;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly xs: readonly [number, number];
  readonly ys: readonly [number, number];
}

class Plot implements Frame {
  readonly fig: Figure;
  readonly id: string;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly xs: readonly [number, number];
  readonly ys: readonly [number, number];

  constructor(fig: Figure, frame: Frame) {
    this.fig = fig;
    ({ id: this.id, x0: this.x0, x1: this.x1, y0: this.y0, y1: this.y1, xs: this.xs, ys: this.ys } = frame);
  }

  x(v: number): number {
    return this.x0 + ((v - this.xs[0]) / (this.xs[1] - this.xs[0])) * (this.x1 - this.x0);
  }
  y(v: number): number {
    return this.y0 + ((v - this.ys[0]) / (this.ys[1] - this.ys[0])) * (this.y1 - this.y0);
  }
  at(x: number, y: number): [number, number] {
    return [this.x(x), this.y(y)];
  }

  axes(): void {
    this.fig.add(String.raw`\draw[achse] ${pt(this.x0, this.y0)} -- ${pt(this.x1, this.y0)};`);
    this.fig.add(String.raw`\draw[achse] ${pt(this.x0, this.y0)} -- ${pt(this.x0, this.y1)};`);
  }
  /** A tick on the x axis, labelled or (minor) not. */
  xTick(v: number, label: string | null, key: string = print(v * 100)): void {
    const x = this.x(v);
    this.fig.add(
      String.raw`\draw[achse] ${pt(x, this.y0)} -- ${pt(x, this.y0 - (label === null ? 1.5 : 2.5))};`,
    );
    if (label !== null)
      this.fig.node(`${this.id}-x-${key}`, pt(x, this.y0 - 10), label, 'lab=6.5, anchor=base');
  }
  yTick(v: number, label: string, key: string = print(v * 10)): void {
    const y = this.y(v);
    this.fig.add(String.raw`\draw[achse] ${pt(this.x0, y)} -- ${pt(this.x0 - 2.5, y)};`);
    this.fig.node(`${this.id}-y-${key}`, pt(this.x0 - 5, y), label, 'lab=6.5, anchor=east');
  }
  curve(style: string, points: readonly (readonly [number, number])[]): void {
    this.fig.line(
      style,
      points.map(([x, y]) => this.at(x, y)),
    );
  }
  dot(name: string, colour: string, x: number, y: number): void {
    this.fig.node(name, pt(this.x(x), this.y(y)), '', `einstellung, fill=${colour}`);
  }
}

/* ---------- what is drawn: the fader's own functions, and performances at its settings ---------- */

const score = loadPianoScore();
const reduction = loadReduction();
const style = loadStyle();
const QUARTER = Number(/pulsesPerQuarter="(\d+)"/.exec(score.msm)?.[1] ?? NaN);
if (!Number.isFinite(QUARTER)) throw new Error('the score gives no pulses per quarter');

/** The settings the piano and the voice are rendered at (`voiceElaboration`, mix.ts): every 0.05. */
const RENDERED = Array.from({ length: 21 }, (_, i) => i / 20);
/** Finely, for what follows the fader as it moves: the mix. */
const FINE = Array.from({ length: 401 }, (_, i) => i / 400);
const dB = (gain: number): number => 20 * Math.log10(gain);

const perform = (msm: string, mpm: string, expandOrnaments: boolean): readonly Note[] => {
  const { notes } = readPerformance(performMsmToData({ msm, mpm }, { expandOrnaments }));
  repair(notes);
  return notes;
};
const piece = (e: number): readonly Note[] => perform(score.msm, pianoMpm(score.mpm, e), true);
const ends = (notes: readonly Note[]): number => Math.max(...notes.map((n) => n.endMs)) / 1000;

const SETTINGS = [0, 0.5, 1] as const;
const performed = new Map(SETTINGS.map((e) => [e, piece(e)]));
const at = (e: (typeof SETTINGS)[number]): readonly Note[] => {
  const notes = performed.get(e);
  if (!notes) throw new Error(`no performance at ${e}`);
  return notes;
};
/** The piece at 0 without its tempo factor: the exaggeration alone, which slows it. */
const exaggeratedOnly = (): number => {
  const factors = pianoFactors(pianoLevel(0));
  return ends(perform(score.msm, factors ? exaggerateMpm(score.mpm, { factors }).mpm : score.mpm, true));
};
const harmonies = perform(score.harmonies, pianoMpm(score.mpm, 1), false);

/** When each date of the score sounds: the median onset of its notes (a chord may be spread). */
function timeMap(notes: readonly Note[]): (tick: number) => number {
  const byDate = new Map<number, number[]>();
  for (const n of notes) {
    if (n.ornamented) continue;
    const list = byDate.get(n.date) ?? [];
    list.push(n.onMs);
    byDate.set(n.date, list);
  }
  const dates = [...byDate.keys()].sort((a, b) => a - b);
  const ms = dates.map((d) => {
    const sorted = (byDate.get(d) ?? []).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  });
  return (tick) => {
    let i = 0;
    while (i < dates.length - 2 && dates[i + 1] < tick) i++;
    return ms[i] + ((tick - dates[i]) / (dates[i + 1] - dates[i])) * (ms[i + 1] - ms[i]);
  };
}

/** The tempo as played, in quarter notes a minute, over a quarter note at every eighth. */
function tempoCurve(notes: readonly Note[], lastTick: number): [number, number][] {
  const ms = timeMap(notes);
  const out: [number, number][] = [];
  for (let t = 0; t + QUARTER <= lastTick; t += QUARTER / 2)
    out.push([t + QUARTER / 2, 60000 / (ms(t + QUARTER) - ms(t))]);
  return out;
}

/** The loudest note struck at each date. */
function loudest(notes: readonly Note[]): [number, number][] {
  const byDate = new Map<number, number>();
  for (const n of notes) if (!n.ornamented) byDate.set(n.date, Math.max(byDate.get(n.date) ?? 0, n.velocity));
  return [...byDate.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * One sung note as the pitch line makes it (gestures.ts), with the chance taken out: arriving from
 * a semitone above, it lands one standard deviation off, settles to what it keeps of that, and
 * wobbles one deviation either way, down first. VocalTractLab follows each change of target as a fifth-order
 * critically damped system, half done `lagOf` after it. Cents against ms after the piano note.
 */
function sungNote(loose: PitchLooseness, untilMs: number): [number, number][] {
  const tau = loose.timeConstantMs;
  const step = (t: number): number => {
    if (t <= 0) return 0;
    let sum = 0;
    let term = 1;
    for (let k = 0; k < 5; k++) {
      sum += term;
      term *= t / tau / (k + 1);
    }
    return 1 - Math.exp(-t / tau) * sum;
  };
  const takeover = LATENCY_MS + loose.follow - lagOf(tau);
  const miss = loose.landSd * 100;
  const targets: [number, number][] = [[takeover, miss]];
  let t = takeover + loose.settleMs;
  for (let turn = 0; t < untilMs; turn++, t += loose.step)
    targets.push([t, loose.keep * miss + (turn % 2 === 0 ? -1 : 1) * loose.wobble * 100]);
  const out: [number, number][] = [];
  for (let ms = -200; ms <= untilMs; ms += 2) {
    let cents = 100;
    let before = 100;
    for (const [from, target] of targets) {
      cents += (target - before) * step(ms - from);
      before = target;
    }
    out.push([ms, cents]);
  }
  return out;
}

/* ---------- the page ---------- */

const fig = new Figure();
const LX0 = 34;
const LX1 = 184;
const RX0 = 242;
const RX1 = WIDTH - 2;
const PLOT_H = 58;
const ROW = 102;
const ROWS = 4;
const BOTTOM = 16;
const axisOf = (row: number): number => BOTTOM + (ROWS - row) * ROW;
const HEIGHT = axisOf(1) + PLOT_H + 40;
const plot = (
  id: string,
  side: 'left' | 'right',
  row: number,
  xs: readonly [number, number],
  ys: readonly [number, number],
): Plot =>
  new Plot(fig, {
    id,
    x0: side === 'left' ? LX0 : RX0,
    x1: side === 'left' ? LX1 : RX1,
    y0: axisOf(row),
    y1: axisOf(row) + PLOT_H,
    xs,
    ys,
  });

/** The fader across: its 21 rendered settings ticked, 0, the middle and 1 labelled. */
function fader(p: Plot): void {
  p.axes();
  for (const e of RENDERED) p.xTick(e, e === 0 || e === 0.5 || e === 1 ? print(e, e === 0.5 ? 1 : 0) : null);
  // where the piano passes from the harmonies to the piece
  p.fig.add(String.raw`\draw[bezug] ${pt(p.x(PIECE_FROM), p.y0)} -- ${pt(p.x(PIECE_FROM), p.y1)};`);
}

function heading(row: number, title: string, about: string, right: string): void {
  const y = axisOf(row) + PLOT_H + 10;
  fig.node(`row-${row}`, pt(0, y), String.raw`\textbf{${row}\hspace{5bp}${title}}`, 'lab, anchor=base west');
  fig.node(`row-${row}-about`, `([xshift=6bp]row-${row}.base east)`, about, 'klein, anchor=base west');
  if (right !== '') fig.node(`row-${row}-right`, pt(RX0, y), right, 'klein, anchor=base west');
}

/** A short stroke and its label, as a key. */
function key(name: string, x: number, y: number, style: string, text: string): string {
  fig.add(String.raw`\draw[${style}] ${pt(x, y + 2.2)} -- ${pt(x + 10, y + 2.2)};`);
  fig.node(name, pt(x + 13, y), text, 'lab=6.5, anchor=base west');
  return name;
}

// the key: the fader on the left, three of its settings on the right
{
  const y = HEIGHT - 12;
  fig.node(
    'fader',
    pt(0, y),
    'Left: across the fader, from 0 to 1; its ticks are the settings rendered.',
    'lab=6.5, anchor=base west',
  );
  fig.node('settings', pt(RX0, y), 'Right, at three settings:', 'lab=6.5, anchor=base west');
  key('setting-0', RX0 + 76, y, 'fein, e0', '0');
  key('setting-05', RX0 + 104, y, 'fein, e05', '0.5');
  key('setting-1', RX0 + 137, y, 'fein, e1', '1, as written');
}

/** The bars across, the four sections of eight labelled: 1, its repeat 1’, 9 and 17. */
const SECTIONS = new Set(['1', "1'", '9', '17']);
const xBars = (p: Plot): void => {
  for (const bar of reduction.bars) {
    if (bar.tick > p.xs[1]) continue;
    const name = bar.label.replace("'", '-repeat');
    p.xTick(bar.tick, SECTIONS.has(bar.label) ? bar.label.replace("'", '’') : null, `bar-${name}`);
  }
};

const lastTick = Math.max(...at(1).map((n) => n.date));
const scoreEnd = lastTick + QUARTER;

/* (1) exaggeration */
{
  const row = 1;
  heading(
    row,
    'Exaggeration',
    'espressivo’s factor on all of the MPM’s expression',
    'the loudest note at each onset, bar by bar',
  );
  const left = plot('exaggeration', 'left', row, [0, 1], [1, 1.4]);
  fader(left);
  for (const v of [1, 1.1, 1.2, 1.3, 1.4])
    left.yTick(v, v === 1.1 || v === 1.3 ? '' : `×${print(v, v === 1 ? 0 : 1)}`);
  left.curve(
    'strichel',
    RENDERED.map((e) => [e, voiceLevel(e)]),
  );
  left.curve(
    'kurve',
    RENDERED.map((e) => [e, pianoLevel(e)]),
  );
  fig.node('exaggeration-piano', pt(LX1 + 4, left.y(pianoLevel(1))), 'piano', 'klein, anchor=west');
  fig.node('exaggeration-voice', pt(LX1 + 4, left.y(voiceLevel(1))), 'voice', 'klein, anchor=west');
  fig.node(
    'exaggeration-timing',
    pt(LX1, left.y1),
    String.raw`the voice’s timing\\is the piano’s`,
    'klein, anchor=north east, align=right',
  );
  left.dot('exaggeration-0', 'kb51700', 0, pianoLevel(0));
  left.dot('exaggeration-1', 'black', 1, pianoLevel(1));

  const right = plot('dynamics', 'right', row, [0, scoreEnd], [0, 50]);
  right.axes();
  xBars(right);
  fig.node('dynamics-bar', pt(RX1, axisOf(row) - 10), 'bar', 'lab=6.5, anchor=base east');
  for (const v of [0, 25, 50]) right.yTick(v, print(v), String(v));
  right.curve('fein, e1', loudest(at(1)));
  right.curve('fein, e0', loudest(at(0)));
}

/* (2) the piano: the harmonies, then the piece */
{
  const row = 2;
  heading(row, 'Piano score', 'what the piano plays, and how loud', '');
  const left = plot('piano', 'left', row, [0, 1], [-30, 0]);
  fader(left);
  for (const v of [0, -10, -20, -30]) left.yTick(v, v === 0 ? '0 dB' : print(v), String(-v));
  const heard = FINE.filter((e) => e < PIECE_FROM && dB(mix(e).harmonies) >= -30);
  left.curve('strichel', [
    ...heard.map((e) => [e, dB(mix(e).harmonies)] as const),
    [PIECE_FROM, dB(mix(0.4999).harmonies)],
  ]);
  left.curve('kurve', [
    [PIECE_FROM, dB(mix(PIECE_FROM).piece)],
    [1, dB(mix(1).piece)],
  ]);
  fig.node('piano-piece', pt(LX1 + 4, left.y(dB(mix(1).piece))), 'piece', 'klein, anchor=west');
  fig.node(
    'piano-harmonies',
    pt(left.x(0.2), left.y(dB(mix(0.2).harmonies)) - 4),
    'harmonies',
    'klein, anchor=north west',
  );
  fig.node('piano-none', pt(left.x(0) + 9, left.y0 + 3), 'none at 0', 'klein, anchor=south west');

  // bars 1 to 4 of both parts, timed as written: where they are the same, the piece lies on its harmonies
  const ms = timeMap(at(1));
  const bar = (label: string): number => {
    const found = reduction.bars.find((b) => b.label === label);
    if (!found) throw new Error(`no bar ${label}`);
    return found.tick;
  };
  const until = ms(bar('5'));
  const roll = plot('roll', 'right', row, [0, until], [39, 79]);
  roll.axes();
  for (const label of ['1', '2', '3', '4', '5']) {
    const x = ms(bar(label));
    if (label !== '1')
      fig.add(String.raw`\draw[bezug] ${pt(roll.x(x), roll.y0)} -- ${pt(roll.x(x), roll.y1)};`);
    roll.xTick(x, label === '5' ? null : label, `bar-${label}`);
  }
  fig.node('roll-bar', pt(RX1, axisOf(row) - 10), 'bar', 'lab=6.5, anchor=base east');
  for (const [pitch, name] of [
    [48, 'C3'],
    [60, 'C4'],
    [72, 'C5'],
  ] as const)
    roll.yTick(pitch, name, name);
  const keys = (notes: readonly Note[], style: string, height: number): void => {
    for (const n of notes) {
      if (n.onMs >= until) continue;
      const y = roll.y(n.pitch);
      fig.add(
        String.raw`\fill[${style}] ${pt(roll.x(n.onMs), y - height / 2)} rectangle ${pt(roll.x(Math.min(n.endMs, until)), y + height / 2)};`,
      );
    }
  };
  keys(harmonies, 'harmonien', 1.6);
  keys(at(1), 'stueck', 0.8);
  // the key, where the heading's right half would stand
  const y = axisOf(row) + PLOT_H + 10;
  fig.add(String.raw`\fill[harmonien] ${pt(RX0, y + 1.4)} rectangle ${pt(RX0 + 10, y + 3)};`);
  fig.node(
    'roll-harmonies',
    pt(RX0 + 13, y),
    `the harmonies, ${harmonies.length} keys, up to 0.5`,
    'klein, anchor=base west',
  );
  fig.add(String.raw`\fill[stueck] ${pt(RX0 + 112, y + 1.8)} rectangle ${pt(RX0 + 122, y + 2.6)};`);
  fig.node(
    'roll-piece',
    pt(RX0 + 125, y),
    `the piece, ${at(1).length} keys, from 0.5`,
    'klein, anchor=base west',
  );
}

/* (3) the voice */
{
  const row = 3;
  const loose = (e: number): PitchLooseness => pitchLooseness(approximateness(e), style);
  heading(
    row,
    'Voice',
    'how loud the humming is',
    'one sung note: cents off the written pitch, ms after the piano note',
  );
  const left = plot('voice', 'left', row, [0, 1], [-30, 0]);
  fader(left);
  for (const v of [0, -10, -20, -30]) left.yTick(v, v === 0 ? '0 dB' : print(v), String(-v));
  left.curve(
    'kurve',
    FINE.map((e) => [e, dB(mix(e).hum)]),
  );
  fig.node('voice-hum', pt(LX1 + 4, left.y(dB(mix(1).hum))), 'humming', 'klein, anchor=west');
  left.dot('voice-0', 'kb51700', 0, dB(mix(0).hum));
  left.dot('voice-05', 'kgray57', 0.5, dB(mix(0.5).hum));
  left.dot('voice-1', 'black', 1, dB(mix(1).hum));

  const UNTIL = 800;
  const right = plot('pitch', 'right', row, [-200, UNTIL], [-40, 160]);
  right.axes();
  for (const v of [0, 200, 400, 600]) right.xTick(v, v === 600 ? '600 ms' : print(v), String(v));
  for (const v of [0, 50, 100]) right.yTick(v, print(v), String(v));
  fig.add(String.raw`\draw[bezug] ${pt(right.x(-200), right.y(0))} -- ${pt(right.x(UNTIL), right.y(0))};`);
  fig.add(String.raw`\draw[bezug] ${pt(right.x(0), right.y0)} -- ${pt(right.x(0), right.y(100))};`);
  right.curve('fein, e1', sungNote(loose(1), UNTIL));
  right.curve('fein, e05', sungNote(loose(0.5), UNTIL));
  right.curve('fein, e0', sungNote(loose(0), UNTIL));
  const describe = (e: number): string => {
    const l = loose(e);
    return (
      `at ${print(e)}: half way at ${print(LATENCY_MS + l.follow)} ms, lands ${print(l.landSd * 100)} cents off, ` +
      `settles at ${print(l.settleMs)} ms, wobbles ±${print(l.wobble * 100)} cents`
    );
  };
  fig.node('pitch-0', pt(RX1, right.y1), describe(0), 'klein, anchor=north east');
  fig.node('pitch-1', `([yshift=-1.5bp]pitch-0.south east)`, describe(1), 'klein, anchor=north east');
}

/* (4) flightiness: the tempo */
{
  const row = 4;
  heading(row, 'Flightiness', 'the factor on the MPM’s tempo', 'the tempo as played, quarter notes a minute');
  const left = plot('tempo', 'left', row, [0, 1], [1, 1.4]);
  fader(left);
  for (const v of [1, 1.1, 1.2, 1.3, 1.4])
    left.yTick(v, v === 1.1 || v === 1.3 ? '' : `×${print(v, v === 1 ? 0 : 1)}`);
  left.curve(
    'kurve',
    RENDERED.map((e) => [e, tempoFactor(e)]),
  );
  for (const [e, colour, name] of [
    [0, 'kb51700', '0'],
    [0.5, 'kgray57', '05'],
    [1, 'black', '1'],
  ] as const) {
    left.dot(`tempo-${name}`, colour, e, tempoFactor(e));
    const [anchor, xshift] = e === 0 ? ['south west', 2] : e === 1 ? ['south east', -2] : ['south', 0];
    fig.node(
      `tempo-${name}-length`,
      `([xshift=${xshift}bp, yshift=2bp]tempo-${name}.north)`,
      `${print(ends(at(e)))} s`,
      `klein, anchor=${anchor}`,
    );
  }
  fig.node(
    'tempo-without',
    pt(LX1, left.y1),
    String.raw`how long the piece lasts;\\at 0 without the factor, ${print(exaggeratedOnly())} s`,
    'klein, anchor=north east, align=right',
  );

  const right = plot('played', 'right', row, [0, scoreEnd], [20, 110]);
  right.axes();
  xBars(right);
  fig.node('played-bar', pt(RX1, axisOf(row) - 10), 'bar', 'lab=6.5, anchor=base east');
  for (const v of [30, 60, 90]) right.yTick(v, print(v), String(v));
  right.curve('fein, e1', tempoCurve(at(1), lastTick));
  right.curve('fein, e0', tempoCurve(at(0), lastTick));
}

const out = join(ROOT, values.out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  fig.text(
    [
      'Drawn by tools/elaboration-figure.ts (npm run figure) from levels.ts, mix.ts, the hummer’s pitch line',
      `and espressivo’s performances of ../mpm; the page opens at ${DEFAULT_ELABORATION}. Not to be changed by hand: draw it again.`,
      'In the dialect of the dissertation’s figures/tikz: needs keynotefigures.sty.',
    ],
    HEIGHT,
  ),
);
console.log(`${values.out}: ${String(HEIGHT)} bp high`);
