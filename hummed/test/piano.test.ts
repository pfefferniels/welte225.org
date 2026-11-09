// The piano's parts as the sampler holds them and as an instrument is sent them over MIDI (and as
// the Pianoteq renderings are made from them), and the MIDI file they are rendered from.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprint, heldNotes, midiEvents, pedalAt, type PianoPart } from '../src/shared/piano.ts';
import { midiFile, readMidiFile, TICK_SECONDS } from '../tools/smf.ts';

const part = (overrides: Partial<PianoPart> = {}): PianoPart => ({
  keys: [
    { on: 1, off: 1.5, pitch: 60, velocity: 40 },
    { on: 2, off: 2.2, pitch: 64, velocity: 50.6 },
  ],
  sustain: [
    { at: 0.6, value: 0 },
    { at: 2.1, value: 127 },
    { at: 3, value: 0 },
  ],
  soft: [],
  ...overrides,
});

describe('the notes the sampler holds', () => {
  it('holds a key released under the pedal until the pedal lifts, and others at least 0.3 s', () => {
    const [a, b] = heldNotes(part());
    assert.deepEqual([a.on, a.duration], [1, 0.5]);
    assert.deepEqual([b.on, b.duration], [2, 1]);
    const [short] = heldNotes(part({ keys: [{ on: 1, off: 1.05, pitch: 60, velocity: 40 }] }));
    assert.ok(Math.abs(short.duration - 0.3) < 1e-9);
  });
});

describe('the MIDI messages of a part', () => {
  it('sends keys and pedals in time order, rounded, offs before pedals before ons at one time', () => {
    const events = midiEvents(
      part({ keys: [{ on: 1, off: 2.1, pitch: 60, velocity: 40 }], soft: [{ at: 2.1, value: 63.6 }] }),
    );
    assert.deepEqual(
      events.map((e) => [e.at, ...e.data]),
      [
        [0.6, 0xb0, 64, 0],
        [1, 0x90, 60, 40],
        [2.1, 0x80, 60, 64],
        [2.1, 0xb0, 64, 127],
        [2.1, 0xb0, 67, 64],
        [3, 0xb0, 64, 0],
      ],
    );
  });

  it('lets a key up before it is pressed again, and makes two presses at one time one', () => {
    const events = midiEvents(
      part({
        keys: [
          { on: 1, off: 3, pitch: 60, velocity: 40 },
          { on: 2, off: 2.5, pitch: 60, velocity: 30 },
          { on: 2.0004, off: 2.8, pitch: 60, velocity: 45 },
        ],
        sustain: [],
      }),
    );
    assert.deepEqual(
      events.map((e) => [e.at, ...e.data]),
      [
        [1, 0x90, 60, 40],
        [2, 0x80, 60, 64],
        [2, 0x90, 60, 45],
        [2.8, 0x80, 60, 64],
      ],
    );
  });

  it('leaves out a pedal position that repeats the last', () => {
    const sustain = [0, 0.2, 100, 100.4, 127].map((value, i) => ({ at: i, value }));
    const values = midiEvents(part({ keys: [], sustain })).map((e) => e.data[2]);
    assert.deepEqual(values, [0, 100, 127]);
  });

  it('knows where a pedal is at a time', () => {
    const { sustain } = part();
    assert.equal(pedalAt(sustain, 0), 0);
    assert.equal(pedalAt(sustain, 2.5), 127);
    assert.equal(pedalAt(sustain, 3), 0);
  });

  it('fingerprints the messages to the millisecond', () => {
    const events = midiEvents(part());
    const moved = events.map((e) => ({ ...e, at: e.at + 0.0002 }));
    assert.equal(fingerprint(moved), fingerprint(events));
    const later = events.map((e) => ({ ...e, at: e.at + 0.002 }));
    assert.notEqual(fingerprint(later), fingerprint(events));
  });
});

describe('the MIDI file', () => {
  it('keeps the messages, to half a millisecond', () => {
    const events = midiEvents(part());
    const back = readMidiFile(midiFile(events, 'test'));
    assert.equal(back.length, events.length);
    for (const [i, e] of events.entries()) {
      assert.deepEqual(back[i].data, e.data);
      assert.ok(Math.abs(back[i].at - e.at) <= TICK_SECONDS / 2 + 1e-12);
    }
  });

  it('is a format 0 file of one track', () => {
    const bytes = midiFile([], 'empty');
    assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'MThd');
    assert.deepEqual([...bytes.subarray(8, 14)], [0, 0, 0, 1, 0x03, 0xe8]);
  });
});

describe('the roll on an instrument', () => {
  it('strikes once a key the score doubles, and every other key', async () => {
    const { performPiano } = await import('../src/worker/piano.ts');
    const { loadPianoScore } = await import('../tools/node-support.ts');
    const score = loadPianoScore();
    const { piece } = performPiano(score, 1);
    const struck = midiEvents(piece).filter((e) => e.data[0] === 0x90).length;
    const distinct = new Set(piece.keys.map((k) => `${k.pitch}@${Math.round(k.on * 1000)}`)).size;
    assert.equal(struck, distinct);
    // the notes the score doubles (a pitch again at its date), arpeggiated or not, are those struck once
    const keys = [...score.msm.matchAll(/<note\b[^>]*>/g)].map(
      ([n]) => `${/\bmidi\.pitch="([^"]*)"/.exec(n)?.[1]}@${/\bdate="([^"]*)"/.exec(n)?.[1]}`,
    );
    assert.equal(piece.keys.length - struck, keys.length - new Set(keys).size);
  });
});
