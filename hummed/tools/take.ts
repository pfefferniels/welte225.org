// A take through the whole analysis, in Node: its sound taken apart into the body's movements and
// read against the roll. Without a take, one is made: the hummer's own voice for the bars asked
// for, with taps as a listener might tap them, so that what comes back can be held against what
// went in.
//   npm run take -- [--bars 1-4] [--take <take.json, beside its .wav>] [--calls <file>]
//                   [--mpm <file>: the take as MPM]
//                   [--save <name>: the take made, as <name>.wav and <name>.json, for the page to open]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { renderVoice } from '../src/hummer/index.ts';
import { seededRandom } from '../src/shared/math.ts';
import { PAD_MS, SAMPLE_RATE, STATE_STEP, type Seconds } from '../src/shared/units.ts';
import {
  analyseTake,
  readBody,
  readRoll,
  sectionOf,
  timeAt,
  withCorrections,
  type Correction,
  type Roll,
  type Section,
} from '../src/take/index.ts';
import type { TakeTiming } from '../src/take/reading.ts';
import { performTake, takeMpm } from '../src/take/mpm.ts';
import { decodeWav, encodeWav, resample } from '../src/take/wav.ts';
import { voiceStates } from '../src/worker/voice-states.ts';
import {
  loadCalibration,
  loadEngine,
  loadReduction,
  loadSpeaker,
  loadStyle,
  ROOT,
  voicePerformance,
} from './node-support.ts';
import type { VtlEngine } from '../src/vtl/engine.ts';
import { join } from 'node:path';

const { values } = parseArgs({
  options: {
    bars: { type: 'string', default: '1-4' },
    take: { type: 'string' },
    calls: { type: 'string' },
    save: { type: 'string' },
    mpm: { type: 'string' },
  },
});

export function loadRoll(): Roll {
  const read = (name: string): string => readFileSync(join(ROOT, '../mpm', name), 'utf8');
  const work = JSON.parse(read('work.json')) as {
    provenance: (Correction & { options: { prefer?: string } })[];
  };
  const prefer = work.provenance.find((p) => p.name === 'MakeChoice')?.options.prefer;
  // with the reconstruction's corrections of the velocities: the scale the dynamics are fitted on
  return withCorrections(readRoll(read('transcription.mei'), read('score.msm'), prefer), work.provenance);
}

/** The hummer's voice over a section as a take, with taps a little early and a little scattered. */
function hummedTake(
  engine: VtlEngine,
  roll: Roll,
  section: Section,
): { samples: Float32Array; timing: TakeTiming } {
  const { performance: voiceData, dynamics, approximateness, range, turns } = voicePerformance(1);
  const voice = renderVoice({
    performance: voiceData,
    dynamics,
    reduction: loadReduction(),
    style: loadStyle(),
    calibration: loadCalibration(),
    approximateness,
    range,
    turns,
  });
  const pad = PAD_MS / 1000;
  const from: Seconds = Math.max(0, timeAt(roll, section.from) - 0.5 + pad);
  const to: Seconds = timeAt(roll, section.to) + 0.5 + pad;
  const states = voiceStates(
    engine,
    voice,
    Math.ceil(((voice.endMs / 1000) * SAMPLE_RATE) / STATE_STEP) + 10,
  );
  const first = Math.floor((from * SAMPLE_RATE) / STATE_STEP);
  const last = Math.min(states.closed.count, Math.ceil((to * SAMPLE_RATE) / STATE_STEP));
  const samples = new Float32Array((last - first) * STATE_STEP);
  let filled = 0;
  for (const block of engine.synthesize(states, voice.weight, first, last, { blockStates: 400 })) {
    samples.set(block.samples.subarray(0, Math.min(block.samples.length, samples.length - filled)), filled);
    filled += block.samples.length;
  }
  const start = (first * STATE_STEP) / SAMPLE_RATE - pad;
  // taps on the quarters: 30 ms early, 20 ms scattered; on a spread chord, on its last note
  const random = seededRandom(7);
  const taps: Seconds[] = [];
  const origin = roll.bars.find((b) => b.number === 1)?.date ?? 0;
  for (let date = origin + Math.ceil((section.from - origin) / 720) * 720; date < section.to; date += 720) {
    const chord = roll.chords.find((c) => c.date === date);
    const beat = chord ? chord.last : timeAt(roll, date);
    taps.push(beat - 0.03 + random.normal(0, 1) * 0.02 - start);
  }
  return { samples, timing: { section, start, taps, pulse: 720 } };
}

const engine = await loadEngine();
const roll = loadRoll();
let samples: Float32Array;
let timing: TakeTiming;
if (values.take) {
  const meta = JSON.parse(readFileSync(values.take, 'utf8')) as {
    firstBar: number;
    lastBar: number;
    start: number;
    taps: number[];
    pulse: number;
  };
  const wav = decodeWav(readFileSync(values.take.replace(/\.json$/, '.wav')));
  samples = resample(wav.samples, wav.sampleRate, SAMPLE_RATE);
  timing = {
    section: sectionOf(roll, meta.firstBar, meta.lastBar),
    start: meta.start,
    taps: meta.taps,
    pulse: meta.pulse,
  };
} else {
  const [a, b] = values.bars.split('-').map(Number);
  ({ samples, timing } = hummedTake(engine, roll, sectionOf(roll, a, b)));
}

