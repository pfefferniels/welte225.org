// The figure of what the elaboration does, drawn as TikZ in the dialect of the dissertation's
// figures (its figures/tikz with keynotefigures.sty, as scripts/condon_figures.py writes them: x=1bp,
// Zwo OT, every node named, German, a decimal comma). One plot, the fader across, on two scales: on
// the left the factors on the MPM, the exaggeration of the piano and of the voice and the tempo
// (levels.ts); on the right the mix in dB (mix.ts), the humming and what the piano plays, the
// harmonies and then the piece. Labelled as little as will tell the curves apart. Not to be
// changed by hand: run this again.
//   npm run figure [-- --out figures/elaboration.tex]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { mix, PIECE_FROM } from '../src/page/mix.ts';
import { pianoLevel, tempoFactor, voiceLevel } from '../src/worker/levels.ts';
import { ROOT } from './node-support.ts';

const { values } = parseArgs({ options: { out: { type: 'string', default: 'figures/elaboration.tex' } } });

/* ---------- the dialect ---------- */

/** The dissertation's text width, which its figures fill. */
const WIDTH = 451.45;
const num = (v: number): string => v.toFixed(2);
const pt = (x: number, y: number): string => `(${num(x)},${num(y)})`;
/** A number as the figures print it: a decimal comma, a dash for the minus, no trailing zeros. */
const print = (v: number): string =>
  String(Number(v.toFixed(2)))
    .replace('.', ',')
    .replace('-', '–');
/** A number fit for a node's name. */
const key = (v: number): string => String(Math.round(Math.abs(v) * 100));

