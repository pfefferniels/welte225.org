/**
 * From an idea to a physical object: the way of WM 225, step by step.
 *
 * A slider leads through the layers of the dissertation's projects, and the view passes from one
 * to the next frame by frame, as digital-louis does: the idea of the performance unfolds into the
 * reconstruction's gestures, each gesture folds into a band of signs, one for every MPM instruction
 * it is made of, each sign where it stands in time and as long as it lasts, the bands unfold into
 * the notes as the recording roll took them down in ink, the
 * ink into the text of the roll as it was first perforated (R1), that text through its revisions
 * (R2–R4), and the last of them onto the paper of Stanford's copy St2, with what the paper went
 * through. There is no score on the way.
 *
 * Everything drawn comes from `data.json`, written by `scripts/recordJourney.ts` in mpm-desk from
 * the published reconstruction and edition. The page computes nothing but the drawing.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The steps of the slider. `title` is what it says; `caption` is shown while it rests there. */
const STEPS = [
  {
    key: 'idea',
    title: 'Idea',
    caption: 'Where it begins: an idea of how the piece should sound, before anything about it is decided.',
  },
  {
    key: 'gestures',
    title: 'Gestures',
    caption: 'The idea unfolds into gestures, each a claim about one stretch of the performance. The broad ones come first, the concrete ones after.',
  },
  {
    key: 'instructions',
    title: 'Instructions',
    caption: 'Each gesture folds into the signs of the performance instructions it is made of, encoded in MPM: tempo, dynamics, rubato, accents, arpeggios, pedal. Every sign stands where it acts in time; a gesture\u2019s signs are kept together. Point at one for its encoding.',
  },
  {
    key: 'recording',
    title: 'Recording',
    caption: 'The signs unfold into the notes as they were played, and as the recording roll took them down: an ink stroke for every note, the broader the louder.',
  },
  {
    key: 'R1',
    title: 'R1',
    caption: 'The text of the roll as first perforated, reconstructed: every note a perforation of one size. How loud is now said by the expression tracks at the edges.',
  },
  {
    key: 'R2',
    title: 'R2',
    caption: 'The text revised. Green is what this version adds, red what it takes away; point at one to see why.',
  },
  {
    key: 'R3',
    title: 'R3',
    caption: 'Revised again. No surviving copy carries this version: it is inferred from those that derive from it.',
  },
  {
    key: 'R4',
    title: 'R4',
    caption: 'Revised once more: the text as Stanford’s second copy has it.',
  },
  {
    key: 'copy',
    title: 'St2',
    caption: 'The text on paper: Stanford’s copy St2, red paper, perforated in January 1914, every hole where the scan finds it.',
  },
  {
    key: 'today',
    title: 'St2 today',
    caption: 'And what the paper went through since: a note on the leader, possibly in Dennis Condon’s hand, the date of the perforation written at its end, and tears along its edges.',
  },
];

/** The idea, as the first step shows it. */
const IDEA = ['„beinahe unhörbares Pianissimo“', 'velvety sound', 'improvisatory'];

/** How long the view takes from one step to the next, in milliseconds, by the step it leaves. */
const STEP_DURATION = [2600, 2200, 3000, 2400, 1500, 1500, 1500, 2600, 2000];

/** Where the published claims open in MPM Desk. */
const SEGMENT_URL = (id) => `/mpm/${id}`;

/** The track pitch of the red roll, across the paper, in millimetres (punch-225). */
const TRACK_MM = 3.193;
/** St2's perforations: their size and their pitch along the paper, in millimetres (punch-225). */
const HOLE_MM = 2.35;
const HOLE_PITCH_MM = 2.998;

const PAD_LEFT = 300;
const PAD_RIGHT = 120;
const TOP = 28;

const COLORS = {
  notated: '#9aa3b2',
  word: '#374151',
  ink: '#1d3270',
  note: '#334155',
  dynamics: '#8e44ad',
  pedal: '#475569',
  added: '#15803d',
  removed: '#dc2626',
  paper: '#b8573f',
  paperAged: '#a8573f',
  graphite: '#2a2522',
};

/** One colour per MPM element type, as the viewer has them. */
const SIGN_COLORS = {
  dynamics: '#8e44ad',
  tempo: '#16a085',
  ornament: '#d35400',
  articulation: '#2c3e50',
  rubato: '#e74c3c',
  accentuationPattern: '#2980b9',
  movement: '#475569',
};

// ------------------------------------------------------------------------------------------------
// Small tools
// ------------------------------------------------------------------------------------------------

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const hex = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
const mix = (from, to, t) => {
  const [a, b] = [hex(from), hex(to)];
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
};

const el = (name, attributes = {}, parent) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (parent) parent.appendChild(node);
  return node;
};

/** Sets an attribute only where it changes: most of a frame changes nothing. */
const set = (node, name, value) => {
  const text = typeof value === 'number' ? (Math.round(value * 100) / 100).toString() : value;
  if (node.getAttribute(name) !== text) node.setAttribute(name, text);
};

const opacity = (node, value) => {
  const v = value <= 0.002 ? 0 : value >= 0.998 ? 1 : value;
  set(node, 'opacity', v);
  const hidden = v === 0;
  if (node.__hidden !== hidden) {
    node.style.display = hidden ? 'none' : '';
    node.__hidden = hidden;
  }
};

const pill = (node, x0, x1, cy, h) => {
  const width = Math.max(h, x1 - x0);
  set(node, 'x', x0);
  set(node, 'y', cy - h / 2);
  set(node, 'width', width);
  set(node, 'height', h);
  set(node, 'rx', Math.min(h, width) / 2);
};

// ------------------------------------------------------------------------------------------------
// The view
// ------------------------------------------------------------------------------------------------

