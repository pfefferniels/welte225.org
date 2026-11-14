// What the reconstruction says where the music is: a panel over the spectrogram that lists, by
// dimension, the calls of /mpm/work.json holding at the playhead. Each is a link that opens MPM
// Desk's viewer at that call. Over the harmonic reductions it lists only the dimensions they take
// (tempo, dynamics, arpeggio), each arpeggio where they roll a chord as it. Under a rule, apart,
// the corrections of the source. The page asks in every frame it draws; the list is worked out
// again only once the playhead has passed the next place where a call begins or ends.
import {
  activeAt,
  appliesTo,
  CORRECTIONS,
  INSTRUCTION_KINDS,
  instructionIri,
  mpmDeskUrl,
  overReductions,
  readInstructions,
  timeInstructions,
  type Instruction,
  type InstructionKind,
  type Performed,
  type TimedInstruction,
} from '../shared/instructions.ts';
import { mpmElements } from '../shared/mpm.ts';
import type { Seconds } from '../shared/units.ts';
import type { Rendering } from './rendering.ts';

/**
 * The stretch of time about `t` over which the same instructions hold: from the last beginning or
 * end of one at or before `t`, up to the next after it.
 */
export function stretchAbout(
  instructions: readonly Pick<TimedInstruction, 'start' | 'end'>[],
  t: Seconds,
): readonly [from: Seconds, to: Seconds] {
  let from = -Infinity;
  let to = Infinity;
  for (const { start, end } of instructions)
    for (const edge of [start, end]) {
      if (edge <= t) from = Math.max(from, edge);
      else to = Math.min(to, edge);
    }
  return [from, to];
}

export class InstructionsView {
  readonly #panel: HTMLElement;
  readonly #rows = new Map<
    InstructionKind,
    { readonly row: HTMLElement; readonly cell: HTMLElement; shown: string }
  >();
  #instructions: readonly Instruction[] = [];
  /** What the rows are of: the piece, or the reductions, which list fewer. */
  #performed: Performed = 'piece';
  /** The instructions in the time of the rendering they were last shown for, of what was performed. */
  #timed: {
    readonly id: number;
    readonly performed: Performed;
    readonly list: readonly TimedInstruction[];
  } | null = null;
  /** The stretch of that rendering's time over which the rows are right as they are. */
  #right: readonly [from: Seconds, to: Seconds] | null = null;

  /** `opened` is told when a call is opened in MPM Desk. */
  constructor(panel: HTMLElement, opened: () => void) {
    this.#panel = panel;
    const rows = (kinds: readonly (readonly [InstructionKind, string])[]): HTMLDListElement => {
      const list = document.createElement('dl');
      for (const [kind, name] of kinds) {
        const row = document.createElement('div');
        const term = document.createElement('dt');
        const cell = document.createElement('dd');
        term.textContent = name;
        row.append(term, cell);
        list.append(row);
        this.#rows.set(kind, { row, cell, shown: '?' });
      }
      return list;
    };
    const corrections = rows([CORRECTIONS]);
    corrections.className = 'corrections';
    panel.replaceChildren(rows(INSTRUCTION_KINDS), corrections);
    panel.addEventListener('click', (event) => {
      if (event.target instanceof HTMLAnchorElement) opened();
    });
  }

  /** Read the reconstruction's calls, and the MPM they wrote for what each says. */
  async load(mpm: Promise<Document | null>): Promise<void> {
    const response = await fetch('../mpm/work.json');
    if (!response.ok) throw new Error(`work.json: ${response.status}`);
    const work: unknown = await response.json();
    const doc = await mpm.catch(() => null);
    const elements = doc ? mpmElements(doc) : null;
    this.#instructions = readInstructions(work, (id) => elements?.get(id));
    this.#timed = null;
    this.#right = null;
  }

  get shown(): boolean {
    return !this.#panel.hidden;
  }

  set shown(shown: boolean) {
    this.#panel.hidden = !shown;
  }

  /** List what holds at a time of the rendering, of what is performed: the piece or the reductions. */
  show(rendering: Rendering | null, t: Seconds, performed: Performed = 'piece'): void {
    if (!this.shown) return;
    if (rendering && (this.#timed?.id !== rendering.id || this.#timed.performed !== performed)) {
      const listed =
        performed === 'reductions' ? overReductions(this.#instructions, rendering.rolls) : this.#instructions;
      this.#timed = {
        id: rendering.id,
        performed,
        list: timeInstructions(listed, (tick) => rendering.toSeconds(tick)),
      };
      this.#right = null;
    }
    if (performed !== this.#performed) {
      this.#performed = performed;
      for (const [kind, { row }] of this.#rows) row.hidden = !appliesTo(kind, performed);
      this.#right = null;
    }
    if (rendering && this.#right && this.#right[0] <= t && t < this.#right[1]) return;
    this.#right = rendering && this.#timed ? stretchAbout(this.#timed.list, t) : null;
    const active = (rendering && this.#timed ? activeAt(this.#timed.list, t) : []).filter((instruction) =>
      appliesTo(instruction.kind, performed),
    );
    for (const [kind, row] of this.#rows) {
      // a call once, where it holds twice at once (a chord the quarters roll again, held a while)
      const here = active.filter(
        (instruction, i) =>
          instruction.kind === kind && active.findIndex((other) => other.id === instruction.id) === i,
      );
      const key = here.map((instruction) => instruction.id).join(' ');
      if (key === row.shown) continue;
      row.shown = key;
      row.cell.replaceChildren(...here.map(link));
    }
  }
}

function link(instruction: Instruction): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = mpmDeskUrl(instruction.id);
  a.target = '_blank';
  a.rel = 'noopener';
  a.title = `${instructionIri(instruction.id.slice(0, 8))}: open in MPM Desk`;
  a.textContent = instruction.label;
  return a;
}
