// What the reconstruction says where the music is: a panel over the spectrogram that lists, by
// dimension, the calls of /mpm/work.json holding at the playhead. Each is a link that opens MPM
// Desk's viewer at that call.
import {
  activeAt,
  INSTRUCTION_KINDS,
  instructionIri,
  mpmDeskUrl,
  readInstructions,
  timeInstructions,
  type Instruction,
  type InstructionKind,
  type TimedInstruction,
} from '../shared/instructions.ts';
import { mpmElements } from '../shared/mpm.ts';
import type { Seconds } from '../shared/units.ts';
import type { Rendering } from './rendering.ts';

export class InstructionsView {
  readonly #panel: HTMLElement;
  readonly #rows = new Map<InstructionKind, { readonly cell: HTMLElement; shown: string }>();
  #instructions: readonly Instruction[] = [];
  /** The instructions in the time of the rendering they were last shown for. */
  #timed: { readonly id: number; readonly list: readonly TimedInstruction[] } | null = null;

  /** `opened` is told when a call is opened in MPM Desk. */
  constructor(panel: HTMLElement, opened: () => void) {
    this.#panel = panel;
    const list = document.createElement('dl');
    for (const [kind, name] of INSTRUCTION_KINDS) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const cell = document.createElement('dd');
      term.textContent = name;
      row.append(term, cell);
      list.append(row);
      this.#rows.set(kind, { cell, shown: '?' });
    }
    panel.replaceChildren(list);
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
  }

  get shown(): boolean {
    return !this.#panel.hidden;
  }

  set shown(shown: boolean) {
    this.#panel.hidden = !shown;
  }

  /** List what holds at a time of the rendering. */
  show(rendering: Rendering | null, t: Seconds): void {
    if (!this.shown) return;
    if (rendering && this.#timed?.id !== rendering.id)
      this.#timed = {
        id: rendering.id,
        list: timeInstructions(this.#instructions, (tick) => rendering.toSeconds(tick)),
      };
    const active = rendering && this.#timed ? activeAt(this.#timed.list, t) : [];
    for (const [kind, row] of this.#rows) {
      const here = active.filter((instruction) => instruction.kind === kind);
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
