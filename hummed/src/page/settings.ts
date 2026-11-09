// The settings card: which piano plays. The Bösendorfer as Pianoteq rendered it ahead (where there
// are recordings, one for each setting of the elaboration), the Salamander grand sampled as you
// listen, or an instrument of the visitor's own over MIDI, with its delay. The
// browser is asked for MIDI only when the visitor chooses it.
import type { RecordingsManifest } from '../shared/recordings.ts';
import { element, recall as load, remember as store } from './dom.ts';
import { midiAvailable, midiOutputs, MidiPiano } from './midi.ts';
import type { BuiltInPiano, PianoOutput } from './outputs.ts';
import type { PianoPartName } from './rendering.ts';

export type PianoKind = 'recorded' | 'sampled' | 'midi';

/** What is remembered between visits. */
const KIND_KEY = 'welte225.hummed.piano';
const DELAY_KEY = 'welte225.hummed.midiDelay';

export interface PianoSettingsOptions {
  readonly context: AudioContext;
  /** The sampled grand, played as you listen. */
  readonly sampled: BuiltInPiano;
  /** The part an instrument is to play now, as the elaboration has it. */
  readonly part: () => PianoPartName | null;
  /** Another piano was chosen. */
  readonly chosen: (output: PianoOutput) => void;
  readonly status: (text: string) => void;
}

export class PianoSettings {
  readonly #options: PianoSettingsOptions;
  readonly #radios = [...document.querySelectorAll<HTMLInputElement>('input[name="piano"]')];
  readonly #midiBox = element('midi-settings', HTMLElement);
  readonly #port = element('midi-port', HTMLSelectElement);
  readonly #delay = element('midi-delay', HTMLInputElement);
  #recorded: BuiltInPiano | null = null;
  #kind: PianoKind = 'sampled';
  #access: MIDIAccess | null = null;
  #midi: MidiPiano | null = null;

  constructor(options: PianoSettingsOptions) {
    this.#options = options;
    element('choice-midi', HTMLElement).hidden = !midiAvailable();
    const delay = Number(load(DELAY_KEY));
    this.#delay.value = String(Number.isFinite(delay) && delay >= 0 && delay <= 2000 ? delay : 0);
    for (const radio of this.#radios)
      radio.addEventListener('change', () => {
        if (radio.checked) void this.#choose(radio.value as PianoKind);
      });
    this.#port.addEventListener('change', () => {
      this.#useMidi(this.#port.value);
    });
    this.#delay.addEventListener('change', () => {
      const ms = Math.min(2000, Math.max(0, Math.round(Number(this.#delay.value) || 0)));
      this.#delay.value = String(ms);
      store(DELAY_KEY, String(ms));
      if (!this.#midi) return;
      this.#midi.delay = ms / 1000;
      // a new lead needs a fresh start, from where playing is
      this.#options.chosen(this.#midi);
    });
  }

  /** The piano that plays. */
  get output(): PianoOutput {
    if (this.#midi) return this.#midi;
    if (this.#kind === 'recorded' && this.#recorded) return this.#recorded;
    return this.#options.sampled;
  }

  get kind(): PianoKind {
    return this.#kind;
  }

  /**
   * Offer the recordings: they play from now on, unless the visitor chose the sampled grand on an
   * earlier visit.
   */
  offerRecorded(piano: BuiltInPiano, manifest: RecordingsManifest): void {
    this.#recorded = piano;
    element('choice-recorded', HTMLElement).hidden = false;
    element('recorded-name', HTMLElement).textContent = manifest.instrument;
    element('recorded-note', HTMLElement).textContent =
      manifest.step > 0.05 + 1e-9
        ? `Pianoteq, rendered ahead at every ${manifest.step} of the elaboration; the sampled grand between.`
        : 'Played by Pianoteq, rendered ahead.';
    if (load(KIND_KEY) !== 'sampled' && this.#kind === 'sampled') void this.#choose('recorded');
  }

  /** The elaboration chose another part; true if the instrument has to start it afresh. */
  setPart(part: PianoPartName | null): boolean {
    if (!this.#midi || this.#midi.part === part) return false;
    this.#midi.part = part;
    return true;
  }

  async #choose(kind: PianoKind): Promise<void> {
    if (kind === 'midi') {
      if (!(await this.#ask())) {
        this.#check(this.#kind);
        return;
      }
      this.#kind = 'midi';
      this.#midiBox.hidden = false;
      this.#useMidi(this.#port.value);
      return;
    }
    store(KIND_KEY, kind);
    this.#kind = kind;
    this.#check(kind);
    this.#midiBox.hidden = true;
    this.#midi?.stop();
    this.#midi = null;
    this.#options.chosen(this.output);
  }

  #check(kind: PianoKind): void {
    for (const radio of this.#radios) radio.checked = radio.value === kind;
  }

  #useMidi(id: string): void {
    const port = this.#access?.outputs.get(id);
    if (!port) return;
    this.#midi?.stop();
    this.#midi = new MidiPiano(this.#options.context, port, Number(this.#delay.value) / 1000);
    this.#midi.part = this.#options.part();
    this.#options.status('');
    this.#options.chosen(this.#midi);
  }

  /** Ask the browser for MIDI and list the instruments; false where there are none to play. */
  async #ask(): Promise<boolean> {
    try {
      if (!this.#access) {
        this.#access = await midiOutputs();
        this.#access.onstatechange = () => {
          this.#list();
        };
      }
    } catch {
      this.#options.status('The browser did not allow MIDI.');
      return false;
    }
    this.#list();
    if (this.#port.options.length > 0) return true;
    this.#options.status('No MIDI instrument is connected.');
    return false;
  }

  /** The instruments as they come and go; if the one playing goes, the page's piano takes over. */
  #list(): void {
    const outputs = [...(this.#access?.outputs.values() ?? [])] as MIDIOutput[];
    const chosen = this.#midi?.port.id ?? this.#port.value;
    this.#port.replaceChildren(...outputs.map((o) => new Option(o.name ?? o.id, o.id)));
    if (outputs.some((o) => o.id === chosen)) this.#port.value = chosen;
    if (this.#midi && !outputs.some((o) => o.id === this.#midi?.port.id)) {
      this.#options.status('The MIDI instrument went away; the page plays the piano.');
      void this.#choose(this.#recorded && load(KIND_KEY) !== 'sampled' ? 'recorded' : 'sampled');
    }
  }
}
