// The described page's material, from the files the site publishes: the piece as the roll shows it,
// the MPM's rendering laid on the recording's clock, the remarks carried over from the segments.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { assemble, onsetDifference } from '../src/described/assemble.ts';
import {
  callsOf,
  elementNames,
  notesOf,
  readRemarks,
  writtenBy,
  type DescribeStep,
  type Remark,
} from '../src/described/remarks.ts';
import { governing, lay, perform, placeTempos, temposOf } from '../src/described/rendering.ts';
import { stretch, where } from '../src/described/piece.ts';
import { carryOver, CarryError } from '../src/described/segments.ts';
import { ROOT } from '../tools/node-support.ts';

const file = (path: string): string => readFileSync(join(ROOT, '..', path), 'utf8');
const msm = file('mpm/score.msm');
const mei = file('mpm/transcription.mei');
const mpm = file('mpm/performance.mpm');
const work = JSON.parse(file('mpm/work.json')) as { provenance: { id: string; name: string }[] };
const remarksFile = JSON.parse(file('described/remarks.json')) as { provenance: DescribeStep[] };
const described = assemble({ msm, mei, mpm, work, remarks: remarksFile });
const median = (values: number[]): number => [...values].sort((a, b) => a - b)[values.length >> 1];

describe('the piece as the roll shows it', () => {
  const { piece } = described;
  it('is the notes of the score that the roll plays, each on its staff', () => {
    assert.equal(piece.notes.length, 450);
    assert.equal(new Set(piece.notes.map((note) => note.id)).size, 450);
    // the right hand is written on the upper staff, the left on the lower
    for (const note of piece.notes) assert.equal(note.staff, note.part === 1 ? 'treble' : 'bass', note.id);
    assert.ok(piece.notes.some((note) => note.part === 1) && piece.notes.some((note) => note.part === 2));
    // the first note: the upbeat's C4, under the treble staff
    const first = piece.notes[0];
    assert.deepEqual([first.date, first.letter, first.pitch, first.step], [0, 'c', 60, 28]);
    assert.equal(first.played.ms, 0);
  });
  it('is in F major, read off the notes, with accidentals where a note departs from it', () => {
    assert.deepEqual([...piece.signature], [['b', -1]]);
    const departing = piece.notes.filter((note) => note.alter !== (piece.signature.get(note.letter) ?? 0));
    assert.ok(departing.length > 20 && departing.length < piece.notes.length / 3, String(departing.length));
  });
  it('has the grace notes where they were played, spelled as the transcription writes them', () => {
    assert.equal(piece.graces.length, 13);
    // the bass's B flat before the third bar's F, and the same in the repeat
    const flats = piece.graces.filter((grace) => grace.pitch === 46);
    assert.deepEqual(
      flats.map((grace) => [grace.letter, grace.alter, grace.staff]),
      flats.map(() => ['b', -1, 'bass']),
    );
    assert.ok(flats.length >= 2);
    for (const grace of piece.graces) assert.ok(grace.ms > 0 && grace.ms < described.roll.total, grace.id);
  });
  it('has the pedals as they were pressed, and the bars with an upbeat', () => {
    assert.ok(piece.presses.some((press) => press.kind === 'sustain'));
    assert.ok(piece.presses.some((press) => press.kind === 'soft'));
    assert.deepEqual([piece.bars[0].number, piece.bars[0].from, piece.bars[0].to], [0, 0, 720]);
    assert.deepEqual(
      [piece.bars[1].number, piece.bars[1].from, piece.bars[1].to, piece.bars[1].beat],
      [1, 720, 3600, 720],
    );
    assert.equal(piece.bars.at(-1)?.to, piece.end);
    assert.deepEqual(piece.beats.slice(0, 4), [0, 720, 1440, 2160]);
  });
  it('says where a place is', () => {
    assert.equal(where(piece.bars, 0), 'bar 0');
    assert.equal(where(piece.bars, 720), 'bar 1');
    assert.equal(where(piece.bars, 1800), 'bar 1, beat 2.5');
    assert.equal(stretch(piece.bars, 720, 3600), 'bar 1');
    assert.equal(stretch(piece.bars, 720, 6480), 'bars 1–2');
    assert.equal(stretch(piece.bars, 3600, 4320), 'bar 2, beat 1 to 2');
    assert.equal(stretch(piece.bars, 2160, 3600), 'bar 1, beat 3 to bar 2');
    assert.equal(stretch(piece.bars, 2160, 5040), 'bar 1, beat 3 to bar 2, beat 3');
  });
});

