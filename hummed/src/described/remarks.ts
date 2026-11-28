// The remarks: what a reader said of the playing in their own words, each about a place in the
// score, with the calls of the reconstruction that came of it. In the list of a work file's steps a
// remark is itself a step, MPM Desk's `Describe`, which changes nothing and names its calls.
import type { Ticks } from '../shared/units.ts';
import type { Topic } from './context.ts';

/** What a remark is about: the whole piece, a passage, some notes, or a direction from a note to another. */
export type AboutKind = 'piece' | 'span' | 'notes' | 'box' | 'arrow';

export interface About {
  readonly kind: AboutKind;
  /** The stretch of the score, `to` exclusive. */
  readonly from: Ticks;
  readonly to: Ticks;
  /** The notes it names: those of a set, the two ends of an arrow; none for a passage. */
  readonly notes: readonly string[];
}

export interface Remark {
  readonly id: string;
  readonly text: string;
  readonly about: About;
  /** Who turned the words into calls, and when; null where the calls were made by hand. */
  readonly model: string | null;
  readonly date: string | null;
  /** The ids of the calls that came of it. */
  readonly calls: readonly string[];
}

/** A remark as a work file holds it. */
export interface DescribeStep {
  readonly id: string;
  readonly name: 'Describe';
  readonly options: {
    readonly text: string;
    readonly about: About;
    readonly model: string | null;
    readonly date: string | null;
    readonly steps: readonly { readonly name: string; readonly options: unknown }[];
    readonly calls: readonly string[];
  };
}

type Json = Readonly<Record<string, unknown>>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const strings = (x: unknown): string[] =>
  Array.isArray(x)
    ? (x as readonly unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
const KINDS: readonly string[] = ['piece', 'span', 'notes', 'box', 'arrow'] satisfies readonly AboutKind[];

/**
 * The remarks of a work file (or of a file that holds only remarks, as ../described/remarks.json
 * does): its `Describe` steps, in the order they stand in. One that says nothing, or of no place,
 * is left out.
 */
export function readRemarks(work: unknown): Remark[] {
  const steps = isObject(work) && Array.isArray(work['provenance']) ? (work['provenance'] as unknown[]) : [];
  return steps.flatMap((step): Remark[] => {
    if (!isObject(step) || step['name'] !== 'Describe' || typeof step['id'] !== 'string') return [];
    const options = step['options'];
    if (!isObject(options) || typeof options['text'] !== 'string' || !options['text'].trim()) return [];
    const about = options['about'];
    if (!isObject(about)) return [];
    const { kind, from, to } = about;
    if (typeof kind !== 'string' || !KINDS.includes(kind)) return [];
    if (typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to))
      return [];
    return [
      {
        id: step['id'],
        text: options['text'],
        about: { kind: kind as AboutKind, from, to, notes: strings(about['notes']) },
        model: typeof options['model'] === 'string' ? options['model'] : null,
        date: typeof options['date'] === 'string' ? options['date'] : null,
        calls: strings(options['calls']),
      },
    ];
  });
}

/** A call of a work file, as far as a remark needs it. */
export interface CallRead {
  readonly name: string;
  /** The xml:ids of what it wrote into the MPM. */
  readonly elements: readonly string[];
  /** The notes it names, where it is about single notes (an articulation). */
  readonly notes: readonly string[];
}

/** The calls of a work file, by their ids. */
export function callsOf(work: unknown): Map<string, CallRead> {
  const steps = isObject(work) && Array.isArray(work['provenance']) ? (work['provenance'] as unknown[]) : [];
  const calls = new Map<string, CallRead>();
  for (const step of steps) {
    if (!isObject(step) || typeof step['id'] !== 'string' || typeof step['name'] !== 'string') continue;
    const options = isObject(step['options']) ? step['options'] : {};
    calls.set(step['id'], {
      name: step['name'],
      elements: strings(step['elements']),
      notes: strings(options['noteIDs']),
    });
  }
  return calls;
}

/** The name of every element of an MPM that has an xml:id, by that id. */
export function elementNames(mpm: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const [, name, attributes] of mpm.matchAll(/<([A-Za-z][\w.-]*)\b([^>]*)>/g)) {
    const id = /\sxml:id="([^"]*)"/.exec(attributes)?.[1];
    if (id !== undefined) names.set(id, name);
  }
  return names;
}

/**
 * What an instruction of the MPM is of, by its element's name, in the terms the context is chosen
 * by (context.ts). These are also the elements espressivo can bring out: each governs a dimension
 * of the performance.
 */
const TOPICS: Readonly<Record<string, Topic>> = {
  tempo: 'tempo',
  rubato: 'rubato',
  dynamics: 'dynamics',
  ornament: 'roll',
  articulation: 'touch',
  accentuationPattern: 'accent',
  movement: 'pedal',
};

/** What a remark wrote into the MPM. */
export interface Written {
  /** The xml:ids of the instructions it wrote that the MPM has, each once. */
  readonly ids: readonly string[];
  /** What they are of. */
  readonly topics: ReadonlySet<Topic>;
  /** The notes whose touch it is about, where its calls name them. */
  readonly touched: readonly string[];
}

/**
 * What a remark wrote: the elements of its calls, as far as the MPM has them and they are
 * instructions (a definition in the header governs nothing by itself).
 */
export function writtenBy(
  remark: Remark,
  calls: ReadonlyMap<string, CallRead>,
  names: ReadonlyMap<string, string>,
): Written {
  const own = remark.calls.flatMap((id) => calls.get(id) ?? []);
  const ids = [...new Set(own.flatMap((call) => call.elements))].filter(
    (id) => (names.get(id) ?? '') in TOPICS,
  );
  return {
    ids,
    topics: new Set(ids.map((id) => TOPICS[names.get(id) ?? ''])),
    touched: [
      ...new Set(own.filter((call) => call.name === 'InsertArticulation').flatMap((call) => call.notes)),
    ],
  };
}

/** Whether a remark is about a stretch of the score rather than a set of notes it names. */
export const passes = (about: About): boolean => about.kind === 'span' || about.kind === 'arrow';

/** The notes a remark is about: those it names, or those that begin in its stretch; none for the piece. */
export function notesOf<N extends { readonly id: string; readonly date: Ticks }>(
  about: About,
  notes: readonly N[],
): N[] {
  if (about.kind === 'piece') return [];
  if (passes(about)) return notes.filter((note) => note.date >= about.from && note.date < about.to);
  const named = new Set(about.notes);
  return notes.filter((note) => named.has(note.id));
}
