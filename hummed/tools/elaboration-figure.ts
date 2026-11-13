// The figure of what the elaboration does, drawn as TikZ in the dialect of the dissertation's
// figures (its figures/tikz with keynotefigures.sty, as scripts/condon_figures.py writes them: x=1bp,
// Zwo OT, every node named). One plot, the fader across, everything it sets as a factor: above ×1
// what it does to the MPM, the exaggeration of the piano and of the voice and the tempo
// (levels.ts); below ×1 the gains of the mix (mix.ts), the humming and what the piano plays, the
// harmonies and then the piece. Under the fader, how long the piece lasts, from espressivo's
// performances. Not to be changed by hand: run this again.
//   npm run figure [-- --out figures/elaboration.tex]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { exaggerateMpm, performMsmToData } from 'espressivo';
import { readPerformance, repair } from '../src/hummer/performance.ts';
import { mix, PIECE_FROM } from '../src/page/mix.ts';
import { pianoFactors, pianoLevel, tempoFactor, voiceLevel } from '../src/worker/levels.ts';
import { pianoMpm } from '../src/worker/piano.ts';
import { loadPianoScore, ROOT } from './node-support.ts';

const { values } = parseArgs({ options: { out: { type: 'string', default: 'figures/elaboration.tex' } } });

/* ---------- the dialect ---------- */

/** The dissertation's text width, which its figures fill. */
const WIDTH = 451.45;
const num = (v: number): string => v.toFixed(2);
const pt = (x: number, y: number): string => `(${num(x)},${num(y)})`;
/** A number as the figures print it, with a dash for the minus. */
const print = (v: number, digits = 0): string => v.toFixed(digits).replace('-', '–');
/** A setting of the fader as short as it goes: 0, 0.25, 0.5. */
const setting = (e: number): string => String(Number(e.toFixed(2)));

