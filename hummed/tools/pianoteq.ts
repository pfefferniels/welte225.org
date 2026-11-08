// The piano rendered ahead by Pianoteq, for the page to play: for each level of saturation on a grid,
// both of the piano's parts (the piece and its harmonies) as MIDI, as the page would send them to an
// instrument; Pianoteq renders each to sound, which is moved into place against the messages (to the
// millisecond, so that it plays with the voice), given one gain for all levels, made mono and
// written as MP3 to piano/pianoteq/, with manifest.json saying what was rendered.
//
//   npm run pianoteq -- render --pianoteq <program> --preset <name> [--step 0.25] [--levels 1,0.5]
//                              [--fxp <file> instead of --preset] [--instrument <name>] [--credit <text>]
//   npm run pianoteq -- midi [--out <dir>] [--step 0.25] [--levels …]   (only the MIDI files)
//
// Needs Pianoteq (any edition; the preset with its reverb off, the page has its own room) and ffmpeg.
// The program is Pianoteq's executable, e.g. on a Mac
// "/Applications/Pianoteq 9/Pianoteq 9.app/Contents/MacOS/Pianoteq 9"; or set PIANOTEQ.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fingerprint, midiEvents, type MidiEvent, type PianoPart } from '../src/shared/piano.ts';
import {
  gridLevels,
  levelName,
  parseManifest,
  type RecordedLevel,
  type RecordedPart,
  type RecordingsManifest,
} from '../src/shared/recordings.ts';
import { SAMPLE_RATE } from '../src/shared/units.ts';
import { performPiano } from '../src/worker/piano.ts';
import { expectedOnsets, findLag, lagDrift, loudness, onsetStrength, peak } from './audio.ts';
import { loadPianoScore, ROOT } from './node-support.ts';
import { midiFile } from './smf.ts';

/**
 * The sampled grand's loudness playing the piece at ×1 (`loudness`, dB), as the page plays it,
 * before the room: measured in Chromium (an OfflineAudioContext, piano.ts's samples and envelopes)
 * on 8 November 2026. The recordings are given the same, so that the mix holds for both.
 */
export const SAMPLER_LOUDNESS_DB = -20.4;
/** The loudest a recording may peak (dB): the gain's ceiling. The sampled grand reaches 0 dB. */
const CEILING_DB = -0.5;
/** A lag found less clearly than this (its score against the next best) is reported as uncertain. */
const CLEAR = 1.5;
const OUT = join(ROOT, 'piano/pianoteq');
const PARTS = ['piece', 'harmonies'] as const;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pianoteq: { type: 'string', default: process.env['PIANOTEQ'] ?? '' },
    preset: { type: 'string' },
    fxp: { type: 'string' },
    step: { type: 'string', default: '0.25' },
    levels: { type: 'string' },
    out: { type: 'string' },
    instrument: { type: 'string', default: 'Bösendorfer 280VC' },
    credit: { type: 'string' },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const step = Number(values.step);
if (!(step > 0) || Math.abs(Math.round(1 / step) * step - 1) > 1e-9)
  fail(`--step ${values.step}: the grid must reach ×1, e.g. 0.25, 0.2, 0.1`);
const levels = values.levels ? values.levels.split(',').map(Number) : gridLevels(step);
const offGrid = levels.filter((l) => !gridLevels(step).some((g) => Math.abs(g - l) < 1e-9));
if (offGrid.length > 0) fail(`levels not on the grid of ${step}: ${offGrid.join(', ')}`);

const score = loadPianoScore();
/** Each level's parts as the page plays them, and their messages. */
const performed = levels.map((level) => {
  const parts = performPiano(score, level);
  const events = (part: PianoPart): readonly MidiEvent[] => midiEvents(part);
  return { level, parts, events: { piece: events(parts.piece), harmonies: events(parts.harmonies) } };
});
const fileName = (level: number, part: string, ext: string): string => `${levelName(level)}-${part}.${ext}`;