if (values.save) {
  const { firstBar, lastBar } = timing.section;
  writeFileSync(`${values.save}.wav`, encodeWav(samples, SAMPLE_RATE));
  const saved = { firstBar, lastBar, start: timing.start, taps: timing.taps, pulse: timing.pulse };
  writeFileSync(`${values.save}.json`, JSON.stringify(saved, null, 2));
}

const seconds = (samples.length / SAMPLE_RATE).toFixed(1);
console.log(
  `take: bars ${timing.section.firstBar}–${timing.section.lastBar}, ${seconds} s, ${timing.taps.length} taps`,
);
const began = performance.now();
const { movements, reading } = analyseTake(engine, readBody(loadSpeaker()), roll, samples, timing, {
  inversion: {
    equalize: Boolean(values.take),
    onPass: (pass, m) => {
      console.log(
        `  round ${pass}: the copy off by ${m.level.toFixed(2)} dB in level, ${m.mid.toFixed(2)} mid, ${m.high.toFixed(2)} high`,
      );
    },
  },
});
console.log(`analysed in ${((performance.now() - began) / 1000).toFixed(1)} s`);

const s = (t: number): string => t.toFixed(2);
console.log(
  `\nbody: ${movements.phrases.length} phrases, ${movements.breaths.length} breaths, ${movements.notes.length} notes`,
);
for (const p of movements.phrases) console.log(`  phrase ${s(p.from)}–${s(p.to)} s`);
for (const w of movements.swells)
  console.log(
    `  ${w.kind.padEnd(6)} ${s(w.from)}–${s(w.to)} s  ${w.fromDb.toFixed(1)} → ${w.toDb.toFixed(1)} dB, half at ${w.halfAt.toFixed(2)}`,
  );
for (const o of movements.openings)
  console.log(`  lips part ${s(o.from)}–${s(o.to)} s, to ${o.peak.toFixed(2)}`);

console.log(`\nagainst the roll: the voice ${(reading.lag * 1000).toFixed(0)} ms behind its notes`);
console.log(
  `  taps: ${reading.beats.filter((b) => b.tap !== null).length} of ${reading.beats.length} beats, ` +
    `${(reading.tapLead * 1000).toFixed(0)} ms against chords struck at once, scattered by ${(reading.tapScatter * 1000).toFixed(0)} ms`,
);
console.log(
  `  beats tapped where no note sounds: ${reading.silentOnsets.map((o) => `${o.date}@${s(o.onset)}`).join(' ') || 'none'}`,
);
for (const x of reading.spreads)
  console.log(
    `  spread at ${x.date}: ${((x.last - x.first) * 1000).toFixed(0)} ms, tapped at ${x.position?.toFixed(2) ?? '–'} → ${x.placement}`,
  );
console.log(
  `  effort and velocity at the chords: r = ${reading.velocity.r.toFixed(2)}, a dB of effort counted as ${reading.velocity.scale.toFixed(2)} velocity steps`,
);
console.log(
  `  between the notes: ${reading.betweens.map((v) => `${v.date}:${v.velocity}${v.voiced ? `(${(v.velocity - v.line >= 0 ? '+' : '') + (v.velocity - v.line).toFixed(1)})` : '(line)'}`).join(' ')}`,
);
console.log(`  boundaries: ${reading.boundaries.map((b) => `${b.date} (${b.kind})`).join(', ')}`);
for (const c of reading.calls.filter((c) => c.name !== 'InsertTemporalSpread'))
  console.log(`  ${c.name} ${JSON.stringify(c.options)}`);
console.log(
  `  rubato within the beats: ${reading.rubatos.map((x) => `${x.date}:${x.intensity.toFixed(2)}`).join(' ') || 'none'}`,
);
console.log(
  `  accents against the dynamics: ${reading.accents.map((a) => `${a.from}–${a.to} ±${a.scale.toFixed(1)}`).join(', ') || 'none'}`,
);

// the take as MPM, performed: how far its notes lie from the roll's, as it stands and exaggerated
const mpm = takeMpm(roll, timing.section, reading, 'A take: hummed and tapped along with the roll');
const msm = readFileSync(join(ROOT, '../mpm/score.msm'), 'utf8');
const sounded = roll.notes.filter((n) => n.date >= timing.section.from && n.date < timing.section.to);
const origin = Math.min(...sounded.map((n) => n.onset));
const span = Math.max(...sounded.map((n) => n.onset)) - origin;
for (const factor of [1, 2, 0]) {
  const { notes } = performTake(msm, mpm, timing.section, factor);
  const last = Math.max(...notes.map((n) => n.on));
  console.log(
    `  the MPM performed × ${factor}: ${notes.length} notes, its last begins ${last.toFixed(2)} s in (the roll's ${span.toFixed(2)} s), ` +
      `velocities ${Math.round(Math.min(...notes.map((n) => n.velocity)))} to ${Math.round(Math.max(...notes.map((n) => n.velocity)))}`,
  );
}
if (values.mpm) writeFileSync(values.mpm, mpm);
if (values.calls) {
  const work = { provenance: reading.calls, secondary: { tempo: { silentOnsets: reading.silentOnsets } } };
  writeFileSync(values.calls, JSON.stringify(work, null, 2));
  console.log(`\n${reading.calls.length} calls written to ${values.calls}`);
}
