// An instrument over MIDI: each message is sent for the moment its sound is heard, the instrument's
// delay earlier; the part it plays is the one chosen; it is silenced when playing stops.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MidiPiano } from '../src/page/midi.ts';
import { Rendering } from '../src/page/rendering.ts';
import type { PianoPart } from '../src/shared/piano.ts';
import type { Plan } from '../src/shared/protocol.ts';

const piece: PianoPart = {
  keys: [
    { on: 1, off: 1.4, pitch: 60, velocity: 40 },
    { on: 1.2, off: 3, pitch: 64, velocity: 50 },
  ],
  sustain: [{ at: 0.6, value: 0 }],
  soft: [],
};
const harmonies: PianoPart = { keys: [{ on: 1, off: 2, pitch: 41, velocity: 30 }], sustain: [], soft: [] };
const plan: Plan = {
  type: 'plan',
  id: 1,
  setting: { level: 1, elaboration: 0.65 },
  voiceLevel: 1.3,
  duration: 4,
  bars: [],
  clock: { ticks: [0, 720], ms: [0, 1000] },
  piece,
  harmonies,
  timings: { espressivo: 0, hummer: 0, gestures: 0 },
  startSeconds: 0,
  startState: 0,
  stateCount: 1600,
  seams: [],
};

/** A context whose output is at context time 10 at performance time T (far ahead of now). */
const T = 1e9;
const context = {
  currentTime: 10,
  outputLatency: 0,
  getOutputTimestamp: () => ({ contextTime: 10, performanceTime: T }),
} as unknown as AudioContext;

function port(withClear: boolean): { readonly port: MIDIOutput; readonly sent: [number[], number][] } {
  const sent: [number[], number][] = [];
  const port = {
    id: 'test',
    send: (data: number[], at: number) => sent.push([data, at]),
    ...(withClear ? { clear: () => sent.push([[-1], 0]) } : {}),
  } as unknown as MIDIOutput;
  return { port, sent };
}

describe('an instrument over MIDI', () => {
  const rendering = new Rendering(plan);
  // the rendering's time 0 sounds at context time 10
  const at = (t: number): number => 10 + t;

  it('sends each message for when it is heard, the delay earlier', () => {
    const { port: p, sent } = port(false);
    const midi = new MidiPiano(context, p, 0.5);
    assert.equal(midi.lead, 0.5);
    midi.schedule(rendering, 0, 1.3, at);
    assert.deepEqual(sent, [
      [[0xb0, 64, 0], T + 600 - 500],
      [[0x90, 60, 40], T + 1000 - 500],
      [[0x90, 64, 50], T + 1200 - 500],
    ]);
  });

  it('plays the part chosen, and nothing where none is', () => {
    const { port: p, sent } = port(false);
    const midi = new MidiPiano(context, p, 0);
    midi.part = 'harmonies';
    midi.schedule(rendering, 0, 2, at);
    assert.deepEqual(
      sent.map(([data]) => data[1]),
      [41],
    );
    midi.part = null;
    midi.schedule(rendering, 0, 4, at);
    midi.start(rendering, 0, at(0));
    assert.equal(sent.length, 1);
  });

  it('starts with the pedals where they are', () => {
    const { port: p, sent } = port(false);
    new MidiPiano(context, p, 0).start(rendering, 2, at(2));
    assert.deepEqual(sent, [
      [[0xb0, 64, 0], T + 2000],
      [[0xb0, 67, 0], T + 2000],
    ]);
  });

  it('silences the instrument at once, and again after what it was sent for later where it cannot cancel', () => {
    const { port: p, sent } = port(false);
    const midi = new MidiPiano(context, p, 0);
    midi.schedule(rendering, 0, 1.3, at);
    sent.length = 0;
    midi.stop();
    const now = sent.filter(([, t]) => t < T).map(([data]) => data);
    assert.deepEqual(now, [
      [0x80, 60, 64],
      [0x80, 64, 64],
      [0xb0, 64, 0],
      [0xb0, 67, 0],
      [0xb0, 123, 0],
    ]);
    const later = sent.filter(([, t]) => t >= T);
    assert.ok(later.every(([, t]) => t === T + 1200 + 1));
    assert.ok(later.some(([data]) => data[0] === 0x80 && data[1] === 64));
  });

  it('cancels what it sent for later where the browser can', () => {
    const { port: p, sent } = port(true);
    const midi = new MidiPiano(context, p, 0);
    midi.schedule(rendering, 0, 1.3, at);
    sent.length = 0;
    midi.stop();
    assert.deepEqual(sent[0], [[-1], 0]);
    assert.ok(sent.every(([, t]) => t < T));
  });
});