function writeMidi(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const { level, events } of performed)
    for (const part of PARTS)
      writeFileSync(
        join(dir, fileName(level, part, 'mid')),
        midiFile(events[part], `WM 225, ${part}, saturation ×${level}`),
      );
}

function run(program: string, args: readonly string[], input?: Buffer): Buffer {
  const result = spawnSync(program, args, { input, maxBuffer: 1 << 30 });
  if (result.error) fail(`${program}: ${result.error.message}`);
  if (result.status !== 0) fail(`${program} ${args.join(' ')} failed:\n${result.stderr.toString()}`);
  return result.stdout;
}

/** A sound file as mono samples at the page's rate. */
function readSound(file: string): Float32Array {
  const bytes = run('ffmpeg', [
    '-v',
    'error',
    '-i',
    file,
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-f',
    'f32le',
    '-',
  ]);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();
}

function writeMp3(samples: Float32Array, file: string): void {
  const input = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  run(
    'ffmpeg',
    ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', '-'].concat([
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '4',
      file,
    ]),
    input,
  );
}

/** The sound moved by the lag: what came `lagMs` late now comes on time. */
function shifted(samples: Float32Array, lagMs: number): Float32Array {
  const n = Math.round((lagMs / 1000) * SAMPLE_RATE);
  if (n >= 0) return samples.slice(n);
  const out = new Float32Array(samples.length - n);
  out.set(samples, -n);
  return out;
}

