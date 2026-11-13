// The figure of what the elaboration does, drawn as TikZ in the dialect of the dissertation's
// figures (its figures/tikz with keynotefigures.sty, as scripts/condon_figures.py writes them: x=1bp,
// Zwo OT, every node named, German), after the sketch it was planned on: the exaggeration from ×1 to
// ×2 up, the fader across, under it what the piano plays (Halbe, Viertel, Stück, the first two the
// harmonic reduction). The piano's exaggeration solid: none in the half notes, rising through the
// quarters to ×2 where the piece comes in, falling to ×1 at the top. Dashed, what falls from the
// bare end throughout: the voice's exaggeration, which stands for its loudness and for the global
// speed and inexactness (the flightiness) too, each as its function has it (levels.ts, mix.ts).
// Not to be changed by hand: run this again.
//   npm run figure [-- --out figures/elaboration.tex]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { PIECE_FROM, QUARTERS_FROM } from '../src/page/mix.ts';
import { pianoLevel, voiceLevel, shapeAt } from '../src/worker/levels.ts';
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

// the piano's exaggeration, solid; what falls from the bare end, dashed
curve('klavier', (e) => pianoLevel(shapeAt(e)));
curve('stimme', (e) => voiceLevel(shapeAt(e)));

// under the fader, what the piano plays, and the first two bracketed: the harmonic reduction
const PLAYS = Y0 - 13;
const stages = [
  ['halbe', 0, QUARTERS_FROM, 'Halbe'],
  ['viertel', QUARTERS_FROM, PIECE_FROM, 'Viertel'],
  ['stueck', PIECE_FROM, 1, 'Stück'],
] as const;
for (const [name, from, to, text] of stages) {
  fig.add(String.raw`\draw[achse] ${pt(x(from), Y0)} -- ${pt(x(from), Y0 - 2.5)};`);
  fig.node(name, pt(x((from + to) / 2), PLAYS), text, 'lab=7, anchor=base');
}
for (const [a, b] of [
  [stages[0], stages[1]],
  [stages[1], stages[2]],
] as const)
  fig.add(String.raw`\draw[pfeil] ([xshift=4bp]${a[0]}.east) -- ([xshift=-4bp]${b[0]}.west);`);
fig.add(String.raw`\draw[pfeil] ([xshift=4bp]stueck.east) -- ${pt(X1 - 4, PLAYS + 2.5)};`);
const BRACKET = PLAYS - 6;
fig.add(
  String.raw`\draw[achse] ${pt(x(0) + 2, BRACKET + 3)} -- ${pt(x(0) + 2, BRACKET)} -- ${pt(x(PIECE_FROM) - 2, BRACKET)} -- ${pt(x(PIECE_FROM) - 2, BRACKET + 3)};`,
);
fig.node('reduktion', pt(x(PIECE_FROM / 2), BRACKET - 9), 'harm. Reduktion', 'klein, anchor=base');

// what the lines are
const KEY = 14;
const legend = (name: string, style: string, at: number, text: string): void => {
  fig.add(String.raw`\draw[${style}] ${pt(X0, at + 2.5)} -- ${pt(X0 + 24, at + 2.5)};`);
  fig.node(name, pt(X0 + 30, at), text, 'klein, anchor=base west');
};
legend('legende-klavier', 'klavier', KEY + 10, '= Übertreibung Klavier');
legend(
  'legende-stimme',
  'stimme',
  KEY,
  '= Übertreibung Stimme, Lautstärke Stimme und globale Geschwindigkeit/Ungenauigkeit (= Flüchtigkeit)',
);

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
