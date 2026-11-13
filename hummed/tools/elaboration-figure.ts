// The figure of what the elaboration does, drawn as TikZ in the dialect of the dissertation's
// figures (its figures/tikz with keynotefigures.sty, as scripts/condon_figures.py writes them: x=1bp,
// Zwo OT, every node named, German). A schematic: the fader across, and without a scale what it
// sets, each curve as its function has it. The loudness of the humming and of the piano (mix.ts):
// the humming recedes, the piano plays the harmonies for the first third, the piece from there on;
// how exaggerated each is (levels.ts) is how thick it is drawn, the voice a little beyond the piano.
// The flightiness, how much faster and less exactly it goes, falls to nothing on the axis, where ×1
// stands. Labelled as little as will tell the curves apart. Not to be changed by hand: run this again.
//   npm run figure [-- --out figures/elaboration.tex]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { mix, PIECE_FROM } from '../src/page/mix.ts';
import { flightiness, pianoLevel, voiceLevel, shapeAt } from '../src/worker/levels.ts';
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
  'fluechtig/.style={draw=kgray57, line width=1bp, line join=round, line cap=round}',
  'summen/.style={fill=kb51700}',
  'klavier/.style={fill=black}',
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
const dB = (gain: number): number => 20 * Math.log10(gain);
/** The loudness on the axis, in dB: silence, as far as the figure goes. */
const FLOOR = -30;
/** How thick a loudness is drawn as it is exaggerated: thin as written, ×1, and this much more by ×2. */
const THIN = 0.6;
const PER_FACTOR = 3.2;
const thickness = (level: number): number => THIN + (level - 1) * PER_FACTOR;
/** How high the flightiness starts, as a share of the plot's height: it has no scale of its own. */
const FLIGHTY = 0.6;

/* ---------- the plot ---------- */

const fig = new Figure();
const X0 = 6;
const X1 = WIDTH - 6;
const Y0 = 16;
const TOP = Y0 + 120;
const HEIGHT = TOP + 6;
const x = (e: number): number => X0 + e * (X1 - X0);
/** A loudness, from the floor on the axis to 0 dB at the top. */
const loud = (db: number): number => Y0 + ((db - FLOOR) / -FLOOR) * (TOP - Y0);

/**
 * A line whose thickness changes along it, as a filled outline: each point moved half the
 * thickness to either side, across the line.
 */
function band(style: string, points: readonly (readonly [number, number, number])[]): void {
  const side = (sign: number): string[] =>
    points.map(([px, py, w], i) => {
      const [ax, ay] = points[Math.max(0, i - 1)];
      const [bx, by] = points[Math.min(points.length - 1, i + 1)];
      const length = Math.hypot(bx - ax, by - ay) || 1;
      return pt(px - (sign * (w / 2) * (by - ay)) / length, py + (sign * (w / 2) * (bx - ax)) / length);
    });
  fig.add(String.raw`\fill[${style}] ${[...side(1), ...side(-1).reverse()].join(' -- ')} -- cycle;`);
}
const label = (name: string, at: readonly [number, number], anchor: string, text: string): void => {
  const [dx, dy] = [
    anchor.includes('east') ? -2 : anchor.includes('west') ? 2 : 0,
    anchor.includes('north') ? -3 : 3,
  ];
  fig.node(name, pt(at[0] + dx, at[1] + dy), text, `klein, anchor=${anchor}`);
};

// the fader across, from 0 to 1
fig.add(String.raw`\draw[achse] ${pt(X0, Y0)} -- ${pt(X1, Y0)};`);
for (const e of [0, 1]) {
  fig.add(String.raw`\draw[achse] ${pt(x(e), Y0)} -- ${pt(x(e), Y0 - 2.5)};`);
  fig.node(`e-${key(e)}`, pt(x(e), Y0 - 10), print(e), 'lab=6.5, anchor=base');
}
fig.node('elaboration', pt(x(0.5), Y0 - 10), 'Elaboration', 'lab=6.5, anchor=base');

// the flightiness: how much faster than the MPM, and how much less exactly, down to ×1 on the axis
const flighty = (e: number): number => Y0 + FLIGHTY * flightiness(e) * (TOP - Y0);
fig.add(String.raw`\draw[fluechtig] ${FINE.map((e) => pt(x(e), flighty(e))).join(' -- ')};`);
label('fluechtigkeit', [x(0.25), flighty(0.25)], 'south west', 'Flüchtigkeit');

// the piano, as loud wherever it plays and parted where the fader is: the harmonies, then the piece
const GAP = 1.5;
const piano = loud(dB(mix(1).piece));
const part = (keep: (e: number) => boolean): void => {
  band(
    'klavier',
    FINE.filter((e) => e > 0 && keep(e)).map((e) => [x(e), piano, thickness(pianoLevel(shapeAt(e)))]),
  );
};
part((e) => x(e) <= x(PIECE_FROM) - GAP);
part((e) => x(e) >= x(PIECE_FROM) + GAP);
label(
  'harmonien',
  [x(PIECE_FROM / 2), piano + thickness(pianoLevel(shapeAt(PIECE_FROM / 2))) / 2],
  'south',
  'Harmonien',
);
label(
  'stueck',
  [x((1 + PIECE_FROM) / 2), piano + thickness(pianoLevel(shapeAt((1 + PIECE_FROM) / 2))) / 2],
  'south',
  'Stück',
);

// the humming recedes, fast at first, and thins, though less than the piano
band(
  'summen',
  FINE.map((e) => [x(e), loud(dB(mix(e).hum)), thickness(voiceLevel(shapeAt(e)))]),
);
label('summen', [x(1), loud(dB(mix(1).hum)) - thickness(voiceLevel(shapeAt(1))) / 2], 'north east', 'Summen');

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
