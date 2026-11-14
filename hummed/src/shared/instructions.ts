// What the reconstruction says at a moment of the piece: the calls of /mpm/work.json that hold
// there, each one fitted curve, frame, pattern or press, named by what it wrote into the MPM, and
// addressed as MPM Desk addresses it (https://welte225.org/mpm/<id>, which opens its viewer at
// that call).
import type { Seconds, Ticks } from './units.ts';

/** The dimensions of the performance the calls speak of, in the order the page lists them. */
export const INSTRUCTION_KINDS = [
  ['tempo', 'Tempo'],
  ['rubato', 'Rubato'],
  ['dynamics', 'Dynamics'],
  ['accentuation', 'Accents'],
  ['articulation', 'Articulation'],
  ['spread', 'Arpeggio'],
  ['pedal', 'Pedal'],
] as const;

export type InstructionKind = (typeof INSTRUCTION_KINDS)[number][0];

/**
 * What the instructions are of: the piece, or the harmonic reductions, which take of the MPM its
 * tempo and dynamics and, chord by chord, its arpeggios, and none of its rubato, accents,
 * articulation or pedalling (worker/reductions.ts).
 */
export type Performed = 'piece' | 'reductions';
const OF_THE_REDUCTIONS: ReadonlySet<InstructionKind> = new Set(['tempo', 'dynamics', 'spread']);

/** Whether the calls of a dimension apply to what is performed. */
export const appliesTo = (kind: InstructionKind, performed: Performed): boolean =>
  performed === 'piece' || OF_THE_REDUCTIONS.has(kind);

/** One call of the reconstruction that holds over a stretch of the score. */
export interface Instruction {
  /** The call's id: `https://welte225.org/mpm/<id>` names it. */
  readonly id: string;
  readonly kind: InstructionKind;
  /** What it says, in a few words. */
  readonly label: string;
  /** Where in the score it holds: from, and up to (the same place for a single moment). */
  readonly from: Ticks;
  readonly to: Ticks;
  /**
   * Where the next call of its kind takes over, for a call of which one holds at a time: it is
   * listed no further, however short the while it holds.
   */
  readonly until?: Ticks;
}

/** An instruction in a rendering's time. */
export interface TimedInstruction extends Instruction {
  readonly start: Seconds;
  readonly end: Seconds;
}

/** An attribute of an MPM element, by its name; null where it has none. */
export type MpmAttributes = (name: string) => string | null;

type Json = Readonly<Record<string, unknown>>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const number = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const string = (x: unknown): string | null => (typeof x === 'string' ? x : null);

/** A number as the page shows it: whole where it is large, a decimal where that says something. */
const short = (x: number, digits = 0): string => {
  const rounded = x.toFixed(digits);
  return (digits > 0 ? rounded.replace(/\.?0+$/, '') : rounded).replace('-', '−');
};
const signed = (x: number): string => (x > 0 ? `+${short(x)}` : short(x));
const attribute = (attributes: MpmAttributes | undefined, name: string): number | null => {
  const value = attributes?.(name);
  return value === null || value === undefined || value === '' ? null : number(Number(value));
};
/** A name someone gave, not one a program made up (a UUID, `pattern-034da7c8`). */
const given = (name: string | null | undefined): string | null =>
  name && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(name) && !/^pattern-[0-9a-f]{8}$/.test(name) ? name : null;

/** From a value to the one it moves to, or the value alone where it stays. */
const transition = (from: number | null, to: number | null, digits = 0): string =>
  from === null
    ? ''
    : to === null || short(to, digits) === short(from, digits)
      ? short(from, digits)
      : `${short(from, digits)} → ${short(to, digits)}`;

const PEDALS: Readonly<Record<string, string>> = { sustain: 'Sustain', soft: 'Soft' };

/**
 * The calls of which one holds at a time: each writes into a map of the MPM in which an instruction
 * holds until the next begins (the tempo, the dynamics curves, the rubatos, the accentuation
 * patterns), so a call holds until the next of its name begins, wherever the work file says it ends.
 */