const STYLES = [
  String.raw`lab/.style={inner sep=0pt, outer sep=0pt, font=\kzwo{#1}}`,
  'lab/.default=7',
  'klein/.style={lab=6, text=kgray37}',
  'achse/.style={draw=black, line width=.4bp}',
  'kurve/.style={draw=black, line width=1bp, line join=round, line cap=round}',
  'strichel/.style={draw=kgray23, line width=.6bp, line cap=round, line join=round, dash pattern=on 3bp off 2bp}',
  'tempo/.style={kurve, draw=kgray57}',
  'summen/.style={kurve, draw=kb51700}',
  'klavier/.style={fill=kgray84, fill opacity=.45}',
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
/** The mix's floor: what is quieter is not drawn. Low enough that the humming ends well above the voice. */
const FLOOR = -40;

/* ---------- the plot ---------- */

const fig = new Figure();
const X0 = 30;
const X1 = WIDTH - 26;
const Y0 = 26;
const TOP = Y0 + 170;
const HEIGHT = TOP + 6;
const x = (e: number): number => X0 + e * (X1 - X0);

/** One of the two scales, each over the plot's height: its range of values, and its side. */
interface Scale {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly side: 'left' | 'right';
}
/** The factors on the MPM, on the left. */
const MPM: Scale = { id: 'faktor', from: 1, to: 1.4, side: 'left' };
/** The mix in dB, on the right. */
const MIX: Scale = { id: 'db', from: FLOOR, to: 0, side: 'right' };
const y = (s: Scale, v: number): number => Y0 + ((v - s.from) / (s.to - s.from)) * (TOP - Y0);

const curve = (style: string, s: Scale, points: readonly (readonly [number, number])[]): void => {
  fig.add(String.raw`\draw[${style}] ${points.map(([e, v]) => pt(x(e), y(s, v))).join(' -- ')};`);
};
/** A curve's name, beside it at a setting of the fader. */
const beside = (name: string, s: Scale, e: number, v: number, anchor: string, text: string): void => {
  const [dx, dy] = [anchor.includes('east') ? -2 : 2, anchor.includes('north') ? -3 : 3];
  fig.node(name, pt(x(e) + dx, y(s, v) + dy), text, `klein, anchor=${anchor}`);
};

// the fader across, its 21 rendered settings ticked
fig.add(String.raw`\draw[achse] ${pt(X0, Y0)} -- ${pt(X1, Y0)};`);
for (const e of RENDERED) {
  const labelled = e === 0 || e === 0.5 || e === 1;
  fig.add(String.raw`\draw[achse] ${pt(x(e), Y0)} -- ${pt(x(e), Y0 - (labelled ? 2.5 : 1.5))};`);
  if (labelled) fig.node(`e-${key(e)}`, pt(x(e), Y0 - 10), print(e), 'lab=6.5, anchor=base');
}
fig.node('elaboration', pt(X1, Y0 - 20), 'Elaboration', 'lab=6.5, anchor=base east');

// the two scales, one on each side
const scale = (s: Scale, ticks: readonly number[], label: (v: number) => string | null): void => {
  const at = s.side === 'left' ? X0 : X1;
  const out = s.side === 'left' ? -1 : 1;
  fig.add(String.raw`\draw[achse] ${pt(at, Y0)} -- ${pt(at, TOP)};`);
  for (const v of ticks) {
    const text = label(v);
    fig.add(
      String.raw`\draw[achse] ${pt(at, y(s, v))} -- ${pt(at + out * (text === null ? 1.5 : 2.5), y(s, v))};`,
    );
    if (text !== null)
      fig.node(
        `${s.id}-${key(v)}`,
        pt(at + out * 5, y(s, v)),
        text,
        `lab=6.5, anchor=${s.side === 'left' ? 'east' : 'west'}`,
      );
  }
};
scale(MPM, [1, 1.1, 1.2, 1.3, 1.4], (v) => (v === 1.1 || v === 1.3 ? null : `×${print(v)}`));
scale(MIX, [-40, -30, -20, -10, 0], (v) => (v === 0 ? '0 dB' : v === -30 || v === -10 ? null : print(v)));

// the piano: the harmonies come in under the humming, from the middle on the piece instead, at the
// same level; parted where the fader is parted
const harmonies = FINE.filter((e) => e < PIECE_FROM && dB(mix(e).harmonies) > FLOOR);
const firstHeard = harmonies[0] ?? PIECE_FROM;
fig.add(
  String.raw`\fill[klavier] ${pt(x(firstHeard), Y0)} -- ` +
    harmonies.map((e) => pt(x(e), y(MIX, dB(mix(e).harmonies)))).join(' -- ') +
    ` -- ${pt(x(PIECE_FROM), y(MIX, dB(mix(PIECE_FROM - 1e-9).harmonies)))} -- ${pt(x(PIECE_FROM), Y0)} -- cycle;`,
);
const piece = y(MIX, dB(mix(1).piece));
fig.add(String.raw`\fill[klavier] ${pt(x(PIECE_FROM), Y0)} rectangle ${pt(x(1), piece)};`);
fig.add(
  String.raw`\draw[draw=white, line width=1bp] ${pt(x(PIECE_FROM), Y0)} -- ${pt(x(PIECE_FROM), piece)};`,
);
fig.node('harmonien', pt(x(PIECE_FROM) - 4, Y0 + 4), 'Harmonien', 'klein, anchor=base east');
fig.node('stueck', pt(x(PIECE_FROM) + 4, Y0 + 4), 'Stück', 'klein, anchor=base west');

// the humming recedes, fast at first
curve(
  'summen',
  MIX,
  FINE.map((e) => [e, dB(mix(e).hum)]),
);
beside('summen', MIX, 1, dB(mix(1).hum), 'north east', 'Summen');

// the tempo, and the exaggeration: the voice's beyond the piano's
curve(
  'tempo',
  MPM,
  RENDERED.map((e) => [e, tempoFactor(e)]),
);
// under the line where it ends, so that the line falls nowhere through it
beside('tempo', MPM, 0.3, tempoFactor(0.3), 'north east', 'Tempo');
curve(
  'strichel',
  MPM,
  RENDERED.map((e) => [e, voiceLevel(e)]),
);
curve(
  'kurve',
  MPM,
  RENDERED.map((e) => [e, pianoLevel(e)]),
);
beside('stimme', MPM, 1, voiceLevel(1), 'south east', 'Übertreibung Stimme');
beside('klavier', MPM, 0.45, pianoLevel(0.45), 'south west', 'Übertreibung Klavier');

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
