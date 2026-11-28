// The reconstruction's hand-made segments, carried over as remarks. Until November 2026 the work
// file grouped its calls into segments, each with a note in the editor's words; the segments were
// then replayed through the prototype of the remarks, which gave each a place in the score. A
// remark made of one keeps the segment's id and its note, takes the place it was given, and names
// the calls of today's work file that were the segment's (tools/remarks.ts writes them out).
import type { About, AboutKind, DescribeStep } from './remarks.ts';

/** A call of a work file, as far as the carrying over reads it. */
export interface CarriedCall {
  readonly id: string;
  readonly name: string;
  readonly options?: { readonly pedal?: unknown };
  /** The segment it belonged to, in the work file that still had segments. */
  readonly segment?: string;
}

export interface Segment {
  readonly id: string;
  readonly note: string;
}

/** The place a segment was given when it was replayed. */
export interface Placed {
  readonly id: string;
  readonly scope: {
    readonly kind: string;
    readonly ids: readonly string[];
    readonly from: number;
    readonly to: number;
  };
}

export class CarryError extends Error {
  override name = 'CarryError';
}

const KINDS: readonly string[] = ['span', 'arrow', 'notes'] satisfies readonly AboutKind[];

/**
 * The segments as remarks, in the order they were placed in. A call of then is the call of today
 * with its id. A press of a pedal was two calls then, down and up, and is one today: a call of
 * then that is gone, if it was an `InsertPedal`, is today's call of the same press. Anything else
 * that cannot be found, and a segment left with no call or no place, is an error: nothing is
 * carried over by guessing.
 */
export function carryOver(
  then: { readonly segments: readonly Segment[]; readonly provenance: readonly CarriedCall[] },
  today: { readonly provenance: readonly CarriedCall[] },
  placed: readonly Placed[],
): DescribeStep[] {
  const order = new Map(today.provenance.map((call, index) => [call.id, index]));
  const presses = new Map<unknown, string[]>();
  for (const call of today.provenance) {
    if (call.name !== 'InsertPedal' || call.options?.pedal === undefined) continue;
    presses.set(call.options.pedal, [...(presses.get(call.options.pedal) ?? []), call.id]);
  }
  /** Today's call for a call of then. */
  const callToday = (call: CarriedCall): string => {
    if (order.has(call.id)) return call.id;
    const press = call.name === 'InsertPedal' ? (presses.get(call.options?.pedal) ?? []) : [];
    if (press.length !== 1)
      throw new CarryError(
        `the call ${call.id} (${call.name}) of segment ${call.segment ?? '?'} is not in today's work file` +
          (call.name === 'InsertPedal'
            ? `, and ${press.length} calls there are of its press ${String(call.options?.pedal)}`
            : ''),
      );
    return press[0];
  };

  const notes = new Map(then.segments.map((segment) => [segment.id, segment.note]));
  for (const call of then.provenance)
    if (call.segment !== undefined && !notes.has(call.segment))
      throw new CarryError(`the call ${call.id} is of a segment that is not there, ${call.segment}`);
  const places = new Set(placed.map((place) => place.id));
  for (const segment of then.segments)
    if (!places.has(segment.id)) throw new CarryError(`the segment ${segment.id} was given no place`);

  return placed.map(({ id, scope }): DescribeStep => {
    const text = notes.get(id);
    if (text === undefined) throw new CarryError(`a place is given for ${id}, which is no segment`);
    if (!KINDS.includes(scope.kind)) throw new CarryError(`the segment ${id} is placed as "${scope.kind}"`);
    const calls = [...new Set(then.provenance.filter((call) => call.segment === id).map(callToday))].sort(
      (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
    );
    if (calls.length === 0) throw new CarryError(`the segment ${id} ("${text}") has no calls`);
    const about: About = {
      kind: scope.kind as AboutKind,
      from: scope.from,
      to: scope.to,
      // a passage is its stretch: the notes in it need no naming
      notes: scope.kind === 'span' ? [] : [...scope.ids],
    };
    return { id, name: 'Describe', options: { text, about, model: null, date: null, steps: [], calls } };
  });
}