const ONE_AT_A_TIME: ReadonlySet<string> = new Set([
  'InsertTempo',
  'InsertDynamicsInstructions',
  'InsertRubato',
  'InsertMetricalAccentuation',
]);

/** What a call is of, and what it says; null for calls that are not about a place in the score. */
function describe(
  name: string,
  options: Json,
  elements: readonly (MpmAttributes | undefined)[],
): { readonly kind: InstructionKind; readonly label: string } | null {
  const first = elements[0];
  switch (name) {
    case 'InsertTempo': {
      const text = transition(number(options['bpm']), number(options['transitionTo']));
      return { kind: 'tempo', label: text ? `${text} bpm` : 'Tempo' };
    }
    case 'InsertRubato': {
      const intensity = attribute(first, 'intensity');
      return { kind: 'rubato', label: intensity === null ? 'Rubato' : `Rubato ${short(intensity, 2)}` };
    }
    case 'InsertDynamicsInstructions': {
      // the curve it fitted: from its first instruction's volume to where its last one arrives
      const last = elements.at(-1);
      const text = transition(
        attribute(first, 'volume'),
        attribute(last, 'transition.to') ?? attribute(last, 'volume'),
      );
      return { kind: 'dynamics', label: text || 'Dynamics' };
    }
    case 'Modify': {
      const change = number(options['change']);
      const aspect = string(options['aspect']) ?? 'value';
      const what = aspect.charAt(0).toUpperCase() + aspect.slice(1);
      return {
        kind: aspect === 'velocity' ? 'dynamics' : 'articulation',
        label: change === null ? what : `${what} ${signed(change)}`,
      };
    }
    case 'InsertMetricalAccentuation': {
      const scale = attribute(first, 'scale');
      const pattern = given(first?.('name.ref'));
      const parts = [pattern ?? 'Pattern', scale === null ? '' : `× ${short(scale, 1)}`];
      return { kind: 'accentuation', label: parts.filter(Boolean).join(' ') };
    }
    case 'InsertArticulation': {
      const notes = Array.isArray(options['noteIDs']) ? options['noteIDs'].length : elements.length;
      const style = given(first?.('name.ref'));
      const count = notes === 1 ? '1 note' : `${notes} notes`;
      return { kind: 'articulation', label: style ? `${style}, ${count}` : count };
    }
    case 'InsertTemporalSpread': {
      const placement: Readonly<Record<string, string>> = {
        'before-beat': 'before the beat',
        'on-beat': 'on the beat',
      };
      const where = placement[string(options['placement']) ?? ''];
      return { kind: 'spread', label: where ? `Spread ${where}` : 'Spread' };
    }
    case 'InsertPedal': {
      const pedal = PEDALS[(string(options['pedal']) ?? '').split('-')[0] ?? ''] ?? 'Pedal';
      const direction = string(options['direction']);
      const depth = number(options['depth']);
      const how = direction === 'down' && depth !== null && depth < 1 ? ` to ${short(depth, 2)}` : '';
      return { kind: 'pedal', label: `${pedal} ${direction ?? 'moves'}${how}` };
    }
    default:
      // choices, mappings and stylizations of the whole: they hold everywhere, or nowhere in particular
      return null;
  }
}

/**
 * The calls of a work file (as MPM Desk saves it) that hold over a stretch of the score, in the
 * order of where they begin. `element` finds an element of the MPM by its xml:id, for what a call
 * wrote; without it the calls are named by their options alone.
 *
 * A call holds over its range. A pedal's press holds for as long as the pedal stays down: up to
 * the call that lets it up again, which holds while the pedal moves. Of the tempo, the dynamics
 * curves, the rubatos and the accentuation patterns one holds at a time: a call up to where the
 * next of its name begins (one that begins where a later call begins holds nowhere). A call fitted
 * again later, whose elements a later call of its name wrote anew, holds nowhere: the MPM has what
 * the later one wrote.
 */