const STYLES = [
  String.raw`lab/.style={inner sep=0pt, outer sep=0pt, font=\kzwo{#1}}`,
  'lab/.default=7',
  'klein/.style={lab=6, text=kgray37}',
  'achse/.style={draw=black, line width=.4bp}',
  'kurve/.style={draw=black, line width=1bp, line join=round, line cap=round}',
  'strichel/.style={draw=kgray23, line width=.6bp, line cap=round, line join=round, dash pattern=on 3bp off 2bp}',
  'bezug/.style={draw=kgray84, line width=.5bp}',
  'tempo/.style={kurve, draw=kgray57}',
  'summen/.style={kurve, draw=kb51700}',
  'klavier/.style={fill=kgray84}',
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

/* ---------- what is drawn ---------- */

/** The settings the piano and the voice are rendered at (`voiceElaboration`, mix.ts): every 0.05. */
const RENDERED = Array.from({ length: 21 }, (_, i) => i / 20);
/** Finely, for what follows the fader as it moves: the mix. */
const FINE = Array.from({ length: 401 }, (_, i) => i / 400);
const dB = (gain: number): number => 20 * Math.log10(gain);

const score = loadPianoScore();
/** How long the piece lasts as the piano plays it with this MPM, in seconds. */
const lasts = (mpm: string): number => {
  const { notes } = readPerformance(performMsmToData({ msm: score.msm, mpm }, { expandOrnaments: true }));
  repair(notes);
  return Math.max(...notes.map((n) => n.endMs)) / 1000;
};
/** At 0 without the tempo factor: the exaggeration alone, which slows the piece. */
const exaggeratedOnly = (): number => {
  const factors = pianoFactors(pianoLevel(0));
  return lasts(factors ? exaggerateMpm(score.mpm, { factors }).mpm : score.mpm);
};

/* ---------- the plot ---------- */

const fig = new Figure();
const X0 = 40;
const X1 = 316;
const Y0 = 32;
const PER_UNIT = 140;
const TOP = 1.4;
const Y1 = Y0 + TOP * PER_UNIT;
const HEIGHT = Y1 + 8;
const x = (e: number): number => X0 + e * (X1 - X0);
const y = (v: number): number => Y0 + v * PER_UNIT;
/** Where the labels at the right-hand end stand. */
const END = X1 + 6;

const curve = (style: string, points: readonly (readonly [number, number])[]): void => {
  fig.add(String.raw`\draw[${style}] ${points.map(([e, v]) => pt(x(e), y(v))).join(' -- ')};`);
};
const label = (name: string, e: number, v: number, text: string, style: string): void => {
  fig.node(name, pt(x(e), y(v)), text, style);
};

// the axes: the fader across, its 21 rendered settings ticked; factors up, from 0 to ×1.4
fig.add(String.raw`\draw[achse] ${pt(X0, Y0)} -- ${pt(X1, Y0)};`);
fig.add(String.raw`\draw[achse] ${pt(X0, Y0)} -- ${pt(X0, Y1)};`);
for (const e of RENDERED) {
  const labelled = e * 4 === Math.round(e * 4);
  fig.add(String.raw`\draw[achse] ${pt(x(e), Y0)} -- ${pt(x(e), Y0 - (labelled ? 2.5 : 1.5))};`);
  if (labelled) fig.node(`e-${print(e * 100)}`, pt(x(e), Y0 - 10), setting(e), 'lab=6.5, anchor=base');
}
fig.node('e-name', pt(END, Y0 - 10), 'elaboration', 'lab=6.5, anchor=base west');
for (const v of [0, 0.25, 0.5, 0.75, 1, 1.2, 1.4]) {
  const labelled = v !== 0.25 && v !== 0.75;
  fig.add(String.raw`\draw[achse] ${pt(X0, y(v))} -- ${pt(X0 - (labelled ? 2.5 : 1.5), y(v))};`);
  if (labelled)
    fig.node(
      `factor-${print(v * 100)}`,
      pt(X0 - 5, y(v)),
      v === 0 ? '0' : `×${print(v, v === 1 ? 0 : 1)}`,
      'lab=6.5, anchor=east',
    );
}
// ×1: as written, and the humming alone
fig.add(String.raw`\draw[bezug] ${pt(X0, y(1))} -- ${pt(X1, y(1))};`);
fig.node('on-the-mpm', pt(8, y((1 + TOP) / 2)), 'on the MPM', 'klein, anchor=center, rotate=90');
fig.node('in-the-mix', pt(8, y(0.5)), 'in the mix', 'klein, anchor=center, rotate=90');

// (2) the piano: the harmonies come in under the humming, from the middle on the piece instead, at
// the same level; parted where the fader is parted
const harmonies = FINE.filter((e) => e < PIECE_FROM);
fig.add(
  String.raw`\fill[klavier] ${pt(x(0), y(0))} -- ` +
    harmonies.map((e) => pt(x(e), y(mix(e).harmonies))).join(' -- ') +
    ` -- ${pt(x(PIECE_FROM), y(mix(0.49999).harmonies))} -- ${pt(x(PIECE_FROM), y(0))} -- cycle;`,
);
fig.add(String.raw`\fill[klavier] ${pt(x(PIECE_FROM), y(0))} rectangle ${pt(x(1), y(mix(1).piece))};`);
fig.add(
  String.raw`\draw[draw=white, line width=1bp] ${pt(x(PIECE_FROM), y(0))} -- ${pt(x(PIECE_FROM), y(mix(1).piece))};`,
);
label('harmonies', 0.27, 0.035, 'the harmonies', 'klein, anchor=base west');
label('piece', 0.53, 0.035, 'the piece', 'klein, anchor=base west');
label(
  'piano-gain',
  1,
  mix(1).piece,
  `the piano, ×${print(mix(1).piece, 2)}, ${print(dB(mix(1).piece))} dB`,
  'klein, anchor=west, xshift=6bp',
);

// (3) the voice: the humming recedes, fast at first
curve(
  'summen',
  FINE.map((e) => [e, mix(e).hum]),
);
label('hum-alone', 0, 1, 'the humming alone, 0 dB', 'klein, anchor=south west, xshift=4bp, yshift=2bp');
label(
  'hum',
  1,
  mix(1).hum,
  `the humming, ×${print(mix(1).hum, 2)}, ${print(dB(mix(1).hum))} dB`,
  'klein, anchor=west, xshift=6bp',
);

// (4) the tempo, and (1) the exaggeration: the voice's beyond the piano's, but in time with it
curve(
  'tempo',
  RENDERED.map((e) => [e, tempoFactor(e)]),
);
// standing under the line where it ends, so that the line falls nowhere through it
label('tempo', 0.3, tempoFactor(0.3), 'the tempo', 'klein, anchor=north east, yshift=-3bp');
curve(
  'strichel',
  RENDERED.map((e) => [e, voiceLevel(e)]),
);
curve(
  'kurve',
  RENDERED.map((e) => [e, pianoLevel(e)]),
);
label(
  'voice',
  1,
  voiceLevel(1),
  'the voice’s exaggeration, not its timing',
  'klein, anchor=west, xshift=6bp',
);
label('piano', 1, pianoLevel(1), 'the piano’s exaggeration, and the tempo', 'klein, anchor=west, xshift=6bp');

// how long the piece lasts, under the fader
for (const e of [0, 0.5, 1]) {
  fig.node(
    `lasts-${print(e * 100)}`,
    pt(x(e), Y0 - 20),
    `${print(lasts(pianoMpm(score.mpm, e)))} s`,
    'lab=6.5, anchor=base',
  );
}
fig.node(
  'lasts-without',
  '([xshift=4bp]lasts-0.base east)',
  `(${print(exaggeratedOnly())} s without the tempo factor)`,
  'klein, anchor=base west',
);
fig.node(
  'lasts',
  '([xshift=6bp]lasts-100.base east)',
  'how long the piece lasts',
  'lab=6.5, anchor=base west',
);

const out = join(ROOT, values.out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  fig.text(
    [
      'Drawn by tools/elaboration-figure.ts (npm run figure) from levels.ts, mix.ts and espressivo’s',
      'performances of ../mpm. Not to be changed by hand: draw it again.',
      'In the dialect of the dissertation’s figures/tikz: needs keynotefigures.sty.',
    ],
    HEIGHT,
  ),
);
console.log(`${values.out}: ${String(HEIGHT)} bp high`);