const root = document.querySelector('[data-journey]');
const base = root.dataset.journey;

const data = await fetch(`${base}data.json`).then((r) => r.json());

const { score, tree, claims, signs, performance, roll, copy } = data;

const X = (tick) => PAD_LEFT + tick * score.pxPerTick;
const XR = (mm) => PAD_LEFT + roll.axis.a + roll.axis.b * mm;
const pxPerMm = roll.axis.b;
/** The paper in true proportion: a track as wide across as a millimetre is long. */
const rowH = roll.rowH ?? TRACK_MM * pxPerMm;
/** Half the paper's width, from the middle of the roll, which is where the trunk lies. */
const half = 50 * rowH + 24;
// The leader of the paper, where Condon wrote, lies far before the music: the axis is broken
// just before the first perforation, and what lies before is drawn close to it.
const firstMm = Math.min(...roll.symbols.map((s) => s.from), ...copy.holes.map((h) => h.from));
const lastMm = Math.max(...roll.symbols.map((s) => s.to), ...copy.holes.map((h) => h.to));
const breakMm = firstMm - 22;
const leaderWritings = copy.writings.filter((w) => w.to < breakMm);
const leaderShift = leaderWritings.length
  ? breakMm - 26 - (Math.max(...leaderWritings.map((w) => w.to)) + 14)
  : 0;
const onAxis = (mm) => (mm < breakMm ? mm + leaderShift : mm);
const paperFrom = leaderWritings.length ? Math.min(...leaderWritings.map((w) => w.from)) + leaderShift - 30 : firstMm - 40;
const paperTo = Math.min(copy.extent[1], Math.max(lastMm, ...copy.writings.map((w) => w.to)) + 120);

const stageW = Math.ceil(Math.max(X(score.end), XR(paperTo)) + PAD_RIGHT);

/** On a phone the whole view is drawn smaller, for more than a bar to be seen at once. */
const zoom = window.matchMedia('(max-width: 700px)').matches ? 0.72 : 1;

const stage = root.querySelector('.journey-stage');
const scroller = root.querySelector('.journey-scroll');
// sized once the piles are packed, which decide how much room there is to be above and below
const svg = el('svg', { class: 'journey-svg' });
stage.appendChild(svg);

const defs = el('defs', {}, svg);

// Layers, from the bottom up.
const gGrid = el('g', { class: 'grid' }, svg);
const gPaper = el('g', { class: 'paper' }, svg);
const gTrunk = el('g', { class: 'trunk' }, svg);
const gPiles = el('g', { class: 'piles' }, svg);
const gTravel = el('g', { class: 'travel' }, svg);
const gClaims = el('g', { class: 'claims' }, svg);
const gSymbols = el('g', { class: 'symbols' }, svg);
const gHoles = el('g', { class: 'holes' }, svg);
const gLater = el('g', { class: 'later' }, svg);

// ---- the bands: every gesture's signs, kept together ---------------------------------------
//
// Every sign stands where it acts in time and is as long as it lasts, as the generator drew it.
// Only its height is the page's to choose: a gesture's signs share a band, a row for each kind,
// and the bands are stacked about the trunk, each on the side its word leaned to.

/** The signs of each claim. */
const signsOfClaim = claims.map(() => []);
signs.forEach((sign, index) => sign.segments.forEach((claim) => signsOfClaim[claim]?.push(index)));

/** In a band, a row for each kind: how fast, how flexible, how loud, then note by note, then the pedal. */
const KIND_ORDER = ['tempo', 'rubato', 'dynamics', 'accentuationPattern', 'articulation', 'ornament', 'movement'];
const BAND_PAD = 5;
const ROW_GAP = 4;

