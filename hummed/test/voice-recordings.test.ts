// The voice rendered ahead (npm run voices): its manifest, that each setting's recording is of the
// voice and the piano as they are now, and that `alignVoice` finds the rendering in the sound however
// the decoder treats the encoder's delay. After a change to the voice, the reconstruction, the
// harmonies or the table of points, render them again (npm run voices).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { RENDERED } from '../src/page/mix.ts';
import { chunkOrder, type Chunk } from '../src/shared/chunks.ts';
import { seededRandom } from '../src/shared/math.ts';
import { fingerprint, midiEvents } from '../src/shared/piano.ts';
import { ManifestError } from '../src/shared/recordings.ts';
import { SAMPLE_RATE, STATE_STEP } from '../src/shared/units.ts';
import {
  alignVoice,
  findLead,
  parsePlan,
  parseVoiceManifest,
  REFERENCE_LENGTH,
  tableKey,
  voiceAlignment,
  VOICE_DIRECTORY,
  type RecordedVoice,
} from '../src/shared/voice-recordings.ts';
import { shapeAt } from '../src/worker/levels.ts';
import { performPiano } from '../src/worker/piano.ts';
import { planOf } from '../src/worker/prepare.ts';
import {
  chromiumDecoder,
  decodeWithFfmpeg,
  fromStretches,
  hasFfmpeg,
  withoutGaplessInfo,
} from '../tools/mp3.ts';
import {
  humAt,
  loadCalibration,
  loadEngine,
  loadMaterials,
  loadPianoScore,
  loadSpeaker,
  prepareLevel,
  renderLevel,
  ROOT,
  voiceFingerprint,
} from '../tools/node-support.ts';

const RENDER_AGAIN = 'npm run voices';
const DIRECTORY = join(ROOT, VOICE_DIRECTORY);
const MANIFEST = join(DIRECTORY, 'manifest.json');

/** How alike two sounds are: how far (dB) the one lies above its difference from the other. */
function snrDb(x: Float32Array, y: Float32Array, from = 0, to = x.length): number {
  let signal = 0;
  let error = 0;
  for (let i = from; i < to; i++) {
    signal += x[i] * x[i];
    error += (y[i] - x[i]) ** 2;
  }
  return 10 * Math.log10(signal / error);
}

describe('the voice’s manifest', () => {
  const setting = {
    elaboration: 1,
    file: 'e100.mp3',
    plan: 'e100.json',
    samples: 100,
    align: { lead: 0 },
    fingerprint: 'x',
  };
  const manifest = { version: 1, rendered: '2026-11-26', table: tableKey(), sampleRate: 44100 };

  it('says nothing is rendered while it lists no settings', () => {
    assert.equal(parseVoiceManifest({ version: 1, settings: [] }), null);
  });
  it('refuses another version, and a setting without its alignment', () => {
    assert.throws(() => parseVoiceManifest({ ...manifest, version: 2, settings: [setting] }), ManifestError);
    const without = { ...setting, align: undefined };
    assert.throws(() => parseVoiceManifest({ ...manifest, settings: [without] }), ManifestError);
  });
  it('reads what the sound was made with where it says', () => {
    const read = parseVoiceManifest({ ...manifest, gain: 5, speaker: 'a', engine: 'b', settings: [setting] });
    assert.deepEqual(read, { ...manifest, gain: 5, speaker: 'a', engine: 'b', settings: [setting] });
    assert.deepEqual(parseVoiceManifest({ ...manifest, settings: [setting] })?.settings, [setting]);
    assert.throws(() => parseVoiceManifest({ ...manifest, gain: '5', settings: [setting] }), ManifestError);
  });
  it('keys the table of points', () => {
    assert.match(tableKey(), /^[0-9a-f]{8}$/);
    assert.notEqual(tableKey({ points: [0, 1] }), tableKey({ points: [0, 0.5, 1] }));
  });
  it('refuses a plan that is not one', () => {
    assert.throws(() => parsePlan({ type: 'audio' }), ManifestError);
  });
});

