// The voice rendered ahead, for the page to play (src/shared/voice-recordings.ts), as Pianoteq renders
// the piano ahead (tools/pianoteq.ts): for each setting of the elaboration the voice is rendered for
// (mix.ts: `RENDERED`), the setting prepared as a voice worker prepares it alone, and the whole voice
// rendered chunk by chunk as the workers render it when the page plays from the beginning, sample for
// sample as they do in Node (node-support.ts: `prepareLevel`, `renderLevel`; a browser's maths may
// round the last bit otherwise, see the README). Each setting's sound is written to voice/
// as a mono MP3, beside its plan (JSON, what a worker answers a plan request with, but where it
// starts), and listed in manifest.json with the fingerprint of its gestural scores and what
// `alignVoice` needs to find the rendering's first sample in the decoded sound. The MP3s are decoded
// again, by ffmpeg and, where Playwright is installed, by Chromium, and where the rendering lies in
// what they decode is measured: with the reference, as the page finds it, and without it.
//
//   npm run voices [-- --elaborations 1,0.65] [--jobs <threads>]
//
// Needs ffmpeg. The settings are rendered side by side, a VocalTractLab in each thread.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { RENDERED } from '../src/page/mix.ts';
import type { PlanBody } from '../src/shared/protocol.ts';
import { settingName } from '../src/shared/recordings.ts';
import { SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';
import {
  alignVoice,
  findLead,
  parseVoiceManifest,
  tableKey,
  voiceAlignment,
  VOICE_DIRECTORY,
  type RecordedVoice,
  type VoiceManifest,
} from '../src/shared/voice-recordings.ts';
import { DEFAULT_ELABORATION } from '../src/worker/levels.ts';
import { chromiumDecoder, decodeWithFfmpeg, hasFfmpeg, MP3_QUALITY, writeMp3 } from './mp3.ts';
import {
  loadCalibration,
  loadEngine,
  loadSpeaker,
  prepareLevel,
  renderLevel,
  ROOT,
  voiceFingerprint,
} from './node-support.ts';

const OUT = join(ROOT, VOICE_DIRECTORY);
const now = (): number => performance.now();
const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

/** What a thread sends back for a setting. */
interface Rendered {
  readonly elaboration: number;
  readonly plan: PlanBody;
  readonly fingerprint: string;
  readonly samples: Float32Array;
  readonly alignment: ReturnType<typeof voiceAlignment>;
  readonly ms: number;
}

/** A thread: one VocalTractLab, which renders each setting it is sent, one after another. */
async function renderInThread(): Promise<void> {
  const port = parentPort;
  if (!port) throw new Error('not a worker thread');
  const engine = await loadEngine();
  port.on('message', (elaboration: number) => {
    const t = now();
    const { voice, level } = prepareLevel(engine, elaboration);
    const samples = renderLevel(engine, level);
    const rendered: Rendered = {
      elaboration,
      plan: level.plan,
      fingerprint: voiceFingerprint(voice),
      samples,
      alignment: voiceAlignment(samples),
      ms: now() - t,
    };
    port.postMessage(rendered, [samples.buffer as ArrayBuffer]);
  });
  port.postMessage('ready');
}

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/**
 * VocalTractLab's sound as test/engine.test.ts takes it (`vtlAudio3to9s`): the states of the setting
 * at the page's first elaboration from 3 to 9 s, synthesized directly.
 */
async function engineFingerprint(): Promise<string> {
  const engine = await loadEngine();
  const { level } = prepareLevel(engine, DEFAULT_ELABORATION);
  const from = Math.round((3 * SAMPLE_RATE) / STATE_STEP);
  const to = Math.round((9 * SAMPLE_RATE) / STATE_STEP);
  const hash = createHash('sha256');
  for (const block of engine.synthesize(level.states, level.weight, from, to, { blockStates: 40 }))
    hash.update(new Uint8Array(block.samples.buffer, block.samples.byteOffset, block.samples.byteLength));
  return hash.digest('hex');
}

/** The normalized correlation of `x` from `a` with `y` from `b`, over `n` samples. */
function correlation(x: Float32Array, a: number, y: Float32Array, b: number, n: number): number {
  let c = 0;
  let e = 0;
  let f = 0;
  for (let j = 0; j < n; j++) {
    c += x[a + j] * y[b + j];
    e += x[a + j] * x[a + j];
    f += y[b + j] * y[b + j];
  }
  return c / Math.sqrt(e * f || 1);
}

/**
 * Where the rendering lies in the decoded sound, found without the reference: for the loudest stretch
 * of 4096 samples in each third of the rendering, the lag within `window` either way at which the
 * decoded sound is most like it, sample by sample.
 */
function leadsWithoutReference(rendering: Float32Array, decoded: Float32Array, window: number): number[] {
  const n = 4096;
  const thirds = [0, 1, 2].map((k) => Math.floor((k * rendering.length) / 3));
  return thirds.map((start) => {
    let loudest = { at: start + window, power: -1 };
    for (
      let at = start + window;
      at + n + window < Math.min(rendering.length, start + rendering.length / 3);
      at += n
    ) {
      let power = 0;
      for (let j = 0; j < n; j++) power += rendering[at + j] * rendering[at + j];
      if (power > loudest.power) loudest = { at, power };
    }
    let best = { lag: 0, r: -Infinity };
    for (let lag = -window; lag <= window; lag++) {
      const b = loudest.at + lag;
      if (b < 0 || b + n > decoded.length) continue;
      const r = correlation(rendering, loudest.at, decoded, b, n);
      if (r > best.r) best = { lag, r };
    }
    return best.lag;
  });
}

/** How the aligned sound compares with the rendering: its error, and against it moved by a sample. */
function compare(
  rendering: Float32Array,
  aligned: Float32Array,
): {
  snrDb: number;
  snrNextDb: [number, number];
  maxError: number;
  offset: number;
} {
  const n = rendering.length;
  let signal = 0;
  let maxError = 0;
  const error = [0, 0, 0];
  const product = [0, 0, 0];
  for (let i = 1; i < n - 1; i++) {
    const x = rendering[i];
    signal += x * x;
    maxError = Math.max(maxError, Math.abs(aligned[i] - x));
    for (let d = -1; d <= 1; d++) {
      const e = aligned[i + d] - x;
      error[d + 1] += e * e;
      product[d + 1] += aligned[i + d] * x;
    }
  }
  const db = (e: number): number => Number((10 * Math.log10(signal / e)).toFixed(1));
  // the peak of the correlation between samples, by the parabola through it and its neighbours
  const [p0, p1, p2] = product;
  const offset = (p0 - p2) / (2 * (p0 - 2 * p1 + p2));
  return { snrDb: db(error[1]), snrNextDb: [db(error[0]), db(error[2])], maxError, offset };
}

async function main(): Promise<void> {
  const started = now();
  const { values } = parseArgs({
    options: { elaborations: { type: 'string' }, jobs: { type: 'string' } },
  });
  if (!hasFfmpeg()) fail('The voice’s recordings need ffmpeg (on a Mac: brew install ffmpeg).');
  const among = (list: readonly number[], e: number): boolean => list.some((x) => Math.abs(x - e) < 1e-9);
  const elaborations = values.elaborations ? values.elaborations.split(',').map(Number) : [...RENDERED];
  const offStep = elaborations.filter((e) => !among(RENDERED, e));
  if (offStep.length > 0)
    fail(`elaborations the voice is not rendered for: ${offStep.join(', ')} (it is: ${RENDERED.join(', ')})`);
  const jobs = Math.max(1, Math.min(Number(values.jobs ?? availableParallelism()), elaborations.length));

  // the settings side by side: each thread is sent the next once it has sent one back
  const queue = [...elaborations];
  const arrived: Rendered[] = [];
  let wake: () => void = () => undefined;
  const threads = Array.from({ length: jobs }, () => {
    const thread = new Worker(new URL(import.meta.url));
    thread.on('message', (message: Rendered | 'ready') => {
      if (message !== 'ready') {
        arrived.push(message);
        wake();
      }
      const e = queue.shift();
      if (e === undefined) void thread.terminate();
      else thread.postMessage(e);
    });
    thread.on('error', (error) => fail(`a thread failed: ${error.stack ?? error.message}`));
    return thread;
  });
  console.log(
    `${elaborations.length} settings in ${threads.length} threads, as MP3 at LAME's V${MP3_QUALITY}`,
  );

  const gain = loadCalibration().gain;
  const speaker = sha256(loadSpeaker());
  const engine = await engineFingerprint();
  const golden = (JSON.parse(readFileSync(join(ROOT, 'test/golden.json'), 'utf8')) as Record<string, string>)[
    'vtlAudio3to9s'
  ];
  if (engine !== golden)
    console.warn('VocalTractLab sounds otherwise than test/golden.json has it (vtlAudio3to9s).');

  const chromium = await chromiumDecoder();
  if (!chromium) console.warn('Without Playwright the decoded sound is measured in ffmpeg alone.');
  else console.log(`decoding in ffmpeg and ${chromium.version}`);
  mkdirSync(OUT, { recursive: true });
  const recorded: RecordedVoice[] = [];
  let renderMs = 0;
  try {
    while (recorded.length < elaborations.length) {
      const rendered = arrived.shift();
      if (!rendered) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      renderMs += rendered.ms;
      recorded.push(await record(rendered, chromium));
    }
  } finally {
    await chromium?.close();
  }

  const existing = readManifest();
  const same =
    existing?.table === tableKey() &&
    existing.gain === gain &&
    existing.speaker === speaker &&
    existing.engine === engine;
  const others = existing?.settings.filter((s) => !among(elaborations, s.elaboration)) ?? [];
  const kept = same ? others.filter((s) => among(RENDERED, s.elaboration)) : [];
  if (kept.length < others.length)
    console.warn(
      'Settings rendered before of another table, gain, speaker or VocalTractLab leave the manifest.',
    );
  const manifest: VoiceManifest = {
    version: 1,
    rendered: new Date().toISOString().slice(0, 10),
    table: tableKey(),
    sampleRate: SAMPLE_RATE,
    gain,
    speaker,
    engine,
    settings: [...kept, ...recorded].sort((a, b) => a.elaboration - b.elaboration),
  };
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const listed = new Set(manifest.settings.flatMap((s) => [s.file, s.plan]));
  for (const file of readdirSync(OUT))
    if ((file.endsWith('.mp3') || file.endsWith('.json')) && file !== 'manifest.json' && !listed.has(file))
      rmSync(join(OUT, file));
  const bytes = manifest.settings.reduce((sum, s) => sum + readFileSync(join(OUT, s.file)).length, 0);
  console.log(
    `${manifest.settings.length} settings in ${VOICE_DIRECTORY}, ${(bytes / 1e6).toFixed(1)} MB of MP3, in ` +
      `${((now() - started) / 1000).toFixed(0)} s (rendering ${(renderMs / 1000).toFixed(0)} s in all)`,
  );
}

/** Write a setting's plan and sound, and measure where the decoders put the rendering. */
async function record(
  rendered: Rendered,
  chromium: Awaited<ReturnType<typeof chromiumDecoder>>,
): Promise<RecordedVoice> {
  const { elaboration, samples, alignment } = rendered;
  const name = settingName(elaboration);
  const file = `${name}.mp3`;
  const plan = `${name}.json`;
  writeFileSync(join(OUT, plan), JSON.stringify(rendered.plan));
  writeMp3(samples, join(OUT, file));
  const size = readFileSync(join(OUT, file)).length;
  const seconds = samples.length / SAMPLE_RATE;
  const draft = {
    elaboration,
    file,
    plan,
    samples: samples.length,
    align: alignment,
    fingerprint: rendered.fingerprint,
  };
  const decoded: ['ffmpeg' | 'chromium', Float32Array][] = [['ffmpeg', decodeWithFfmpeg(join(OUT, file))]];
  if (chromium) {
    const sound = await chromium.decode(join(OUT, file));
    if (sound.sampleRate !== SAMPLE_RATE || sound.channels !== 1)
      fail(`Chromium decoded ${file} at ${sound.sampleRate} Hz in ${sound.channels} channels`);
    decoded.push(['chromium', sound.stretches[0]]);
  }
  const measured: Partial<Record<'ffmpeg' | 'chromium', number>> = {};
  const lines: string[] = [];
  for (const [decoder, sound] of decoded) {
    const found = findLead(sound, draft) ?? fail(`${decoder}: the reference of ${file} was not found`);
    const without = leadsWithoutReference(samples, sound, alignment.window);
    measured[decoder] = found.lead;
    const aligned = alignVoice(sound, { ...draft, align: { ...alignment, lead: found.lead } });
    const c = compare(samples, aligned);
    if (c.snrDb < 30) fail(`${decoder}: ${file} aligned is only ${c.snrDb} dB above its error`);
    lines.push(
      `  ${decoder}: lead ${found.lead} (match ${found.match.toFixed(5)}), without the reference ` +
        `${without.join(', ')}; ${c.snrDb} dB above the error (${c.snrNextDb.join(' and ')} a sample ` +
        `off), at most ${c.maxError.toFixed(4)}, ${c.offset.toFixed(3)} samples off between samples; ` +
        `${sound.length - samples.length} samples more than the rendering`,
    );
  }
  const leads = new Set(Object.values(measured));
  if (leads.size > 1)
    console.warn(`The decoders put ${file} at different leads: ${JSON.stringify(measured)}`);
  const lead = measured.chromium ?? measured.ffmpeg ?? 0;
  console.log(
    `${elaboration.toFixed(2)}: ${seconds.toFixed(1)} s, rendered in ${(rendered.ms / 1000).toFixed(0)} s; ` +
      `${(size / 1e6).toFixed(2)} MB (${((size * 8) / seconds / 1000).toFixed(1)} kbit/s); the reference at ` +
      `${(alignment.at / SAMPLE_RATE).toFixed(2)} s, its rival ${alignment.rival}\n${lines.join('\n')}`,
  );
  return { ...draft, align: { lead, ...alignment, measured } };
}

function readManifest(): VoiceManifest | null {
  const file = join(OUT, 'manifest.json');
  return existsSync(file) ? parseVoiceManifest(JSON.parse(readFileSync(file, 'utf8'))) : null;
}

if (isMainThread) await main();
else await renderInThread();