/** Cut the silence after the sound has died away (under -80 dB after the gain), with a short fade. */
function trimmed(samples: Float32Array, gain: number): Float32Array {
  let last = samples.length - 1;
  while (last > 0 && Math.abs(samples[last] * gain) < 1e-4) last--;
  const end = Math.min(samples.length, last + Math.round(0.2 * SAMPLE_RATE));
  const out = samples.slice(0, end);
  const fade = Math.min(out.length, Math.round(0.2 * SAMPLE_RATE));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

const db = (x: number): number => 20 * Math.log10(x);

interface Rendered {
  readonly level: number;
  readonly part: (typeof PARTS)[number];
  readonly samples: Float32Array;
  readonly keys: number;
  readonly fingerprint: string;
  readonly lagMs: number;
  readonly driftMs: number;
}

function render(): void {
  const program = values.pianoteq;
  if (!program || !existsSync(program)) fail('Give Pianoteq’s program with --pianoteq (or PIANOTEQ).');
  if (!values.preset && !values.fxp) fail('Give the preset with --preset (or an FXP file with --fxp).');
  run('ffmpeg', ['-version']);
  const preset = values.preset ? ['--preset', values.preset] : ['--fxp', values.fxp ?? ''];
  const version =
    spawnSync(program, ['--headless', '--version'], { timeout: 30000 })
      .stdout.toString()
      .trim()
      .split('\n')[0] || 'Pianoteq';
  const work = mkdtempSync(join(tmpdir(), 'pianoteq-'));
  const rendered: Rendered[] = [];
  try {
    writeMidi(work);
    for (const { level, parts, events } of performed)
      for (const part of PARTS) {
        const mid = join(work, fileName(level, part, 'mid'));
        const wav = join(work, fileName(level, part, 'wav'));
        console.log(`×${level.toFixed(2)} ${part}: rendering`);
        run(program, ['--headless', ...preset, '--midi', mid, '--wav', wav, '--rate', String(SAMPLE_RATE)]);
        if (!existsSync(wav)) fail(`Pianoteq wrote no ${wav}`);
        const sound = readSound(wav);
        rmSync(wav);
        const strength = onsetStrength(sound, SAMPLE_RATE);
        const onsets = expectedOnsets(events[part]);
        const lag = findLag(strength, onsets);
        const driftMs = Number(lagDrift(strength, onsets, lag.ms).toFixed(1));
        const note = lag.clarity < CLEAR ? ' (uncertain!)' : '';
        console.log(`  lag ${lag.ms} ms, clarity ${lag.clarity.toFixed(1)}${note}, drift ${driftMs} ms`);
        rendered.push({
          level,
          part,
          samples: shifted(sound, lag.ms),
          keys: parts[part].keys.length,
          fingerprint: fingerprint(events[part]),
          lagMs: lag.ms,
          driftMs,
        });
      }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  // one gain for all: the piece at ×1 as loud as the sampled grand, no recording above the ceiling
  const existing = readManifest();
  const reference = rendered.find((r) => Math.abs(r.level - 1) < 1e-9 && r.part === 'piece');
  const loudnessGain = reference
    ? SAMPLER_LOUDNESS_DB - loudness(reference.samples, SAMPLE_RATE)
    : (existing?.gainDb ?? fail('Render ×1 as well: its loudness sets the gain of all levels.'));
  const ceilingGain = CEILING_DB - db(Math.max(...rendered.map((r) => peak(r.samples))));
  const gainDb = Number(Math.min(loudnessGain, ceilingGain).toFixed(2));
  if (ceilingGain < loudnessGain)
    console.warn(
      `The gain is held ${(loudnessGain - ceilingGain).toFixed(1)} dB under the sampler's loudness.`,
    );
  const gain = Math.pow(10, gainDb / 20);

  mkdirSync(OUT, { recursive: true });
  const parts = new Map<string, RecordedPart>();
  for (const r of rendered) {
    const samples = trimmed(r.samples, gain);
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
    const file = fileName(r.level, r.part, 'mp3');
    writeMp3(samples, join(OUT, file));
    parts.set(`${r.level}:${r.part}`, {
      file,
      keys: r.keys,
      fingerprint: r.fingerprint,
      seconds: Number((samples.length / SAMPLE_RATE).toFixed(2)),
      lagMs: r.lagMs,
      driftMs: r.driftMs,
    });
  }
  const renderedLevels = levels.map((level): RecordedLevel => ({
    level,
    piece: parts.get(`${level}:piece`) ?? fail(`no piece at ×${level}`),
    harmonies: parts.get(`${level}:harmonies`) ?? fail(`no harmonies at ×${level}`),
  }));
  const kept =
    existing?.step === step
      ? existing.levels.filter((l) => !levels.some((level) => Math.abs(level - l.level) < 1e-9))
      : [];
  if (existing && kept.length > 0 && Math.abs(existing.gainDb - gainDb) > 0.05)
    console.warn(`The levels rendered before have a gain of ${existing.gainDb} dB, these ${gainDb} dB.`);
  const manifest: RecordingsManifest = {
    instrument: values.instrument,
    credit: values.credit ?? `${values.instrument}, played by Pianoteq (Modartt)`,
    renderer: `${version}, preset “${values.preset ?? values.fxp ?? ''}”`,
    rendered: new Date().toISOString().slice(0, 10),
    step,
    gainDb,
    levels: [...kept, ...renderedLevels].sort((a, b) => a.level - b.level),
  };
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const listed = new Set(manifest.levels.flatMap((l) => [l.piece.file, l.harmonies.file]));
  for (const file of readdirSync(OUT))
    if (file.endsWith('.mp3') && !listed.has(file)) rmSync(join(OUT, file));
  console.log(`${manifest.levels.length} levels in piano/pianoteq/, gain ${gainDb} dB`);
}

function readManifest(): RecordingsManifest | null {
  const file = join(OUT, 'manifest.json');
  return existsSync(file) ? parseManifest(JSON.parse(readFileSync(file, 'utf8'))) : null;
}

const command = positionals[0];
if (command === 'midi') {
  const dir = values.out ?? mkdtempSync(join(tmpdir(), 'wm225-midi-'));
  writeMidi(dir);
  console.log(`${performed.length * 2} MIDI files in ${dir}`);
} else if (command === 'render') render();
else fail('npm run pianoteq -- render --pianoteq <program> --preset <name>   (or: midi --out <dir>)');
