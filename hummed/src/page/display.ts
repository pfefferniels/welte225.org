// What the page shows beside the humming, chosen in the settings: the reconstruction's instructions
// at the playhead, and the piano in the spectrogram.
import { element, recall, remember } from './dom.ts';

const INSTRUCTIONS_KEY = 'welte225.hummed.instructions';
const PIANO_KEY = 'welte225.hummed.pianoPicture';

export class DisplaySettings {
  readonly #instructions = element('show-instructions', HTMLInputElement);
  readonly #piano = element('show-piano', HTMLInputElement);

  constructor(changed: () => void) {
    for (const [box, key] of [
      [this.#instructions, INSTRUCTIONS_KEY],
      [this.#piano, PIANO_KEY],
    ] as const) {
      // as the visitor left it; as the page has it on a first visit
      const kept = recall(key);
      if (kept !== null) box.checked = kept === 'on';
      box.addEventListener('change', () => {
        remember(key, box.checked ? 'on' : 'off');
        changed();
      });
    }
  }

  /** Whether the instructions holding at the playhead are listed. */
  get instructions(): boolean {
    return this.#instructions.checked;
  }

  /** Whether the piano is drawn under the humming. */
  get piano(): boolean {
    return this.#piano.checked;
  }
}
