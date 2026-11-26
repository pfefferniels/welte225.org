// The figure of what the elaboration does, drawn as TikZ in the dialect of the dissertation's
// figures (its figures/tikz with keynotefigures.sty, as scripts/condon_figures.py writes them: x=1bp,
// Zwo OT, every node named, German): the exaggeration from ×1 to ×2 up, the fader across, under it
// what the piano plays (Summen where the voice is alone, Halbe, Viertel, Stück, the two harmonic
// reductions bracketed). The piano's exaggeration solid, the voice's own dashed, each as the table of
// points has it (shape.ts): curves between points, flat across a step.
// Not to be changed by hand: run this again.
//   npm run figure [-- --out figures/elaboration.tex]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { pianoLevel, pianoPlays, shapeAt, voiceLevel, type Plays } from '../src/worker/levels.ts';
import { ROOT } from './node-support.ts';

const { values } = parseArgs({ options: { out: { type: 'string', default: 'figures/elaboration.tex' } } });

/* ---------- the dialect ---------- */

/** The dissertation's text width, which its figures fill. */
const WIDTH = 451.45;
const num = (v: number): string => v.toFixed(2);
const pt = (x: number, y: number): string => `(${num(x)},${num(y)})`;

const STYLES = [
  String.raw`lab/.style={inner sep=0pt, outer sep=0pt, font=\kzwo{#1}}`,
  'lab/.default=7',
  'klein/.style={lab=6, text=kgray37}',
  'achse/.style={draw=black, line width=.4bp}',
  'klavier/.style={draw=black, line width=1.2bp, line join=round, line cap=round}',
  'stimme/.style={draw=kb51700, line width=1.2bp, dash pattern=on 4bp off 3bp, line cap=round}',
  'pfeil/.style={draw=black, line width=.4bp, ->}',
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

/** Finely along the fader. */
const FINE = Array.from({ length: 401 }, (_, i) => i / 400);

/* ---------- the plot ---------- */

const fig = new Figure();
/** The plot: the exaggeration up from ×1 to ×2, the fader across. */
const X0 = 78;
const X1 = WIDTH - 14;
const Y0 = 62;
const TOP = Y0 + 96;
const HEIGHT = TOP + 14;
const x = (e: number): number => X0 + e * (X1 - X0);
const y = (level: number): number => Y0 + (level - 1) * (TOP - Y0);
const curve = (style: string, level: (e: number) => number): void => {
  fig.add(String.raw`\draw[${style}] ${FINE.map((e) => pt(x(e), y(level(e)))).join(' -- ')};`);
};

// the axes, an arrow at the end of each, and the exaggeration's two marks
fig.add(String.raw`\draw[pfeil] ${pt(X0, Y0)} -- ${pt(X1 + 8, Y0)};`);
fig.add(String.raw`\draw[pfeil] ${pt(X0, Y0)} -- ${pt(X0, TOP + 10)};`);
for (const [level, text] of [
  [1, '1×'],
  [2, '2×'],
] as const) {
  fig.add(String.raw`\draw[achse] ${pt(X0 - 3, y(level))} -- ${pt(X0, y(level))};`);
  fig.node(`mark-${String(level)}`, pt(X0 - 5, y(level)), text, 'lab=7, anchor=east');
}
fig.node('uebertreibung', pt(X0 - 24, (Y0 + TOP) / 2), 'Übertreibung', 'lab=7.5, anchor=east');

// the piano's exaggeration, solid; the voice's, dashed
curve('klavier', (e) => pianoLevel(shapeAt(e)));
curve('stimme', (e) => voiceLevel(shapeAt(e)));

// under the fader, what the piano plays (none: the humming alone), each harmonic reduction and each
// version of the piece (struck again on every eighth; its melody on every sixteenth), the reductions
// bracketed; their stretches from the table of points (shape.ts)
const PLAYS = Y0 - 13;
const NAMES = {
  none: ['summen', 'Summen'],
  halves: ['halbe', 'Halbe'],
  'halves on quarters': ['halbeviertel', 'Halbe/4'],
  quarters: ['viertel', 'Viertel'],
  'quarters on eighths': ['viertelachtel', 'Viertel/8'],
  accompaniment: ['begleitung', 'Begl.'],
  piece: ['stueck', 'Stück'],
  'piece on eighths': ['achtel', 'Stück/8'],
  'piece on sixteenths': ['sechzehntel', 'Stück/16'],
} as const satisfies Record<Plays, readonly [string, string]>;
const stages: (readonly [name: string, from: number, to: number, text: string])[] = [];
for (const e of FINE) {
  const plays = pianoPlays(e);
  const last = stages.at(-1);
  if (last?.[0] === NAMES[plays][0]) stages[stages.length - 1] = [last[0], last[1], e, last[3]];
  else stages.push([NAMES[plays][0], e, e, NAMES[plays][1]]);
}
stages.forEach(([name, from, , text], i) => {
  const to = stages[i + 1]?.[1] ?? 1;
  fig.add(String.raw`\draw[achse] ${pt(x(from), Y0)} -- ${pt(x(from), Y0 - 2.5)};`);
  fig.node(name, pt(x((from + to) / 2), PLAYS), text, 'lab=7, anchor=base');
});
fig.add(String.raw`\draw[pfeil] ([xshift=4bp]stueck.east) -- ${pt(X1 - 4, PLAYS + 2.5)};`);
const REDUCED = new Set<string>(['halbe', 'halbeviertel', 'viertel', 'viertelachtel', 'begleitung']);
const reduced = stages.filter(([name]) => REDUCED.has(name));
const from = reduced.at(0)?.[1] ?? 0;
const to = stages.find(([name]) => name !== 'summen' && !REDUCED.has(name))?.[1] ?? 1;
const BRACKET = PLAYS - 6;
fig.add(
  String.raw`\draw[achse] ${pt(x(from) + 2, BRACKET + 3)} -- ${pt(x(from) + 2, BRACKET)} -- ${pt(x(to) - 2, BRACKET)} -- ${pt(x(to) - 2, BRACKET + 3)};`,
);
fig.node('reduktion', pt(x((from + to) / 2), BRACKET - 9), 'harm. Reduktion', 'klein, anchor=base');

// what the lines are
const KEY = 14;
const legend = (name: string, style: string, at: number, text: string): void => {
  fig.add(String.raw`\draw[${style}] ${pt(X0, at + 2.5)} -- ${pt(X0 + 24, at + 2.5)};`);
  fig.node(name, pt(X0 + 30, at), text, 'klein, anchor=base west');
};
legend('legende-klavier', 'klavier', KEY + 10, '= Übertreibung Klavier');
legend('legende-stimme', 'stimme', KEY, '= Übertreibung Stimme (ohne Timing, das dem Klavier folgt)');

const out = join(ROOT, values.out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  fig.text(
    [
      'Drawn by tools/elaboration-figure.ts (npm run figure) from levels.ts and mix.ts.',
      'Not to be changed by hand: draw it again.',
      'In the dialect of the dissertation’s figures/tikz: needs keynotefigures.sty.',
    ],
    HEIGHT,
  ),
);
console.log(`${values.out}: ${String(HEIGHT)} bp high`);