describe('the rendering laid on the recording’s clock', () => {
  const { roll, laid, piece } = described;
  const performance = perform(msm, mpm);
  const recorded = piece.notes.map((note) => ({ id: note.id, date: note.date, ms: note.played.ms }));

  it('has every note the roll plays, and the pedals’ moves', () => {
    for (const note of piece.notes) assert.ok(performance.notes.has(note.id), note.id);
    assert.ok(performance.pedals.some((move) => move.kind === 'sustain' && move.value > 100));
    assert.ok(performance.pedals.some((move) => move.kind === 'soft'));
    for (let i = 1; i < roll.moves.length; i++) assert.ok(roll.moves[i].ms >= roll.moves[i - 1].ms);
  });
  it('lies within 25 ms of the playing in the middle', () => {
    const apart = onsetDifference(roll.notes);
    assert.ok(apart < 25, `the median onset difference is ${apart.toFixed(1)} ms`);
    // and loudness within a velocity step: the dynamics were fitted to these velocities
    const loud = median(roll.notes.map((note) => Math.abs(note.played.velocity - note.mpm.velocity)));
    assert.ok(loud < 1, `the median velocity difference is ${loud.toFixed(2)}`);
  });
  it('is laid anew at every tempo: laid once, on the first note, it is more than twice as far off', () => {
    const first = recorded[0];
    const lead = first.ms - (performance.notes.get(first.id)?.on ?? 0);
    const once = median(
      recorded.map((note) => Math.abs(note.ms - ((performance.notes.get(note.id)?.on ?? 0) + lead))),
    );
    assert.ok(once > 2 * onsetDifference(roll.notes), `${once.toFixed(1)} ms laid once`);
    assert.ok(once > 40 && once < 70, `${once.toFixed(1)} ms laid once`);
  });
  it('has the chord a tempo begins on where it was played', () => {
    const tempos = temposOf(mpm);
    assert.equal(tempos.length, 60);
    const spans = placeTempos(tempos, piece.end, performance.notes, recorded);
    assert.equal(spans.length, tempos.length);
    let anchored = 0;
    for (const span of spans) {
      const chord = roll.notes.filter((note) => note.date === span.tempo.date);
      if (chord.length === 0) continue;
      anchored += 1;
      const mean = (of: (note: (typeof chord)[number]) => number): number =>
        chord.reduce((sum, note) => sum + of(note), 0) / chord.length;
      assert.ok(
        Math.abs(mean((note) => note.played.ms) - mean((note) => note.mpm.ms)) < 1e-6,
        `the chord at ${span.tempo.date}`,
      );
    }
    assert.ok(anchored >= 50, `${anchored} tempos begin on a chord`);
    // one that begins on no chord goes on from the one before
    const loose = spans.findIndex((span, i) => i > 0 && !roll.notes.some((n) => n.date === span.tempo.date));
    assert.ok(loose > 0);
    assert.equal(spans[loose].lead, spans[loose - 1].lead);
  });
  it('gives every note the lead of the tempo that governs its date', () => {
    const spans = placeTempos(temposOf(mpm), piece.end, performance.notes, recorded);
    for (const note of roll.notes) {
      const rendered = performance.notes.get(note.id);
      const span = governing(spans, note.date);
      assert.ok(rendered && span);
      assert.ok(span.tempo.date <= note.date && note.date < span.until, note.id);
      assert.ok(Math.abs(note.mpm.ms - (rendered.on + span.lead)) < 1e-9, note.id);
      assert.ok(Math.abs(note.mpm.msEnd - (rendered.off + span.lead)) < 1e-9, note.id);
    }
  });
  it('keeps a clock for the bar lines, as the tempo has it, and its way back', () => {
    // the tempo map by itself: where espressivo has the pedal's moves
    const own = lay(performance, temposOf(mpm), [], [], piece.end);
    for (const move of performance.pedals.filter((_, i) => i % 97 === 0))
      assert.ok(Math.abs(own.msAt(move.date) - move.ms) < 1e-6, `at ${move.date}`);
    // on the recording's clock the bars go on from one to the next
    const lines = piece.bars.map((bar) => laid.msAt(bar.from));
    for (let i = 1; i < lines.length; i++) assert.ok(lines[i] > lines[i - 1], `bar ${piece.bars[i].number}`);
    for (const date of [0, 720, 5000, 46800, 90000]) {
      const back = laid.dateAt(laid.msAt(date));
      assert.ok(Math.abs(back - date) < 60, `${date} comes back as ${back.toFixed(1)}`);
    }
  });
});