describe('finding the rendering in the decoded sound', () => {
  // six seconds as a rendering begins: silence, a breath, the voice coming up, a note held with a
  // wobble and a step to the next, then the same note again
  const random = seededRandom(11);
  const rendering = new Float32Array(6 * SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < rendering.length; i++) {
    const t = i / SAMPLE_RATE;
    const note = [0, 2, 0, 5, 0][Math.min(4, Math.floor((t - 1) / 1))] ?? 0;
    const f0 = 98 * 2 ** (note / 12 + 0.02 * Math.sin(2 * Math.PI * 5.3 * t));
    phase += (2 * Math.PI * f0) / SAMPLE_RATE;
    const voice = t < 1 ? 0 : 0.08 * Math.min(1, (t - 1) / 0.2);
    let harmonics = 0;
    for (let h = 1; h <= 10; h++) harmonics += Math.sin(h * phase) / h;
    const breath = t > 0.6 && t < 0.9 ? 0.01 * random.normal(0, 1) : 0;
    rendering[i] = voice * harmonics + breath;
  }
  const align = { lead: 0, ...voiceAlignment(rendering) };
  const recorded: RecordedVoice = {
    elaboration: 1,
    file: 'x.mp3',
    plan: 'x.json',
    samples: rendering.length,
    align,
    fingerprint: '',
  };
  // as a decoder hands it over: late by `lead`, with the coding's noise 40 dB down, padded at the end
  const decoded = (lead: number): Float32Array => {
    const noise = seededRandom(lead + 5000);
    const out = new Float32Array(rendering.length + lead + 1500);
    for (let i = 0; i < rendering.length; i++)
      if (i + lead >= 0) out[i + lead] = rendering[i] + 8e-4 * noise.normal(0, 1);
    return lead >= 0 ? out : out.subarray(0, rendering.length + lead);
  };

  it('keeps a reference like nothing else within its window', () => {
    assert.ok(align.rival < 0.8, `its rival ${align.rival}`);
    assert.equal(align.window, 4096);
  });

  // in time (Chromium, Firefox, ffmpeg); late by the decoder's own delay, by LAME's encoder delay and
  // the decoder's, and by those and the gapless frame decoded as silence; a little early
  for (const lead of [0, 529, 1105, 2257, -300])
    it(lead < 0 ? `finds it ${-lead} samples early` : `finds it ${lead} samples late`, () => {
      const sound = decoded(lead);
      assert.equal(findLead(sound, recorded)?.lead, lead);
      const aligned = alignVoice(sound, recorded);
      assert.equal(aligned.length, rendering.length);
      const db = snrDb(rendering, aligned, Math.max(0, -lead), rendering.length - 1);
      assert.ok(db > 35, `${db.toFixed(1)} dB`);
      // and not a sample off
      assert.ok(snrDb(rendering, aligned.subarray(1), Math.max(0, -lead), rendering.length - 1) < db - 6);
    });

  it('falls back on the lead measured where the reference is not in the sound', () => {
    const noise = seededRandom(3);
    const sound = Float32Array.from({ length: rendering.length + 2000 }, () => 0.05 * noise.normal(0, 1));
    const late = { ...recorded, align: { ...align, lead: 1105 } };
    assert.equal(findLead(sound, late), null);
    assert.deepEqual(alignVoice(sound, late), sound.slice(1105, 1105 + rendering.length));
  });
});

const manifest = existsSync(MANIFEST) ? parseVoiceManifest(JSON.parse(readFileSync(MANIFEST, 'utf8'))) : null;
const plans = new Map(
  (manifest?.settings ?? []).map((s) => [
    s.elaboration,
    parsePlan(JSON.parse(readFileSync(join(DIRECTORY, s.plan), 'utf8'))),
  ]),
);
const planOfSetting = (s: RecordedVoice) => plans.get(s.elaboration) ?? assert.fail(`no plan ${s.plan}`);

