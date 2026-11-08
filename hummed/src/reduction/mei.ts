// The reduction is written in MEI (reduction/reduction.mei): one staff, one layer. Read here into
// score positions: in the browser from a DOMParser document, in Node from @xmldom/xmldom's.
import type { Ticks } from '../shared/units.ts';
import type { AirPassage, Bar, Reduction, ReductionEvent } from './types.ts';

/** The part of the DOM this reader needs, so that both the browser's and xmldom's documents fit. */
export interface XmlNode {
  readonly nodeType: number;
}
export interface XmlElement extends XmlNode {
  readonly localName: string | null;
  readonly childNodes: ArrayLike<XmlNode>;
  getAttribute(name: string): string | null;
}

const ELEMENT_NODE = 1;
const QUARTER: Ticks = 720;
const DURATIONS: ReadonlyMap<string, Ticks> = new Map([
  ['1', 2880],
  ['2', 1440],
  ['4', 720],
  ['8', 360],
  ['16', 180],
  ['32', 90],
]);
const PITCH_CLASSES: ReadonlyMap<string, number> = new Map([
  ['c', 0],
  ['d', 2],
  ['e', 4],
  ['f', 5],
  ['g', 7],
  ['a', 9],
  ['b', 11],
]);
const ACCIDENTALS: ReadonlyMap<string, number> = new Map([
  ['s', 1],
  ['f', -1],
  ['ss', 2],
  ['ff', -2],
  ['n', 0],
]);
const FLATS = ['b', 'e', 'a', 'd', 'g', 'c', 'f'] as const;
const SHARPS = ['f', 'c', 'g', 'd', 'a', 'e', 'b'] as const;
/** Elements that only group the events of a layer and do not change their time. */
const TRANSPARENT = new Set(['beam']);

export class ReductionError extends Error {
  override name = 'ReductionError';
}

const isElement = (node: XmlNode): node is XmlElement => node.nodeType === ELEMENT_NODE;

function* children(el: XmlElement): Generator<XmlElement, void, undefined> {
  for (const node of Array.from(el.childNodes)) if (isElement(node)) yield node;
}

function* descendants(el: XmlElement, name: string): Generator<XmlElement, void, undefined> {
  for (const child of children(el)) {
    if (child.localName === name) yield child;
    yield* descendants(child, name);
  }
}

function first<T>(items: Iterable<T>): T | undefined {
  for (const item of items) return item;
  return undefined;
}

function attr(el: XmlElement, name: string): string {
  const value = el.getAttribute(name);
  if (value === null) throw new ReductionError(`<${el.localName ?? '?'}> without @${name}`);
  return value;
}

/** A note's or rest's length; @dots adds half, then a quarter, … of it. */
function duration(el: XmlElement): Ticks {
  const dur = attr(el, 'dur');
  const base = DURATIONS.get(dur);
  if (base === undefined) throw new ReductionError(`unsupported @dur="${dur}"`);
  const dots = Number(el.getAttribute('dots') ?? '0');
  let total = base;
  for (let i = 0; i < dots; i++) total += base >> (i + 1);
  return total;
}

/** The pitch classes the key signature alters, and by how much (keysig="1f": b flat). */
function keySignature(score: XmlElement): ReadonlyMap<string, number> {
  const sig = first(descendants(score, 'scoreDef'))?.getAttribute('keysig') ?? '0';
  const match = /^(\d)([fs])$/.exec(sig);
  if (!match) return new Map();
  const [, count, kind] = match;
  const order = kind === 'f' ? FLATS : SHARPS;
  return new Map(order.slice(0, Number(count)).map((p) => [p, kind === 'f' ? -1 : 1]));
}

function midiPitch(note: XmlElement, key: ReadonlyMap<string, number>): number {
  const pname = attr(note, 'pname');
  const pc = PITCH_CLASSES.get(pname);
  if (pc === undefined) throw new ReductionError(`unknown @pname="${pname}"`);
  const accid = note.getAttribute('accid') ?? note.getAttribute('accid.ges');
  const alter = accid === null ? (key.get(pname) ?? 0) : (ACCIDENTALS.get(accid) ?? 0);
  return 12 * (Number(attr(note, 'oct')) + 1) + pc + alter;
}

/** The events of a layer in order, looking through elements that only group them. */
function* layerEvents(layer: XmlElement): Generator<XmlElement> {
  for (const child of children(layer)) {
    const name = child.localName ?? '';
    if (TRANSPARENT.has(name)) yield* layerEvents(child);
    else if (name === 'note' || name === 'rest' || name === 'mRest' || name === 'space') yield child;
    else if (name === 'chord' || name === 'tuplet')
      throw new ReductionError(`<${name}> is not supported: the voice sings one note at a time`);
  }
}

const airPassage = (type: string): AirPassage => {
  const through = type.split('-')[1];
  if (through === 'teeth' || through === 'lips') return through;
  throw new ReductionError(`unknown air @type="${type}"`);
};

/**
 * Read the reduction. The upbeat (the bar labelled 0) is a quarter long whatever its notes;
 * a tie continues a note or an air stream; a rest that is no breath extends a rest before it.
 */
export function readReduction(root: XmlElement): Reduction {
  const score = first(descendants(root, 'score'));
  if (!score) throw new ReductionError('no <score>');
  const key = keySignature(score);
  const events: ReductionEvent[] = [];
  const bars: Bar[] = [];
  let pos: Ticks = 0;
  const extendLast = (kind: ReductionEvent['kind'], end: Ticks): boolean => {
    const last = events.at(-1);
    if (last?.kind !== kind) return false;
    events[events.length - 1] = { ...last, end };
    return true;
  };

  for (const measure of descendants(score, 'measure')) {
    const label = measure.getAttribute('label') ?? measure.getAttribute('n') ?? '';
    if (label !== '0') bars.push({ label, tick: pos });
    const staff = [...children(measure)].find((el) => el.localName === 'staff');
    const layer = staff && [...children(staff)].find((el) => el.localName === 'layer');
    if (!layer) throw new ReductionError(`bar ${label} has no layer`);

    for (const el of layerEvents(layer)) {
      const name = el.localName;
      const length = name === 'mRest' ? 4 * QUARTER : duration(el);
      const end = pos + length;
      const type = el.getAttribute('type') ?? '';
      const tie = el.getAttribute('tie');
      const continues = tie === 'm' || tie === 't';

      if (name === 'rest' || name === 'mRest' || name === 'space') {
        const breath = type === 'breath';
        if (breath || !extendLast('rest', end)) events.push({ kind: 'rest', start: pos, end, breath });
      } else if (type.startsWith('air')) {
        if (!(continues && extendLast('air', end)))
          events.push({ kind: 'air', start: pos, end, through: airPassage(type) });
      } else if (continues) {
        if (!extendLast('note', end)) throw new ReductionError(`a tie in bar ${label} continues no note`);
      } else {
        const corresp = attr(el, 'corresp');
        const ref = corresp.slice(corresp.indexOf('#') + 1);
        events.push({
          kind: 'note',
          id: attr(el, 'xml:id'),
          ref,
          pitch: midiPitch(el, key),
          start: pos,
          end,
          pedal: type === 'pedal',
        });
      }
      pos = end;
    }
    if (label === '0') pos = QUARTER;
  }
  return { events, bars };
}
