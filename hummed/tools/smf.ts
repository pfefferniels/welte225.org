// A Standard MIDI File of one part: format 0, one track, at a tempo that makes a tick half a
// millisecond, so that the file keeps the performance's times as the page plays them.
import type { MidiEvent } from '../src/shared/piano.ts';

/** Ticks per quarter, and microseconds per quarter: 1000 ticks in half a second. */
const DIVISION = 1000;
const TEMPO = 500000;
export const TICK_SECONDS = TEMPO / 1e6 / DIVISION;
/** After the last message the track runs on this long, for the instrument to ring out. */
const RING_OUT = 4;

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  for (let rest = n >>> 7; rest > 0; rest >>>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const ascii = (text: string): number[] => [...new TextEncoder().encode(text)];

/** The messages as a MIDI file, named. */
export function midiFile(events: readonly MidiEvent[], name: string): Uint8Array {
  const track: number[] = [];
  track.push(0, 0xff, 0x51, 0x03, (TEMPO >> 16) & 0xff, (TEMPO >> 8) & 0xff, TEMPO & 0xff);
  const title = ascii(name);
  track.push(0, 0xff, 0x03, ...vlq(title.length), ...title);
  let tick = 0;
  for (const event of events) {
    const at = Math.max(tick, Math.round(event.at / TICK_SECONDS));
    track.push(...vlq(at - tick), ...event.data);
    tick = at;
  }
  track.push(...vlq(Math.round(RING_OUT / TICK_SECONDS)), 0xff, 0x2f, 0x00);
  return Uint8Array.from([
    ...ascii('MThd'),
    ...u32(6),
    0,
    0, // format 0
    0,
    1, // one track
    DIVISION >> 8,
    DIVISION & 0xff,
    ...ascii('MTrk'),
    ...u32(track.length),
    ...track,
  ]);
}

/** The messages of a file `midiFile` wrote, with their times: for the tests, and to check a file. */
export function readMidiFile(bytes: Uint8Array): MidiEvent[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'MThd') throw new Error('not a MIDI file');
  const division = view.getUint16(12);
  let i = 14 + 8; // past the header and the track's own
  let tick = 0;
  let tempo = 500000;
  let status = 0;
  const events: MidiEvent[] = [];
  const readVlq = (): number => {
    let n = 0;
    for (;;) {
      const b = bytes[i++];
      n = (n << 7) | (b & 0x7f);
      if (!(b & 0x80)) return n;
    }
  };
  while (i < bytes.length) {
    tick += readVlq();
    if (bytes[i] === 0xff) {
      const type = bytes[i + 1];
      i += 2;
      const length = readVlq();
      if (type === 0x51) tempo = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      i += length;
      if (type === 0x2f) break;
      continue;
    }
    if (bytes[i] & 0x80) status = bytes[i++];
    const data: [number, number, number] = [status, bytes[i], bytes[i + 1]];
    i += 2;
    events.push({ at: (tick * tempo) / 1e6 / division, data });
  }
  return events;
}
