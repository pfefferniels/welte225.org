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
 * the call that lets it up again, which holds while the pedal moves.
 */
export function readInstructions(
  work: unknown,
  element: (id: string) => MpmAttributes | undefined = () => undefined,
): Instruction[] {
  const calls = isObject(work) && Array.isArray(work['provenance']) ? work['provenance'] : [];
  const list: (Instruction & { readonly pedal: string | null; readonly direction: string | null })[] = [];
  for (const call of calls as readonly unknown[]) {
    if (!isObject(call)) continue;
    const id = string(call['id']);
    const name = string(call['name']);
    const range = call['range'];
    if (!id || !name || !isObject(range)) continue;
    const from = number(range['from']);
    if (from === null) continue;
    const options = isObject(call['options']) ? call['options'] : {};
    const ids = Array.isArray(call['elements']) ? (call['elements'] as readonly unknown[]) : [];
    const described = describe(
      name,
      options,
      ids.map((x) => (typeof x === 'string' ? element(x) : undefined)),
    );
    if (!described) continue;
    list.push({
      id,
      ...described,
      from,
      to: Math.max(from, number(range['to']) ?? from),
      pedal: name === 'InsertPedal' ? string(options['pedal']) : null,
      direction: name === 'InsertPedal' ? string(options['direction']) : null,
    });
  }
  list.sort((a, b) => a.from - b.from);
  return list.map(({ pedal, direction, ...instruction }) => {
    if (pedal === null || direction !== 'down') return instruction;
    const up = list.find((other) => other.pedal === pedal && other.direction === 'up');
    return up && up.from > instruction.to ? { ...instruction, to: up.from } : instruction;
  });
}

/** How long an instruction is shown at least: one of a single moment (an arpeggio) the longest. */
const HOLD: Seconds = 1.2;

/** The instructions in a rendering's time, each shown for a while at least. */
export function timeInstructions(
  instructions: readonly Instruction[],
  toSeconds: (tick: Ticks) => Seconds,
  hold: Seconds = HOLD,
): TimedInstruction[] {
  return instructions.map((instruction) => {
    const start = toSeconds(instruction.from);
    return { ...instruction, start, end: Math.max(toSeconds(instruction.to), start + hold) };
  });
}

/** The instructions that hold at a time, in the order of where they begin. */
export const activeAt = (instructions: readonly TimedInstruction[], t: Seconds): TimedInstruction[] =>
  instructions.filter((instruction) => instruction.start <= t && t < instruction.end);

/** The identifier of a call, which sends on to MPM Desk, and the viewer opened at it directly. */
export const instructionIri = (id: string): string => `https://welte225.org/mpm/${id}`;
export const mpmDeskUrl = (id: string): string => `https://mpmdesk.welte225.org/#${id}`;