describe('the recordings in voice/', { skip: manifest ? false : 'none rendered yet' }, () => {
  const settings = manifest?.settings ?? [];

  it('are of every setting the voice is rendered for, of this table of points', () => {
    assert.equal(manifest?.table, tableKey(), `rendered for another table of points: ${RENDER_AGAIN}`);
    assert.deepEqual(
      settings.map((s) => s.elaboration),
      [...RENDERED],
      `not every setting is rendered: ${RENDER_AGAIN}`,
    );
    for (const s of settings) {
      assert.ok(existsSync(join(DIRECTORY, s.file)), `no ${s.file}: ${RENDER_AGAIN}`);
      const plan = planOfSetting(s);
      assert.equal(s.samples, (plan.stateCount - 1) * STATE_STEP);
      assert.deepEqual(plan.setting, { elaboration: s.elaboration });
    }
  });

  it('were rendered at the gain, with the speaker and the VocalTractLab there are now', () => {
    const golden = JSON.parse(readFileSync(join(ROOT, 'test/golden.json'), 'utf8')) as Record<string, string>;
    assert.ok(manifest);
    assert.equal(manifest.gain, loadCalibration().gain, `rendered at another gain: ${RENDER_AGAIN}`);
    const speaker = createHash('sha256').update(loadSpeaker()).digest('hex');
    assert.equal(manifest.speaker, speaker, `rendered with another speaker: ${RENDER_AGAIN}`);
    assert.equal(
      manifest.engine,
      golden['vtlAudio3to9s'],
      `rendered by another VocalTractLab: ${RENDER_AGAIN}`,
    );
  });

  it('are of the voice as it is now', () => {
    for (const s of settings) {
      const voice = humAt(s.elaboration);
      const message = `${s.elaboration} was rendered from another voice: ${RENDER_AGAIN}`;
      assert.equal(s.fingerprint, voiceFingerprint(voice), message);
      const plan = planOfSetting(s);
      assert.deepEqual(plan.bars, voice.bars, message);
      assert.deepEqual(plan.clock, { ticks: voice.clock.ticks, ms: voice.clock.ms }, message);
    }
  });

  it('play with the piano as it plays now', () => {
    for (const s of settings) {
      const plan = planOfSetting(s);
      const parts = performPiano(loadPianoScore(s.elaboration), shapeAt(s.elaboration));
      const message = `${s.elaboration} was planned with another piano: ${RENDER_AGAIN}`;
      for (const name of ['piece', 'harmonies'] as const)
        assert.equal(fingerprint(midiEvents(plan[name])), fingerprint(midiEvents(parts[name])), message);
      assert.deepEqual(plan.rolls, loadMaterials().pianoScore(s.elaboration).rolls, message);
    }
  });

  // the shortest chunk of any setting, the quickest to render afresh; the reference and that chunk
  // are all Chromium hands back of what it decodes
  const shortest = settings
    .flatMap((s) => chunkOrder({ ...planOfSetting(s), startState: 0 }).map((chunk) => ({ s, chunk })))
    .reduce<{ s: RecordedVoice; chunk: Chunk } | null>(
      (a, b) => (!a || b.chunk[1] - b.chunk[0] < a.chunk[1] - a.chunk[0] ? b : a),
      null,
    );
  it(
    'lie where the page finds them, sample for sample, as ffmpeg and Chromium decode them',
    { skip: hasFfmpeg() ? false : 'no ffmpeg' },
    async () => {
      if (!shortest) return;
      const { s: setting, chunk } = shortest;
      const [from, to] = chunk;
      const plan = planOfSetting(setting);
      const engine = await loadEngine();
      const { level } = prepareLevel(engine, setting.elaboration);
      // the plan as a worker makes it now, to the last digit
      assert.equal(JSON.stringify(level.plan), readFileSync(join(DIRECTORY, setting.plan), 'utf8'));
      assert.deepEqual(chunkOrder(planOf(level, 0, { seconds: 0 })), chunkOrder({ ...plan, startState: 0 }));
      const fresh = renderLevel(engine, level, [[from, to]]);
      const keep: [number, number] = [from * STATE_STEP, Math.min(to, plan.stateCount - 1) * STATE_STEP];
      const file = join(DIRECTORY, setting.file);
      const mp3 = new Uint8Array(readFileSync(file));
      const check = (what: string, sound: Float32Array, lead: number): void => {
        assert.equal(findLead(sound, setting)?.lead, lead, what);
        const aligned = alignVoice(sound, setting);
        const [a, b] = [keep[0], keep[1] - 1];
        const db = snrDb(fresh, aligned, a, b);
        assert.ok(db > 30, `${what}: ${db.toFixed(1)} dB`);
        // a sample off either way, the humming lies much less far above the difference
        assert.ok(snrDb(fresh, aligned.subarray(1), a, b) < db - 6, what);
        assert.ok(snrDb(fresh.subarray(1), aligned, a, b) < db - 6, what);
      };
      const ffmpeg = decodeWithFfmpeg(file);
      check('ffmpeg', ffmpeg, 0);
      check('ffmpeg without the gapless frame', decodeWithFfmpeg(withoutGaplessInfo(mp3)), 1105);
      for (const lead of [529, 2257]) {
        const late = new Float32Array(ffmpeg.length + lead);
        late.set(ffmpeg, lead);
        check(`ffmpeg, ${lead} samples late`, late, lead);
      }
      const chromium = await chromiumDecoder();
      if (!chromium) return;
      try {
        const at = Number(setting.align['at']);
        const window = Number(setting.align['window']);
        const stretches: [number, number][] = [[at - window - 16, at + REFERENCE_LENGTH + window + 16], keep];
        const decoded = await chromium.decode(file, stretches);
        assert.equal(decoded.sampleRate, SAMPLE_RATE);
        check('Chromium', fromStretches(decoded, stretches), 0);
      } finally {
        await chromium.close();
      }
    },
  );
});
