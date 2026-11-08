// The piano's parts as the roll plays them, and what each way of sounding them needs: the notes the
// sampler holds (a key held on by the sustain pedal), and the MIDI messages an instrument is sent
// (the keys, the sustain pedal and the soft pedal), which the Pianoteq renderings are made from too.
import type { Midi, Seconds } from './units.ts';

/** A key of the roll: pressed and released, the pedal aside. */
export interface Key {
  readonly on: Seconds;
  readonly off: Seconds;
  readonly pitch: Midi;
  readonly velocity: Midi;
}

/** A pedal's position, 0 up to 127 down, from a time on. */
export interface PedalStep {
  readonly at: Seconds;
  readonly value: Midi;
}

/** One of the piano's parts as the roll plays it, in a rendering's time (the padding included). */
export interface PianoPart {
  /** In the order they are pressed. */
  readonly keys: readonly Key[];
  readonly sustain: readonly PedalStep[];
  /** The soft pedal (una corda); empty where it is never used. */
  readonly soft: readonly PedalStep[];
}

/** A note as the sampler plays it: the key, held on by the sustain pedal. */
export interface HeldNote {
  readonly on: Seconds;
  readonly duration: Seconds;
  readonly pitch: Midi;
  readonly velocity: Midi;
}

/** The shortest a sampled note sounds, and how long a note held to the end rings on. */
const MIN_HELD: Seconds = 0.3;
const RING_ON: Seconds = 0.6;

/** Every key as the sampler plays it: at least 0.3 s, and held while the sustain pedal is down. */
export function heldNotes(part: PianoPart): HeldNote[] {
  const pedal = part.sustain;
  const lastOff = Math.max(...part.keys.map((k) => k.off));
  return part.keys
    .map((k): HeldNote => {
      let off = Math.max(k.off, k.on + MIN_HELD);
      let i = -1;
      while (i + 1 < pedal.length && pedal[i + 1].at <= off) i++;
      if (i >= 0 && pedal[i].value >= 64) {
        let j = i;
        while (j < pedal.length && pedal[j].value >= 64) j++;
        off = j < pedal.length ? pedal[j].at : lastOff + RING_ON;
      }
      return { on: k.on, duration: off - k.on, pitch: k.pitch, velocity: k.velocity };
    })
    .sort((a, b) => a.on - b.on);
}

/** A pedal's position at a time: where its last step before it left it, up before the first. */
export function pedalAt(steps: readonly PedalStep[], t: Seconds): Midi {
  let value = 0;
  for (const step of steps) {
    if (step.at > t) break;
    value = step.value;
  }
  return value;
}

export const SUSTAIN_CC = 64;
export const SOFT_CC = 67;
const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL = 0xb0;

/** A MIDI message, and when it is to sound. */
export interface MidiEvent {
  readonly at: Seconds;
  readonly data: readonly [number, number, number];
}

/** A key shorter than this gets this long, so that its note-off comes after its note-on. */
const MIN_KEY: Seconds = 0.005;
/** Two presses of one key closer than this are one. */
const SAME_TIME: Seconds = 0.001;

const toMidi = (x: number, lo: number): number => Math.min(127, Math.max(lo, Math.round(x)));

/**
 * The part as MIDI messages on a channel, in time order; at the same time note-offs first, then the
 * pedals, then note-ons. A key pressed again while it still sounds is released just before (an
 * instrument holds one note per key); two presses at one time are one, the louder and longer.
 * Pedal positions are rounded to MIDI values and repeated values left out.
 */
export function midiEvents(part: PianoPart, channel = 0): MidiEvent[] {
  const events: (MidiEvent & { readonly order: number })[] = [];
  const byPitch = new Map<number, Key[]>();
  for (const key of part.keys) {
    const list = byPitch.get(key.pitch) ?? [];
    list.push(key);
    byPitch.set(key.pitch, list);
  }
  for (const [pitch, list] of byPitch) {
    const keys = [...list].sort((a, b) => a.on - b.on);
    const merged: { on: Seconds; off: Seconds; velocity: Midi }[] = [];
    for (const k of keys) {
      const last = merged.at(-1);
      if (last && k.on - last.on < SAME_TIME) {
        last.off = Math.max(last.off, k.off);
        last.velocity = Math.max(last.velocity, k.velocity);
      } else merged.push({ on: k.on, off: k.off, velocity: k.velocity });
    }
    merged.forEach((k, i) => {
      const next = merged[i + 1] as (typeof merged)[number] | undefined;
      let off = Math.max(k.off, k.on + MIN_KEY);
      if (next && next.on < off) off = next.on;
      events.push({ at: k.on, order: 2, data: [NOTE_ON | channel, pitch, toMidi(k.velocity, 1)] });
      events.push({ at: off, order: 0, data: [NOTE_OFF | channel, pitch, 64] });
    });
  }
  for (const [cc, steps] of [
    [SUSTAIN_CC, part.sustain],
    [SOFT_CC, part.soft],
  ] as const) {
    let last = -1;
    for (const step of steps) {
      const value = toMidi(step.value, 0);
      if (value === last) continue;
      last = value;
      events.push({ at: step.at, order: 1, data: [CONTROL | channel, cc, value] });
    }
  }
  return events.sort((a, b) => a.at - b.at || a.order - b.order).map(({ at, data }) => ({ at, data }));
}

/** The messages that silence an instrument: every note off, both pedals up. */
export function silence(channel = 0): (readonly [number, number, number])[] {
  return [
    [CONTROL | channel, SUSTAIN_CC, 0],
    [CONTROL | channel, SOFT_CC, 0],
    [CONTROL | channel, 123, 0],
  ];
}

/**
 * A fingerprint of a part's messages, to the millisecond: equal for the same performance, whatever
 * engine computed it. The renderings record it, and the tests compare it with the part as it is now.
 */
export function fingerprint(events: readonly MidiEvent[]): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const text = events.map((e) => `${Math.round(e.at * 1000)}:${e.data.join(',')}`).join(';');
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