export function readInstructions(
  work: unknown,
  element: (id: string) => MpmAttributes | undefined = () => undefined,
): Instruction[] {
  const calls = isObject(work) && Array.isArray(work['provenance']) ? work['provenance'] : [];
  /** A call as read: the instruction, and what the reading goes by. */
  interface Read {
    readonly instruction: Instruction;
    /** What the call is, and where it stands among the calls: the later, the more recent. */
    readonly name: string;
    readonly index: number;
    /** The xml:ids of what it wrote into the MPM. */
    readonly written: readonly string[];
    readonly pedal: string | null;
    readonly direction: string | null;
  }
  const list: Read[] = [];
  (calls as readonly unknown[]).forEach((call, index) => {
    if (!isObject(call)) return;
    const id = string(call['id']);
    const name = string(call['name']);
    const range = call['range'];
    if (!id || !name || !isObject(range)) return;
    const from = number(range['from']);
    if (from === null) return;
    const options = isObject(call['options']) ? call['options'] : {};
    const ids = Array.isArray(call['elements']) ? (call['elements'] as readonly unknown[]) : [];
    const written = ids.filter((x): x is string => typeof x === 'string');
    const described = describe(name, options, written.map(element));
    if (!described) return;
    list.push({
      instruction: { id, ...described, from, to: Math.max(from, number(range['to']) ?? from) },
      name,
      index,
      written,
      pedal: name === 'InsertPedal' ? string(options['pedal']) : null,
      direction: name === 'InsertPedal' ? string(options['direction']) : null,
    });
  });
  // an element of the MPM is what the last call of a name to write it wrote
  const writer = new Map<string, number>();
  for (const call of list) for (const id of call.written) writer.set(`${call.name} ${id}`, call.index);
  const holding = list
    .filter(
      (call) =>
        call.written.length === 0 ||
        call.written.some((id) => writer.get(`${call.name} ${id}`) === call.index),
    )
    .sort((a, b) => a.instruction.from - b.instruction.from || a.index - b.index);
  return holding.flatMap(({ instruction, name, pedal, direction }, i) => {
    if (pedal !== null && direction === 'down') {
      const up = holding.find((other) => other.pedal === pedal && other.direction === 'up');
      const lifted = up?.instruction.from;
      return [lifted !== undefined && lifted > instruction.to ? { ...instruction, to: lifted } : instruction];
    }
    if (!ONE_AT_A_TIME.has(name)) return [instruction];
    const next = holding.slice(i + 1).find((other) => other.name === name)?.instruction.from;
    if (next === undefined) return [instruction];
    if (next === instruction.from) return [];
    return [{ ...instruction, to: Math.min(instruction.to, next), until: next }];
  });
}

/** How long an instruction is shown at least: one of a single moment (an arpeggio) the longest. */
const HOLD: Seconds = 1.2;

/**
 * The instructions in a rendering's time, each shown for a while at least, but not past where the
 * next of its kind takes over.
 */
export function timeInstructions(
  instructions: readonly Instruction[],
  toSeconds: (tick: Ticks) => Seconds,
  hold: Seconds = HOLD,
): TimedInstruction[] {
  return instructions.map((instruction) => {
    const start = toSeconds(instruction.from);
    const end = Math.max(toSeconds(instruction.to), start + hold);
    const until = instruction.until === undefined ? end : toSeconds(instruction.until);
    return { ...instruction, start, end: Math.min(end, until) };
  });
}

/** The instructions that hold at a time, in the order of where they begin. */
export const activeAt = (instructions: readonly TimedInstruction[], t: Seconds): TimedInstruction[] =>
  instructions.filter((instruction) => instruction.start <= t && t < instruction.end);

/** The identifier of a call, which sends on to MPM Desk, and the viewer opened at it directly. */
export const instructionIri = (id: string): string => `https://welte225.org/mpm/${id}`;
export const mpmDeskUrl = (id: string): string => `https://mpmdesk.welte225.org/#${id}`;