describe('the remarks carried over from the segments', () => {
  const remarks = readRemarks(remarksFile);
  const calls = new Map(work.provenance.map((call) => [call.id, call]));
  const scoreIds = new Set([...msm.matchAll(/<note\b[^>]*\sxml:id="([^"]*)"/g)].map((m) => m[1]));

  it('are 109, each with its words and its place', () => {
    assert.equal(remarksFile.provenance.length, 109);
    assert.equal(remarks.length, 109);
    assert.equal(new Set(remarks.map((remark) => remark.id)).size, 109);
    for (const step of remarksFile.provenance) {
      assert.equal(step.name, 'Describe');
      assert.deepEqual(
        [step.options.model, step.options.date, step.options.steps],
        [null, null, []],
        step.id,
      );
    }
    for (const { text, about } of remarks) {
      assert.ok(text.trim().length > 0);
      assert.ok(about.from >= 0 && about.to > about.from && about.to <= described.piece.end, text);
    }
    const kinds = remarks.map((remark) => remark.about.kind);
    assert.equal(kinds.filter((kind) => kind === 'span').length, 71);
    assert.equal(kinds.filter((kind) => kind === 'arrow').length, 35);
    assert.equal(kinds.filter((kind) => kind === 'notes').length, 3);
  });
  it('name calls of today’s work file, and every one of them', () => {
    for (const remark of remarks) {
      assert.ok(remark.calls.length > 0, remark.text);
      assert.equal(new Set(remark.calls).size, remark.calls.length, remark.text);
      for (const id of remark.calls) assert.ok(calls.has(id), `${remark.text}: ${id}`);
    }
    // a press of a pedal is one call today, where it was two; four presses are of two remarks
    const named = remarks.flatMap((remark) => remark.calls);
    assert.equal(new Set(named).size, 402);
    const twice = [...new Set(named)].filter((id) => named.filter((other) => other === id).length > 1);
    assert.deepEqual(
      twice.map((id) => calls.get(id)?.name),
      ['InsertPedal', 'InsertPedal', 'InsertPedal', 'InsertPedal'],
    );
  });
  it('name notes of the score: none for a passage, two for an arrow', () => {
    for (const { text, about } of remarks) {
      for (const id of about.notes) assert.ok(scoreIds.has(id), `${text}: ${id}`);
      if (about.kind === 'span') assert.deepEqual(about.notes, [], text);
      if (about.kind === 'arrow') assert.equal(about.notes.length, 2, text);
      if (about.kind === 'notes') assert.ok(about.notes.length > 0, text);
    }
  });
  it('are on the roll, each with notes it is about, an arrow between two of them', () => {
    assert.equal(described.interim, true);
    assert.equal(described.marked.length, 109);
    for (const marked of described.marked) {
      assert.ok(marked.own.length > 0, marked.remark.text);
      if (marked.remark.about.kind !== 'arrow') continue;
      assert.ok(marked.ends, marked.remark.text);
      assert.ok(marked.ends[0].date < marked.ends[1].date, marked.remark.text);
    }
  });
  it('are each played with what is heard around their own notes, and no more than is within reach', () => {
    const { piece, laid } = described;
    for (const marked of described.marked) {
      const { about, text } = marked.remark;
      assert.ok(marked.heard, text);
      const { from, to } = marked.heard;
      // its own passage, and at least the chord before and the chord after
      assert.ok(from <= about.from && to >= about.to, text);
      const first = marked.own[0].date;
      const last = marked.own[marked.own.length - 1].date;
      assert.ok(from < first || first === piece.dates[0], text);
      assert.ok(to > last, text);
      assert.ok(first - from <= 2 * 720 && to - last <= 3 * 720, `${text}: ${from}–${to}`);
      assert.ok(laid.msAt(to) - laid.msAt(from) < laid.msAt(about.to) - laid.msAt(about.from) + 9000, text);
      // around its own notes: the rest of what is played, none of them twice
      const own = new Set(marked.own);
      for (const note of marked.around) {
        assert.ok(!own.has(note), `${text}: ${note.id}`);
        assert.ok(note.date >= from && note.date < to, `${text}: ${note.id}`);
      }
      assert.ok(marked.around.length > 0, text);
    }
  });
  it('wrote instructions the MPM has, of the kinds the context is chosen by', () => {
    const names = elementNames(mpm);
    let bringsOut = 0;
    for (const marked of described.marked) {
      const written = described.written.get(marked.remark.id);
      assert.ok(written);
      for (const id of written.ids) assert.ok(names.has(id), id);
      if (written.ids.length > 0) bringsOut += 1;
      assert.equal(written.topics.size > 0, written.ids.length > 0);
    }
    // all but those that only correct the source or press a pedal the MPM has otherwise
    assert.ok(bringsOut >= 105, `${bringsOut} remarks have something to bring out`);
    const topics = new Set(
      described.marked.flatMap((m) => [...(described.written.get(m.remark.id)?.topics ?? [])]),
    );
    assert.deepEqual([...topics].sort(), ['accent', 'dynamics', 'pedal', 'roll', 'rubato', 'tempo', 'touch']);
  });
});

describe('carrying segments over', () => {
  const then = {
    segments: [
      { id: 's1', note: 'Hinspielen zur 1' },
      { id: 's2', note: 'Pedal' },
    ],
    provenance: [
      { id: 'choice', name: 'MakeChoice' },
      { id: 'tempo', name: 'InsertTempo', segment: 's1' },
      { id: 'curve', name: 'InsertDynamics', segment: 's1' },
      { id: 'down', name: 'InsertPedal', options: { pedal: 'sustain-720' }, segment: 's2' },
      { id: 'up', name: 'InsertPedal', options: { pedal: 'sustain-720' }, segment: 's2' },
    ],
  };
  const today = {
    provenance: [
      { id: 'choice', name: 'MakeChoice' },
      { id: 'curve', name: 'InsertDynamics' },
      { id: 'press', name: 'InsertPedal', options: { pedal: 'sustain-720' } },
      { id: 'tempo', name: 'InsertTempo' },
    ],
  };
  const placed = [
    { id: 's1', scope: { kind: 'arrow', ids: ['a', 'b'], from: 0, to: 1440 } },
    { id: 's2', scope: { kind: 'span', ids: ['a', 'b', 'c'], from: 720, to: 2880 } },
  ];

  it('makes a remark of each: its id, its note, its place, and today’s calls in today’s order', () => {
    assert.deepEqual(carryOver(then, today, placed), [
      {
        id: 's1',
        name: 'Describe',
        options: {
          text: 'Hinspielen zur 1',
          about: { kind: 'arrow', from: 0, to: 1440, notes: ['a', 'b'] },
          model: null,
          date: null,
          steps: [],
          calls: ['curve', 'tempo'],
        },
      },
      {
        id: 's2',
        name: 'Describe',
        options: {
          text: 'Pedal',
          // a passage names no notes; both halves of the press are today's one call
          about: { kind: 'span', from: 720, to: 2880, notes: [] },
          model: null,
          date: null,
          steps: [],
          calls: ['press'],
        },
      },
    ]);
  });
  it('is read back as the page reads a work file', () => {
    const steps = carryOver(then, today, placed);
    const read = readRemarks({ provenance: [...today.provenance, ...steps] });
    assert.deepEqual(
      read.map((remark) => [remark.id, remark.text, remark.about.kind, remark.calls]),
      [
        ['s1', 'Hinspielen zur 1', 'arrow', ['curve', 'tempo']],
        ['s2', 'Pedal', 'span', ['press']],
      ],
    );
  });
  it('fails where a call cannot be found, or a pedal’s press is not one call today', () => {
    const without = { provenance: today.provenance.filter((call) => call.id !== 'tempo') };
    assert.throws(() => carryOver(then, without, placed), CarryError);
    assert.throws(() => carryOver(then, without, placed), /tempo.*InsertTempo.*s1/);
    const none = { provenance: today.provenance.filter((call) => call.id !== 'press') };
    assert.throws(() => carryOver(then, none, placed), /0 calls there are of its press sustain-720/);
    const two = {
      provenance: [
        ...today.provenance,
        { id: 'again', name: 'InsertPedal', options: { pedal: 'sustain-720' } },
      ],
    };
    assert.throws(() => carryOver(then, two, placed), /2 calls there are of its press/);
  });
  it('fails where a segment has no calls, no place, or a place of no kind', () => {
    const idle = { ...then, segments: [...then.segments, { id: 's3', note: 'nichts' }] };
    assert.throws(() => carryOver(idle, today, placed), /s3 was given no place/);
    const there = [...placed, { id: 's3', scope: { kind: 'span', ids: [], from: 0, to: 720 } }];
    assert.throws(() => carryOver(idle, today, there), /s3 \("nichts"\) has no calls/);
    assert.throws(() => carryOver(then, today, [...placed, there[2]]), /s3, which is no segment/);
    const odd = [placed[0], { id: 's2', scope: { ...placed[1].scope, kind: 'piece' } }];
    assert.throws(() => carryOver(then, today, odd), /placed as "piece"/);
    const stray = {
      ...then,
      provenance: [...then.provenance, { id: 'x', name: 'InsertTempo', segment: 's9' }],
    };
    assert.throws(() => carryOver(stray, today, placed), /a segment that is not there, s9/);
  });
});

describe('remarks in a work file', () => {
  const step = (id: string, about: unknown, calls: string[] = [], text = 'steady'): unknown => ({
    id,
    name: 'Describe',
    options: { text, about, model: 'claude', date: '2026-11-27T12:00:00.000Z', steps: [], calls },
  });
  const file = {
    provenance: [
      { id: 'c1', name: 'InsertTempo', elements: ['tempo_0'], range: { from: 0, to: 720 } },
      step('r1', { kind: 'span', from: 0, to: 720, notes: [] }, ['c1', 'c2', 'c3']),
      {
        id: 'c2',
        name: 'InsertArticulation',
        options: { noteIDs: ['n1', 'n2'] },
        elements: ['art_1', 'def_1'],
      },
      { id: 'c3', name: 'Modify', options: { aspect: 'velocity', change: -3 } },
      step('r2', { kind: 'piece', from: 0, to: 2880, notes: [] }),
      step('r3', { kind: 'notes', from: 0, to: 360, notes: ['n1', 7] }),
      step('bad1', { kind: 'cloud', from: 0, to: 720, notes: [] }),
      step('bad2', { kind: 'span', from: 0, notes: [] }),
      step('bad3', { kind: 'span', from: 0, to: 720, notes: [] }, [], '  '),
      { id: 'bad4', name: 'Describe' },
    ],
  };
  const remarks = readRemarks(file);

  it('are its Describe steps, in their order; one of no place, or that says nothing, is left out', () => {
    assert.deepEqual(
      remarks.map((remark) => remark.id),
      ['r1', 'r2', 'r3'],
    );
    assert.deepEqual(remarks[0], {
      id: 'r1',
      text: 'steady',
      about: { kind: 'span', from: 0, to: 720, notes: [] },
      model: 'claude',
      date: '2026-11-27T12:00:00.000Z',
      calls: ['c1', 'c2', 'c3'],
    } satisfies Remark);
    assert.deepEqual(remarks[2].about.notes, ['n1']);
    assert.deepEqual(readRemarks(null), []);
    assert.deepEqual(readRemarks({ provenance: 'x' }), []);
  });
  it('take the page’s remarks from the work file where it has any', () => {
    const own = assemble({
      msm,
      mei,
      mpm,
      work: { provenance: [...work.provenance, file.provenance[4]] },
      remarks: remarksFile,
    });
    assert.equal(own.interim, false);
    assert.deepEqual(
      own.marked.map((marked) => marked.remark.id),
      ['r2'],
    );
  });
  it('wrote what the MPM has of their calls’ elements, and are about the notes an articulation names', () => {
    const names = elementNames(
      '<mpm><articulationDef name="d" xml:id="def_1"/><tempo date="0" bpm="60" xml:id="tempo_0" /><articulation date="0" xml:id="art_1"/></mpm>',
    );
    assert.deepEqual(
      [...names],
      [
        ['def_1', 'articulationDef'],
        ['tempo_0', 'tempo'],
        ['art_1', 'articulation'],
      ],
    );
    const written = writtenBy(remarks[0], callsOf(file), names);
    // the definition is no instruction, and the correction wrote nothing
    assert.deepEqual(written.ids, ['tempo_0', 'art_1']);
    assert.deepEqual([...written.topics].sort(), ['tempo', 'touch']);
    assert.deepEqual(written.touched, ['n1', 'n2']);
    assert.deepEqual(writtenBy(remarks[1], callsOf(file), names), {
      ids: [],
      topics: new Set(),
      touched: [],
    });
  });
  it('are about the notes they name, or those that begin in their stretch', () => {
    const notes = [
      { id: 'n1', date: 0 },
      { id: 'n2', date: 360 },
      { id: 'n3', date: 720 },
    ];
    assert.deepEqual(notesOf(remarks[0].about, notes), [notes[0], notes[1]]);
    assert.deepEqual(notesOf(remarks[1].about, notes), []);
    assert.deepEqual(notesOf(remarks[2].about, notes), [notes[0]]);
    assert.deepEqual(notesOf({ kind: 'arrow', from: 360, to: 1080, notes: ['n2', 'n3'] }, notes), [
      notes[1],
      notes[2],
    ]);
  });
});