const pileNodes = claims.map((claim, index) => {
  const g = el('g', { class: 'pile', 'data-claim': index }, gPiles);
  const inner = el('g', {}, g);
  // a card under the band, so that it reads as one
  const card = el('rect', { rx: 6, fill: '#f6f7f9', stroke: '#eceef2' }, inner);
  const content = el('g', {}, inner);
  const items = signsOfClaim[index].map((i) => {
    const sign = signs[i];
    const color = SIGN_COLORS[sign.type] ?? '#666';
    const sg = el('g', { class: 'sign', 'data-sign': i }, content);
    el('path', { d: sign.stroke + sign.fill, fill: 'none', stroke: 'transparent', 'stroke-width': 8, 'vector-effect': 'non-scaling-stroke' }, sg);
    const stroke = sign.stroke
      ? el('path', {
          d: sign.stroke,
          fill: 'none',
          stroke: color,
          'stroke-width': 1.4 * (sign.weight ?? 1),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'vector-effect': 'non-scaling-stroke',
          ...(sign.dashed && { 'stroke-dasharray': '4 3' }),
        }, sg)
      : null;
    if (sign.fill) el('path', { d: sign.fill, fill: color }, sg);
    return { sg, sign, box: sg.getBBox(), strokes: stroke ? [{ stroke, sign }] : [] };
  });
  // rows by kind; a second row of a kind only where two of its signs would overlap in time
  const rows = [];
  const sorted = items.slice().sort((a, b) => KIND_ORDER.indexOf(a.sign.type) - KIND_ORDER.indexOf(b.sign.type) || a.box.x - b.box.x);
  for (const item of sorted) {
    const clear = (other) => other.box.x + other.box.width + 4 <= item.box.x || item.box.x + item.box.width + 4 <= other.box.x;
    let row = rows.find((r) => r.kind === item.sign.type && r.items.every(clear));
    if (!row) {
      row = { kind: item.sign.type, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  // a row of pedal keeps its steps at the heights they were drawn at, so that they stay one line;
  // in the others each sign stands at the top of its row, its height saying nothing in a band
  let y = BAND_PAD;
  for (const row of rows) {
    let height;
    if (row.kind === 'movement') {
      const top = Math.min(...row.items.map((item) => item.box.y));
      height = Math.max(...row.items.map((item) => item.box.y + item.box.height)) - top;
      for (const item of row.items) item.sg.setAttribute('transform', `translate(0, ${(y - top).toFixed(1)})`);
    } else {
      height = Math.max(...row.items.map((item) => item.box.height));
      for (const item of row.items) item.sg.setAttribute('transform', `translate(0, ${(y + (height - item.box.height) / 2 - item.box.y).toFixed(1)})`);
    }
    y += Math.max(3, height) + ROW_GAP;
  }
  const x0 = Math.min(...items.map((item) => item.box.x)) - BAND_PAD;
  const x1 = Math.max(...items.map((item) => item.box.x + item.box.width)) + BAND_PAD;
  content.setAttribute('transform', `translate(${(-x0).toFixed(1)}, 0)`);
  const w = Math.max(8, x1 - x0);
  const h = Math.max(8, y - ROW_GAP + BAND_PAD);
  card.setAttribute('width', String(w));
  card.setAttribute('height', String(h));
  return { g, inner, claim, items, w, h, x: PAD_LEFT + x0 };
});

// The bands are stacked about the trunk on the side their words leaned to, the broad gestures
// nearest it, as their words were.
{
  const placed = { [-1]: [], [1]: [] };
  const order = [...claims.keys()].sort((i, j) => (claims[j].to - claims[j].from) - (claims[i].to - claims[i].from));
  for (const index of order) {
    const pile = pileNodes[index];
    const side = claims[index].side;
    const x0 = pile.x - 3;
    const x1 = pile.x + pile.w + 3;
    let off = 10;
    const clashes = () => placed[side].some((o) => o.x0 < x1 && x0 < o.x1 && o.off < off + pile.h + 5 && off < o.off + o.h + 5);
    while (clashes()) off += 3;
    placed[side].push({ x0, x1, off, h: pile.h });
    pile.off = off;
    pile.side = side;
  }
}
const pilesAbove = Math.max(0, ...pileNodes.filter((p) => p.side === -1).map((p) => p.off + p.h));
const pilesBelow = Math.max(0, ...pileNodes.filter((p) => p.side === 1).map((p) => p.off + p.h));

/** The trunk the gestures grow from, the middle of the piles, and of the roll their notes go to. */
const midY = TOP + Math.max(tree.above, half, pilesAbove + 16);
const rowY = (track) => midY + (50.5 - track) * rowH;
const stageH = Math.ceil(midY + Math.max(tree.below, half, pilesBelow + 16) + 24);

svg.setAttribute('width', String(stageW * zoom));
svg.setAttribute('height', String(stageH * zoom));
svg.setAttribute('viewBox', `0 0 ${stageW} ${stageH}`);
stage.style.width = `${stageW * zoom}px`;
stage.style.height = `${stageH * zoom}px`;

for (const pile of pileNodes) {
  pile.y = pile.side === -1 ? midY - pile.off - pile.h : midY + pile.off;
  pile.cx = pile.x + pile.w / 2;
  pile.cy = pile.y + pile.h / 2;
}

// ---- the trunk, and the idea above it ---------------------------------------------------------

el('line', { x1: PAD_LEFT - 40, x2: X(score.end) + 40, y1: midY, y2: midY, stroke: '#9ca3af', 'stroke-width': 1 }, gTrunk);

const idea = root.querySelector('.journey-idea');
idea.innerHTML = IDEA.map((phrase) => `<span>${phrase}</span>`).join('<span class="dot" aria-hidden="true">\u00b7</span>');
idea.style.top = `${midY * zoom}px`;

// ---- the gestures ---------------------------------------------------------------------------

const claimRank = new Map(
  [...claims.keys()]
    .sort((i, j) => (claims[j].to - claims[j].from) - (claims[i].to - claims[i].from))
    .map((index, rank) => [index, claims.length > 1 ? rank / (claims.length - 1) : 0]),
);

const claimNodes = claims.map((claim, index) => {
  const g = el('g', { class: 'claim', 'data-claim': index }, gClaims);
  const inner = el('g', {}, g);
  el('path', { id: `arc-${index}`, d: claim.d, fill: 'none' }, inner);
  const text = el('text', {
    'font-size': claim.fontSize,
    fill: COLORS.word,
    'fill-opacity': claim.opacity,
    'dominant-baseline': 'middle',
  }, inner);
  const path = el('textPath', { href: `#arc-${index}` }, text);
  path.textContent = claim.word;
  const rank = claimRank.get(index);
  return {
    g,
    inner,
    claim,
    // the broad gestures first, the concrete ones after, and quicker
    start: 0.12 + 0.55 * rank,
    span: 0.32 - 0.17 * rank,
    /** Where the word folds to: into its band, near where the word set off. */
    into: {
      x: Math.min(pileNodes[index].x + pileNodes[index].w, Math.max(pileNodes[index].x, X(claim.tick) + 30)),
      y: pileNodes[index].cy,
    },
  };
});

/** Where a claim's word stands at rest, on the stage. */
const footOf = (claim) => ({ x: X(claim.tick), y: midY + claim.side * claim.offset });

// ---- the tracks -----------------------------------------------------------------------------

const expressionTracks = [...new Set(roll.symbols.filter((s) => s.kind === 'expression').map((s) => s.track))];
{
  const bass = expressionTracks.filter((t) => t < 50);
  const treble = expressionTracks.filter((t) => t > 50);
  const shade = (tracks, label) => {
    if (!tracks.length) return;
    const top = rowY(Math.max(...tracks)) - rowH / 2;
    const bottom = rowY(Math.min(...tracks)) + rowH / 2;
    el('rect', { x: PAD_LEFT - 40, y: top, width: stageW - PAD_LEFT, height: bottom - top, fill: '#f3f0fa' }, gGrid);
    const t = el('text', { x: PAD_LEFT - 46, y: (top + bottom) / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 11, fill: '#7c6f93' }, gGrid);
    t.textContent = label;
  };
  shade(treble, 'expression, treble');
  shade(bass, 'expression, bass');
  const rules = [];
  for (let track = 1; track <= 100; track++) {
    const y = rowY(track) + rowH / 2;
    rules.push(`M${PAD_LEFT - 40} ${y.toFixed(1)}H${stageW - PAD_RIGHT / 2}`);
  }
  el('path', { d: rules.join(''), stroke: '#e8eaef', 'stroke-width': 0.5 }, gGrid);
  const t = el('text', { x: PAD_LEFT - 46, y: midY, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 11, fill: '#9ca3af' }, gGrid);
  t.textContent = 'notes';
}

// ---- the performance, travelling from the score into ink and into perforation ---------------

const velocities = performance.notes.map((n) => n.velocity);
const [vMin, vMax] = [Math.min(...velocities), Math.max(...velocities)];
const inkH = (velocity) => rowH * (0.3 + 3.1 * ((velocity - vMin) / Math.max(1, vMax - vMin)) ** 0.85);
const holeH = rowH * 0.74;

const symbolColor = (symbol) => {
  if (symbol.kind === 'note') return COLORS.note;
  return /Pedal/.test(symbol.type ?? '') ? COLORS.pedal : COLORS.dynamics;
};

/** The band a note comes out of: that of the narrowest claim about the stretch it is in, or the nearest. */
const pileOf = (tick) => {
  let best = -1;
  let score = Infinity;
  claims.forEach((claim, index) => {
    const inside = claim.from <= tick && tick <= claim.to;
    const value = inside ? claim.to - claim.from : 1e9 + Math.min(Math.abs(claim.from - tick), Math.abs(claim.to - tick));
    if (value < score) {
      score = value;
      best = index;
    }
  });
  return pileNodes[best];
};

const travellers = performance.notes.flatMap((note) => {
  const symbol = note.symbol !== undefined ? roll.symbols[note.symbol] : undefined;
  const node = el('rect', { fill: COLORS.notated }, gTravel);
  return [{
    node,
    pile: pileOf(note.tick),
    fromX: X(note.tick),
    ink: { x0: XR(note.from), x1: XR(note.to), cy: rowY(note.pitch - 13), h: inkH(note.velocity) },
    symbol: symbol && symbol.since === 0 ? { x0: XR(symbol.from), x1: XR(symbol.to), cy: rowY(symbol.track), h: holeH, color: symbolColor(symbol) } : undefined,
  }];
});
const carriedByTraveller = new Set(performance.notes.flatMap((n) => {
  const symbol = n.symbol !== undefined ? roll.symbols[n.symbol] : undefined;
  return symbol && symbol.since === 0 ? [n.symbol] : [];
}));

// The pedal, as it went down on the recording roll: a line on its track while it is held.
const pedalTrack = (type) => {
  const name = type === 'soft' ? 'SoftPedalOn' : 'SustainPedalOn';
  return roll.symbols.find((s) => s.type === name)?.track ?? (type === 'soft' ? 8 : 92);
};
const pedalInk = el('path', {
  d: performance.pedals.map((p) => `M${XR(p.from).toFixed(1)} ${rowY(pedalTrack(p.type)).toFixed(1)}H${XR(p.to).toFixed(1)}`).join(''),
  stroke: COLORS.ink,
  'stroke-width': 1.6,
  'stroke-linecap': 'round',
  fill: 'none',
}, gTravel);

// ---- the versions ---------------------------------------------------------------------------

const symbolNodes = roll.symbols.map((symbol, index) => {
  const node = el('rect', { fill: symbolColor(symbol), 'data-symbol': index }, gSymbols);
  pill(node, XR(symbol.from), XR(symbol.to), rowY(symbol.track), holeH);
  return { node, symbol, color: symbolColor(symbol), carried: carriedByTraveller.has(index) };
});

// ---- the copy -------------------------------------------------------------------------------

const paperTop = rowY(100) - rowH / 2 - ((copy.width - 100 * TRACK_MM) / 2) * pxPerMm;
const paperBottom = rowY(1) + rowH / 2 + ((copy.width - 100 * TRACK_MM) / 2) * pxPerMm;
const paper = el('rect', {
  x: XR(paperFrom),
  y: paperTop,
  width: XR(paperTo) - XR(paperFrom),
  height: paperBottom - paperTop,
  fill: COLORS.paper,
}, gPaper);
{
  const shade = el('linearGradient', { id: 'paper-shade', x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
  [[0, 0.16], [0.06, 0.03], [0.5, 0], [0.94, 0.03], [1, 0.18]].forEach(([offset, alpha]) =>
    el('stop', { offset, 'stop-color': '#2a0d06', 'stop-opacity': alpha }, shade));
  el('rect', { x: XR(paperFrom), y: paperTop, width: XR(paperTo) - XR(paperFrom), height: paperBottom - paperTop, fill: 'url(#paper-shade)' }, gPaper);
}
// where the axis is broken, between the leader and the music
const breakX = XR(breakMm - 13);
const zig = (x) => {
  const points = [];
  for (let y = paperTop - 4, i = 0; y <= paperBottom + 4; y += 6, i++) points.push(`${(x + (i % 2 ? 3 : -3)).toFixed(1)} ${y.toFixed(1)}`);
  return `M${points.join('L')}`;
};
const paperBreak = el('g', {}, gPaper);
el('rect', { x: breakX - 4, y: paperTop - 6, width: 8, height: paperBottom - paperTop + 12, fill: 'var(--ground)' }, paperBreak);
el('path', { d: zig(breakX - 4) + zig(breakX + 4), stroke: '#7a3a2a', 'stroke-width': 0.8, fill: 'none' }, paperBreak);

/** A chain of perforations, as St2 has them: round holes at the perforator's pitch. */
const chain = (hole) => {
  const x0 = XR(hole.from);
  const x1 = XR(hole.to);
  const rx = (HOLE_MM / 2) * pxPerMm;
  const ry = (HOLE_MM / 2) * pxPerMm;
  const cy = rowY(hole.track);
  const pitch = HOLE_PITCH_MM * pxPerMm;
  const count = Math.max(1, Math.round((x1 - x0 - 2 * rx) / pitch) + 1);
  const step = count > 1 ? (x1 - x0 - 2 * rx) / (count - 1) : 0;
  let d = '';
  for (let i = 0; i < count; i++) {
    const cx = x0 + rx + i * step;
    d += `M${(cx - rx).toFixed(2)} ${cy.toFixed(2)}a${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(2 * rx).toFixed(2)} 0a${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(-2 * rx).toFixed(2)} 0`;
  }
  return d;
};
const holesPath = el('path', { d: copy.holes.map(chain).join(''), fill: 'var(--ground)' }, gHoles);

// What came later: tears at the edges, and the writing.
const tearNodes = copy.tears.map((tear) => {
  const top = tear.edge === 'treble';
  const x0 = XR(tear.from);
  const x1 = XR(tear.to);
  const depth = tear.depth * pxPerMm;
  const edge = top ? paperTop - 1 : paperBottom + 1;
  const sign = top ? 1 : -1;
  const node = el('path', { fill: 'var(--ground)', stroke: '#6b2f22', 'stroke-width': 0.6 }, gLater);
  return { node, x0, x1, depth, edge, sign };
});
const tearPath = ({ x0, x1, depth, edge, sign }, grow) => {
  const points = [[x0, edge]];
  const n = Math.max(2, Math.round((x1 - x0) / 3));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const jag = i % 2 ? 0.55 : 1;
    points.push([lerp(x0, x1, t), edge + sign * depth * grow * jag * Math.sin(Math.PI * Math.min(1, t * 1.6))]);
  }
  points.push([x1, edge]);
  return `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
};

// The tears are drawn as deep as they are, a few millimetres: a word beside each says where.
const gNotes = el('g', { class: 'notes', 'font-size': 11, fill: '#7a3a2a' }, gLater);
const noted = (x, y, below, word) => {
  const g = el('g', {}, gNotes);
  const y1 = below ? y + 16 : y - 16;
  el('path', { d: `M${x.toFixed(1)} ${(below ? y + 2 : y - 2).toFixed(1)}V${(below ? y1 - 9 : y1 + 3).toFixed(1)}`, stroke: '#b98c80', 'stroke-width': 0.8 }, g);
  const t = el('text', { x, y: y1 + (below ? 2 : 0), 'text-anchor': 'middle' }, g);
  t.textContent = word;
  return g;
};
const tearNotes = copy.tears.map((tear) => tear.edge === 'treble'
  ? noted(XR((tear.from + tear.to) / 2), paperTop, false, 'torn')
  : noted(XR((tear.from + tear.to) / 2), paperBottom, true, 'torn'));

const writingNodes = copy.writings.map((writing) => {
  const x0 = XR(onAxis(writing.from));
  const x1 = XR(onAxis(writing.to));
  const [ta, tb] = writing.tracks;
  const top = rowY(Math.max(ta, tb)) - rowH / 2;
  const bottom = rowY(Math.min(ta, tb)) + rowH / 2;
  const lines = writing.text.split('\n');
  const size = Math.max(12, Math.min(17, ((bottom - top) / lines.length) * 1.15));
  const g = el('g', { class: 'writing' }, gLater);
  const clip = el('clipPath', { id: `write-${writingNodesCount()}` }, defs);
  const clipRect = el('rect', { x: x0 - 4, y: top - 20, width: 0, height: bottom - top + 40 }, clip);
  g.setAttribute('clip-path', `url(#${clip.id})`);
  const text = el('text', { 'font-size': size, fill: COLORS.graphite, 'font-family': '"Caveat", cursive' }, g);
  lines.forEach((line, i) => {
    const span = el('tspan', { x: x0, y: top + size * (lines.length > 1 ? i + 0.9 : 0.75) }, text);
    span.textContent = line;
  });
  const title = el('title', {}, g);
  title.textContent = `${writing.text.replace(/\n/g, ' / ')}${writing.actor ? ` (${writing.actor})` : ''}`;
  const note = noted((x0 + x1) / 2, top < midY ? paperTop : paperBottom, !(top < midY),
    writing.purpose === 'dating' ? 'written: the date of the perforation' : 'written on the leader');
  return { g, clipRect, note, width: Math.max(x1 - x0, 60) + 40 };
});
function writingNodesCount() {
  return defs.querySelectorAll('clipPath[id^="write-"]').length;
}

// ------------------------------------------------------------------------------------------------
// One frame of the view, at `s`, a position on the slider between 0 and its last step
// ------------------------------------------------------------------------------------------------

let viewLeft = 0;
let viewWidth = 1;
/** Where an x lies in the window, for the travellers to set off one after another as read. */
const inView = (x) => clamp01((x * zoom - viewLeft) / viewWidth);

let spotlit = null;
/** Whether the view keeps the layer in the middle: while it moves, and until the reader scrolls. */
let following = true;

const draw = (s) => {
  const p = (k) => clamp01(s - k);
  const [p0, p1, p2, p3] = [p(0), p(1), p(2), p(3)];
  const p7 = p(7);
  const p8 = p(8);

  // -- the camera: on the middle of the roll, where the trunk is
  if (following) scroller.scrollTop = midY * zoom - scroller.clientHeight / 2;

  // -- the idea, and the trunk it lies on
  const ideaOut = smooth(0, 0.5, p0);
  idea.style.opacity = String(1 - ideaOut);
  idea.style.transform = `translate(-50%, ${-100 + 60 * ideaOut}%) scale(${1 - 0.15 * ideaOut})`;
  idea.style.visibility = ideaOut >= 1 ? 'hidden' : 'visible';
  opacity(gTrunk, (0.55 + 0.45 * (1 - smooth(0, 0.5, p0))) * (1 - smooth(0.2, 0.8, p1)));

  // -- the gestures: unfolding out of the trunk, then folding into their signs, as read
  const fold = (index) => {
    const c = claimNodes[index];
    if (!c) return 0;
    const order = inView(X(c.claim.tick));
    return smooth(0.3 * order, 0.3 * order + 0.6, p1);
  };
  opacity(gClaims, s < 2 ? 1 : 0);
  if (s < 2) {
    for (const [index, c] of claimNodes.entries()) {
      const grow = smooth(c.start, c.start + c.span, p0);
      const q = fold(index);
      const lit = spotlit === null || spotlit.claims.has(index);
      opacity(c.g, grow * (lit ? 1 : 0.25) * (1 - smooth(0.35, 0.95, q)));
      const foot = footOf(c.claim);
      const reach = midY + c.claim.side * c.claim.offset * (0.25 + 0.75 * grow);
      const to = c.into ?? foot;
      const x = lerp(foot.x, to.x, q);
      const y = lerp(reach, to.y, q);
      set(c.g, 'transform', `translate(${x.toFixed(1)}, ${y.toFixed(1)})`);
      set(c.inner, 'transform', `scale(${((0.55 + 0.45 * grow) * (1 - 0.6 * q)).toFixed(3)})`);
    }
  }

  // -- the bands, each coming out of its word; before that, a word pointed at shows its own
  const pilesAlpha = s <= 1 ? (spotlit ? 1 : 0) : 1;
  opacity(gPiles, s < 3 ? pilesAlpha : 0);
  if (pilesAlpha > 0 && s < 3) {
    for (const [index, pile] of pileNodes.entries()) {
      const lit = spotlit !== null && spotlit.claims.has(index);
      let alpha;
      let q = 1;
      if (s <= 1) {
        alpha = lit ? 0.85 : 0;
      } else {
        q = fold(index);
        // the notes take the band apart as they leave it
        const leaving = smooth(0.05 + 0.45 * inView(pile.x), 0.4 + 0.45 * inView(pile.x), p2);
        alpha = smooth(0.15, 0.7, q) * (1 - leaving) * (spotlit === null || s < 1.5 ? 1 : lit ? 1 : 0.2);
      }
      // it stays where it is in time, and comes down (or up) out of its word, opening as it comes
      const foot = footOf(pile.claim);
      const y = pile.y + (foot.y - pile.cy) * (1 - q);
      const k = 0.25 + 0.75 * q;
      set(pile.g, 'transform', `translate(${pile.x.toFixed(1)}, ${y.toFixed(1)})`);
      set(pile.inner, 'transform', q < 1 ? `translate(0, ${(pile.h / 2).toFixed(1)}) scale(1, ${k.toFixed(3)}) translate(0, ${(-pile.h / 2).toFixed(1)})` : '');
      opacity(pile.g, alpha);
      for (const item of pile.items) {
        for (const { stroke, sign } of item.strokes) set(stroke, 'stroke-width', (lit && s > 1 ? 2.1 : 1.4) * (sign.weight ?? 1));
      }
    }
  }

  // -- the tracks of the roll, while it is a text
  opacity(gGrid, smooth(0.3, 1, p3) * (1 - smooth(0, 0.6, p7)));

  // -- the notes: out of the signs where the score has them, into the performance, into R1
  const travelling = s > 2 && s < 4;
  opacity(gTravel, travelling ? 1 : 0);
  if (travelling) {
    for (const t of travellers) {
      let shape;
      let fill;
      let alpha = 1;
      if (s < 3) {
        // each note leaves its gesture's band where it stands in time, as read, and becomes what was played
        const start = 0.05 + 0.45 * inView(t.fromX);
        const way = smooth(start, start + 0.45, p2);
        const from = { x0: t.fromX, x1: t.fromX, cy: t.pile.cy, h: 2.5 };
        shape = {
          x0: lerp(from.x0, t.ink.x0, way),
          x1: lerp(from.x1, t.ink.x1, way),
          cy: lerp(from.cy, t.ink.cy, way),
          h: lerp(from.h, t.ink.h, way),
        };
        fill = mix(COLORS.notated, COLORS.ink, smooth(0.2, 0.9, way));
        alpha = smooth(0, 0.12, way);
      } else {
        const order = inView(t.ink.x0);
        const way = smooth(0.25 * order, 0.25 * order + 0.65, p3);
        if (t.symbol) {
          shape = {
            x0: lerp(t.ink.x0, t.symbol.x0, way),
            x1: lerp(t.ink.x1, t.symbol.x1, way),
            cy: lerp(t.ink.cy, t.symbol.cy, way),
            h: lerp(t.ink.h, t.symbol.h, way),
          };
          fill = mix(COLORS.ink, t.symbol.color, way);
        } else {
          shape = t.ink;
          fill = COLORS.ink;
          alpha = 1 - way;
        }
      }
      pill(t.node, shape.x0, shape.x1, shape.cy, shape.h);
      set(t.node, 'fill', fill);
      opacity(t.node, alpha * (s < 3 ? 1 : 0.85 + 0.15 * smooth(0, 1, p3)));
    }
    opacity(pedalInk, s < 3 ? 0.75 * smooth(0.6, 1, p2) : 0.75 * (1 - smooth(0, 0.5, p3)));
  }

  // -- the versions: R1 at 4, R4 at 7
  const symbolsAlpha = s <= 3 ? 0 : 1 - smooth(0.35, 0.9, p7);
  opacity(gSymbols, symbolsAlpha);
  if (symbolsAlpha > 0) {
    const u = Math.min(3, Math.max(0, s - 4));
    const leaving = smooth(0, 0.35, p7);
    for (const n of symbolNodes) {
      const { symbol } = n;
      let alpha;
      let color = n.color;
      if (s < 4) {
        alpha = symbol.since > 0 ? 0 : n.carried ? 0 : smooth(0.35, 1, p3);
      } else {
        // there from its version on; while it comes, and while its version is shown, green
        const coming = symbol.since === 0 ? 1 : smooth(symbol.since - 1, symbol.since, u);
        const fresh = symbol.since === 0 ? 0 : coming * (1 - smooth(symbol.since, symbol.since + 1, u)) * (1 - leaving);
        alpha = coming;
        if (fresh > 0) color = mix(n.color, COLORS.added, fresh);
        // gone from its version on: red while that version is shown, then nothing
        if (symbol.until !== undefined) {
          const going = smooth(symbol.until - 1, symbol.until, u);
          if (going > 0) {
            color = mix(n.color, COLORS.removed, going);
            alpha = coming * (1 - 0.45 * going) * (1 - smooth(symbol.until, symbol.until + 0.6, u)) * (1 - leaving);
          }
        }
      }
      // onto the paper: each to the place of its hole
      if (p7 > 0 && symbol.hole !== undefined) {
        const hole = copy.holes[symbol.hole];
        const way = smooth(0, 0.7, p7);
        pill(n.node, lerp(XR(symbol.from), XR(hole.from), way), lerp(XR(symbol.to), XR(hole.to), way), lerp(rowY(symbol.track), rowY(hole.track), way), holeH);
      } else if (n.moved) {
        pill(n.node, XR(symbol.from), XR(symbol.to), rowY(symbol.track), holeH);
      }
      n.moved = p7 > 0;
      set(n.node, 'fill', color);
      // what a version changes stands out by a halo, in its colour, while that version is shown
      const halo = s < 4 ? 0 : Math.max(
        symbol.since > 0 ? smooth(symbol.since - 1, symbol.since, u) * (1 - smooth(symbol.since, symbol.since + 1, u)) : 0,
        symbol.until !== undefined ? smooth(symbol.until - 1, symbol.until, u) * (1 - smooth(symbol.until, symbol.until + 0.6, u)) : 0,
      ) * (1 - leaving);
      if (halo > 0.01) {
        set(n.node, 'stroke', color);
        set(n.node, 'stroke-width', 5 * halo);
        set(n.node, 'stroke-opacity', 0.3);
        n.halo = true;
      } else if (n.halo) {
        n.node.removeAttribute('stroke');
        n.node.removeAttribute('stroke-width');
        n.node.removeAttribute('stroke-opacity');
        n.halo = false;
      }
      opacity(n.node, alpha);
    }
  }

  // -- the paper
  const paperAlpha = smooth(0, 0.6, p7);
  opacity(gPaper, paperAlpha);
  set(paper, 'fill', mix(COLORS.paper, COLORS.paperAged, p8));
  opacity(gHoles, smooth(0.3, 0.9, p7));

  // -- what the paper went through
  opacity(gLater, p8 > 0 ? 1 : 0);
  if (p8 > 0) {
    tearNodes.forEach((tear, i) => set(tear.node, 'd', tearPath(tear, smooth(0.1 * (i % 4), 0.6 + 0.1 * (i % 4), p8))));
    writingNodes.forEach((w, i) => {
      const written = smooth(0.25 + 0.2 * i, 0.85 + 0.15 * i, p8);
      set(w.clipRect, 'width', w.width * written);
      opacity(w.note, smooth(0.6, 1, written));
    });
    tearNotes.forEach((note) => opacity(note, smooth(0.5, 1, p8)));
  }
};

// ------------------------------------------------------------------------------------------------
// The slider, and the view following it frame by frame
// ------------------------------------------------------------------------------------------------

const slider = root.querySelector('.journey-slider input');
const marks = root.querySelector('.journey-marks');
const caption = root.querySelector('.journey-caption');
slider.max = String(STEPS.length - 1);

STEPS.forEach((step, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = step.title;
  button.dataset.step = String(index);
  button.addEventListener('click', () => go(index));
  marks.appendChild(button);
});

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

let target = 0;
let shown = 0;
let frame = 0;
let last;

const label = (index) => {
  slider.value = String(index);
  slider.setAttribute('aria-valuetext', STEPS[index].title);
  for (const button of marks.children) button.classList.toggle('current', Number(button.dataset.step) === index);
  caption.textContent = STEPS[index].caption;
  root.dataset.step = STEPS[index].key;
};

const advance = (now) => {
  const elapsed = last === undefined ? 0 : now - last;
  last = now;
  const up = target > shown;
  const from = up ? Math.floor(shown) : Math.ceil(shown) - 1;
  const way = elapsed / STEP_DURATION[Math.min(STEP_DURATION.length - 1, Math.max(0, from))];
  shown = up ? Math.min(target, shown + way) : Math.max(target, shown - way);
  draw(shown);
  if (shown !== target) frame = requestAnimationFrame(advance);
  else {
    last = undefined;
    following = false;
  }
};

function go(index) {
  target = Math.min(STEPS.length - 1, Math.max(0, index));
  following = true;
  label(target);
  cancelAnimationFrame(frame);
  if (reduced.matches) {
    shown = target;
    draw(shown);
    following = false;
    return;
  }
  last = undefined;
  frame = requestAnimationFrame(advance);
}

slider.addEventListener('input', () => go(Number(slider.value)));

// ------------------------------------------------------------------------------------------------
// Moving along the piece: the scrollbar, a drag, and the overview
// ------------------------------------------------------------------------------------------------

const overview = root.querySelector('.journey-overview');
const windowMark = overview.querySelector('.window');

const onScroll = () => {
  viewLeft = scroller.scrollLeft;
  viewWidth = scroller.clientWidth;
  idea.style.left = `${viewLeft + viewWidth / 2}px`;
  windowMark.style.left = `${(100 * viewLeft) / (stageW * zoom)}%`;
  windowMark.style.width = `${(100 * viewWidth) / (stageW * zoom)}%`;
  if (shown === target && shown > 2 && shown < 4) draw(shown);
};
scroller.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => {
  following = true;
  draw(shown);
  following = shown !== target;
  onScroll();
});

const moveTo = (event) => {
  const box = overview.getBoundingClientRect();
  const at = clamp01((event.clientX - box.left) / box.width);
  scroller.scrollLeft = at * stageW * zoom - scroller.clientWidth / 2;
};
overview.addEventListener('pointerdown', (event) => {
  overview.setPointerCapture(event.pointerId);
  moveTo(event);
  const move = (e) => moveTo(e);
  const up = () => {
    overview.removeEventListener('pointermove', move);
    overview.removeEventListener('pointerup', up);
  };
  overview.addEventListener('pointermove', move);
  overview.addEventListener('pointerup', up);
});

// a drag with the mouse along the stage
{
  let dragging = null;
  scroller.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target.closest('.claim, .sign, [data-symbol]')) return;
    dragging = { x: event.clientX, left: scroller.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragging.x;
    if (Math.abs(dx) > 3) dragging.moved = true;
    if (dragging.moved) {
      scroller.scrollLeft = dragging.left - dx;
      scroller.classList.add('dragging');
    }
  });
  window.addEventListener('pointerup', () => {
    dragging = null;
    scroller.classList.remove('dragging');
  });
}

// ------------------------------------------------------------------------------------------------
// Pointing at things: a word lights its signs, a sign shows its encoding, a revision its reason
// ------------------------------------------------------------------------------------------------

const card = root.querySelector('.journey-card');
const showCard = (event, html) => {
  card.innerHTML = html;
  card.hidden = false;
  const pad = 14;
  const box = card.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - pad;
  if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - pad;
  card.style.left = `${Math.max(8, x)}px`;
  card.style.top = `${Math.max(8, y)}px`;
};
const hideCard = () => {
  card.hidden = true;
};
const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const light = (claimIndices) => {
  spotlit = claimIndices ? { claims: new Set(claimIndices) } : null;
  draw(shown);
};

gClaims.addEventListener('pointerover', (event) => {
  const g = event.target.closest('.claim');
  if (!g) return;
  light([Number(g.dataset.claim)]);
});
gClaims.addEventListener('pointerout', (event) => {
  if (event.target.closest('.claim') && !event.relatedTarget?.closest?.('.claim')) light(null);
});
gClaims.addEventListener('click', (event) => {
  const g = event.target.closest('.claim');
  if (g) window.open(SEGMENT_URL(claims[Number(g.dataset.claim)].id), '_blank', 'noopener');
});

gPiles.addEventListener('pointerover', (event) => {
  const g = event.target.closest('.sign');
  if (!g) return;
  const sign = signs[Number(g.dataset.sign)];
  light(sign.segments);
  const words = sign.segments.map((c) => `<div class="word">${escape(claims[c].word)}</div>`).join('');
  showCard(event, `${words}<pre>${escape(sign.encoding)}</pre>`);
});
gPiles.addEventListener('pointermove', (event) => {
  if (!card.hidden && event.target.closest('.sign')) showCard(event, card.innerHTML);
});
gPiles.addEventListener('pointerout', (event) => {
  if (event.target.closest('.sign') && !event.relatedTarget?.closest?.('.sign')) {
    light(null);
    hideCard();
  }
});

gSymbols.addEventListener('pointerover', (event) => {
  const node = event.target.closest('[data-symbol]');
  if (!node) return;
  const symbol = roll.symbols[Number(node.dataset.symbol)];
  const at = Math.round(Math.min(3, Math.max(0, shown - 4)));
  const parts = [];
  if (symbol.since > 0 && symbol.since === at) parts.push(`<div class="word added">Added in ${roll.versions[symbol.since]}</div><div>${escape(symbol.brought ?? '')}</div>`);
  if (symbol.until !== undefined && symbol.until === at) parts.push(`<div class="word removed">Taken out in ${roll.versions[symbol.until]}</div><div>${escape(symbol.dropped ?? '')}</div>`);
  if (!parts.length) return;
  showCard(event, parts.join(''));
});
gSymbols.addEventListener('pointerout', (event) => {
  if (event.target.closest('[data-symbol]')) hideCard();
});

// ------------------------------------------------------------------------------------------------

label(0);
// where the room before the music is wider than a phone can spare, the view opens on the music
if (zoom < 1) scroller.scrollLeft = (PAD_LEFT - 50) * zoom;
onScroll();
draw(0);
following = false;
root.classList.add('ready');
