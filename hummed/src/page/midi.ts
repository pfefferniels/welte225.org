// The piano on an instrument over MIDI (Web MIDI): a Disklavier, Pianoteq, any instrument that
// listens. It plays the part of the piano the elaboration chooses, its keys, sustain pedal and soft
// pedal, sent ahead by the instrument's own delay so that it sounds with the voice.
import {
  midiEvents,
  pedalAt,
  silence,
  SOFT_CC,
  SUSTAIN_CC,
  type MidiEvent,
  type PianoPart,
} from '../shared/piano.ts';
import type { Seconds } from '../shared/units.ts';
import type { PianoOutput } from './outputs.ts';
import type { PianoPartName, Rendering } from './rendering.ts';

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CONTROL = 0xb0;

/** Whether the browser has Web MIDI at all (Safari has not). */
export const midiAvailable = (): boolean => 'requestMIDIAccess' in navigator;

/** The instrument's outputs; the browser asks the visitor first. */
export async function midiOutputs(): Promise<MIDIAccess> {
  return navigator.requestMIDIAccess({ sysex: false });
}

/** The first event at or after `t` in events sorted by time. */
function firstFrom(events: readonly MidiEvent[], t: Seconds): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].at < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class MidiPiano implements PianoOutput {
  readonly port: MIDIOutput;
  readonly #context: AudioContext;
  #delay: Seconds;
  #part: PianoPartName | null = 'piece';
  readonly #events = new WeakMap<PianoPart, readonly MidiEvent[]>();
  /** Keys sent down and not yet up. */
  readonly #sounding = new Set<number>();
  /** The latest time a message was sent for, on the performance clock (ms). */
  #latest = 0;

  constructor(context: AudioContext, port: MIDIOutput, delay: Seconds) {
    this.#context = context;
    this.port = port;
    this.#delay = delay;
  }

  get lead(): Seconds {
    return this.#delay;
  }

  /** How long the instrument takes to sound what it is sent (a Disklavier waits about 0.5 s). */
  set delay(seconds: Seconds) {
    this.#delay = Math.max(0, seconds);
  }

  /** The part the instrument plays, or none (the humming alone). */
  get part(): PianoPartName | null {
    return this.#part;
  }

  set part(part: PianoPartName | null) {
    this.#part = part;
  }

  ready(): boolean {
    return true;
  }

  start(rendering: Rendering, t: Seconds, when: number): void {
    if (!this.#part) return;
    const part = rendering.parts[this.#part];
    // the pedals as they are at t; keys already down at t are not struck
    this.#send([CONTROL, SUSTAIN_CC, Math.round(pedalAt(part.sustain, t))], when);
    this.#send([CONTROL, SOFT_CC, Math.round(pedalAt(part.soft, t))], when);
  }

  schedule(rendering: Rendering, from: Seconds, until: Seconds, at: (t: Seconds) => number): void {
    if (!this.#part) return;
    const events = this.#eventsOf(rendering.parts[this.#part]);
    for (let i = firstFrom(events, from); i < events.length && events[i].at < until; i++) {
      const { at: time, data } = events[i];
      this.#send(data, at(time));
      const kind = data[0] & 0xf0;
      if (kind === NOTE_ON) this.#sounding.add(data[1]);
      else if (kind === NOTE_OFF) this.#sounding.delete(data[1]);
    }
  }

  /**
   * Silence the instrument now. Messages already sent for later are cancelled where the browser can
   * (`clear`); where it cannot, the keys they press are let up again after the last of them.
   */
  stop(): void {
    const now = performance.now();
    const port = this.port as MIDIOutput & { readonly clear?: () => void };
    let cleared = false;
    if (typeof port.clear === 'function') {
      try {
        port.clear();
        cleared = true;
      } catch {
        // not implemented after all
      }
    }
    const offs = [...this.#sounding].map((pitch) => [NOTE_OFF, pitch, 64]);
    for (const message of [...offs, ...silence()]) this.port.send([...message], now);
    if (!cleared && this.#latest > now)
      for (const message of [...offs, ...silence().slice(0, 2)])
        this.port.send([...message], this.#latest + 1);
    this.#sounding.clear();
    this.#latest = 0;
  }

  #eventsOf(part: PianoPart): readonly MidiEvent[] {
    let events = this.#events.get(part);
    if (!events) {
      events = midiEvents(part);
      this.#events.set(part, events);
    }
    return events;
  }

  /** The performance clock's time (ms) at which to send what is to sound at a context time. */
  #stamp(contextTime: number): number {
    const context = this.#context;
    const { contextTime: c, performanceTime: p } = context.getOutputTimestamp();
    const heard =
      c !== undefined && p !== undefined && p > 0
        ? p + (contextTime - c) * 1000
        : performance.now() + (contextTime - context.currentTime + context.outputLatency) * 1000;
    return heard - this.#delay * 1000;
  }

  #send(data: readonly number[], contextTime: number): void {
    const stamp = this.#stamp(contextTime);
    this.port.send([...data], Math.max(0, stamp));
    if (stamp > this.#latest) this.#latest = stamp;
  }
}
