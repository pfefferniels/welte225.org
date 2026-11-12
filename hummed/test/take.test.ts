// A take: the sound read frame by frame, taken apart into the body's movements, and read against
// the roll.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SAMPLE_RATE } from '../src/shared/units.ts';
import { analyse, voicedFrames } from '../src/take/acoustics.ts';
import { emptyTracks, FRAME_RATE, frameOf, HOP, readBody, soundOf, type Tracks } from '../src/take/body.ts';
import { invert } from '../src/take/inversion.ts';
import { movementsOf, turnsOf, type Movements } from '../src/take/movements.ts';
import { fitDynamics, fitTempo, read, type TakeTiming } from '../src/take/reading.ts';
import {
  dateAt,
  readRoll,
  sectionOf,
  timeAt,
  withCorrections,
  type Correction,
  type Roll,
} from '../src/take/roll.ts';
import { performTake, takeMpm } from '../src/take/mpm.ts';
import { decodeWav, encodeWav, resample } from '../src/take/wav.ts';
import { loadEngine, loadSpeaker, ROOT } from '../tools/node-support.ts';

function loadRoll(): Roll {
  const file = (name: string): string => readFileSync(join(ROOT, '../mpm', name), 'utf8');
  const work = JSON.parse(file('work.json')) as {
    provenance: { name: string; options: { prefer?: string } }[];
  };
  const prefer = work.provenance.find((p) => p.name === 'MakeChoice')?.options.prefer;
  return readRoll(file('transcription.mei'), file('score.msm'), prefer);
}

/** A tone of harmonics falling off by 6 dB each, at a pitch and a level that may move. */
function tone(seconds: number, hz: (t: number) => number, amplitude: (t: number) => number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    phase += (2 * Math.PI * hz(t)) / SAMPLE_RATE;
    for (let h = 1; h <= 6; h++) out[i] += (amplitude(t) / 2 ** (h - 1)) * Math.sin(h * phase);
  }
  return out;
}

describe('the sound, frame by frame', () => {
  it('finds a pitch that moves, to a few cents', () => {
    const sound = analyse(
      tone(
        1.2,
        (t) => 110 * 2 ** t,
        () => 0.2,
      ),
    );
    for (const t of [0.3, 0.6, 0.9]) {
      const cents = 1200 * Math.log2(sound.f0[frameOf(t)] / (110 * 2 ** t));
      assert.ok(Math.abs(cents) < 10, `${cents.toFixed(1)} cents off at ${t} s`);
      assert.ok(sound.periodicity[frameOf(t)] > 0.9);
    }
  });

  it('follows the level, and tells voice from silence', () => {
    const samples = tone(
      1.5,
      () => 150,
      (t) => (t > 0.3 && t < 1.2 ? 0.1 * (t < 0.75 ? 1 : 2) : 0),
    );
    const sound = analyse(samples);
    const voiced = voicedFrames(sound);
    assert.equal(voiced[frameOf(0.1)], 0);
    assert.equal(voiced[frameOf(0.6)], 1);
    assert.equal(voiced[frameOf(1.4)], 0);
    const step = sound.level[frameOf(1)] - sound.level[frameOf(0.5)];
    assert.ok(Math.abs(step - 6.02) < 0.2, `a doubling read as ${step.toFixed(2)} dB`);
    assert.ok(
      sound.low[frameOf(0.6)] > sound.high[frameOf(0.6)] + 20,
      'most of the tone lies in the low band',
    );
  });
});

describe('a take as a WAV file', () => {
  it('comes back as it was written, to 16 bits', () => {
    const samples = tone(
      0.1,
      () => 220,
      () => 0.3,
    );
    const back = decodeWav(encodeWav(samples, SAMPLE_RATE));
    assert.equal(back.sampleRate, SAMPLE_RATE);
    assert.equal(back.samples.length, samples.length);
    for (let i = 0; i < samples.length; i += 97)
      assert.ok(Math.abs(back.samples[i] - samples[i]) < 1 / 16384);
  });

  it('is brought to another rate', () => {
    const at48 = tone(
      0.5,
      () => 200,
      () => 0.2,
    );
    const at44 = resample(at48, SAMPLE_RATE, 40000);
    assert.equal(at44.length, Math.floor((at48.length * 40000) / SAMPLE_RATE));
  });
});

describe('the turns of a curve', () => {
  const turns = (values: number[]): string =>
    turnsOf(Float32Array.from(values), 1.5)
      .map((t) => `${t.kind}@${t.at}`)
      .join(' ');

  it('are its peaks and troughs that stand out on both sides', () => {
    assert.equal(turns([0, 1, 2, 3, 2, 1, 0]), 'peak@3');
    assert.equal(turns([0, 0.5, -2, -3, -1, 1, 3, 2.5, 0]), 'trough@3 peak@6');
    assert.equal(turns([0, 3, 2.9, 3.1, 0, 2, 0]), 'peak@3 trough@4 peak@5');
  });

  it('are none where the curve only falls, or only wavers', () => {
    assert.equal(turns([3, 2, 1, 0]), '');
    assert.equal(turns([0, 1, 0.2, 1.1, 0.1, 1]), '');
  });
});

/** Tracks of a voice that sings two phrases with a breath between: a swell, then a fall. */
function twoPhrases(): { tracks: Tracks; voiced: Uint8Array } {
  const n = Math.round(6 * FRAME_RATE);
  const tracks = emptyTracks(n);
  const voiced = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / FRAME_RATE;
    const first = t >= 0.5 && t < 3;
    const second = t >= 3.5 && t < 5.5;
    if (!first && !second) continue;
    voiced[i] = 1;
    tracks.f0[i] = t < 1.8 ? 110 : first ? 147 : 131;
    // the first phrase swells to its middle (1.75 s) by 12 dB and comes back; the second falls by 9
    const db = first ? -12 + 12 * Math.sin((Math.PI * (t - 0.5)) / 2.5) : -9 * ((t - 3.5) / 2);
    tracks.pressure[i] = 7000 * 10 ** (db / 20);
  }
  return { tracks, voiced };
}

describe('the movements of a voice', () => {
  const { tracks, voiced } = twoPhrases();
  const movements = movementsOf(tracks, voiced, new Float32Array(tracks.count).fill(-30));

  it('has its phrases and the breath between them', () => {
    assert.equal(movements.phrases.length, 2);
    assert.equal(movements.breaths.length, 1);
    assert.ok(
      Math.abs(movements.breaths[0].from - 3) < 0.02 && Math.abs(movements.breaths[0].to - 3.5) < 0.02,
    );
  });

  it('has the swell, its turn, and the fall', () => {
    assert.deepEqual(
      movements.swells.map((s) => s.kind),
      ['grow', 'shrink', 'shrink'],
    );
    assert.equal(movements.turns.length, 1);
    assert.equal(movements.turns[0].kind, 'peak');
    assert.ok(Math.abs(movements.turns[0].at - 1.75) < 0.1, `the peak found at ${movements.turns[0].at} s`);
    // a sine's rise makes half of its way in its first third
    assert.ok(movements.swells[0].halfAt < 0.45);
  });

  it('has the notes, the second by a slide', () => {
    assert.deepEqual(
      movements.notes.map((note) => note.onset),
      ['breath', 'slide', 'breath'],
    );
    assert.ok(Math.abs(movements.notes[1].from - 1.8) < 0.05);
  });

  it('runs over a dip that only begins a note', () => {
    const dipped = { ...tracks, pressure: tracks.pressure.slice() };
    for (let i = frameOf(1.0); i < frameOf(1.08); i++) dipped.pressure[i] *= 0.2;
    const again = movementsOf(dipped, voiced, new Float32Array(tracks.count).fill(-30));
    assert.equal(again.turns.length, 1);
  });
});

describe('the roll', () => {
  const roll = loadRoll();

  it('has the recorded notes with the notes they play', () => {
    assert.equal(roll.notes.length, 450);
    assert.equal(roll.notes[0].onset, 0);
    assert.equal(roll.notes[0].date, 0);
    assert.ok(roll.notes.every((n) => n.end > n.onset && n.velocity > 0));
  });

  it('has an upbeat and 32 bars', () => {
    assert.equal(roll.bars[0].number, 0);
    assert.equal(roll.bars[0].length, 720);
    assert.equal(roll.bars.at(-1)?.number, 32);
    assert.deepEqual(sectionOf(roll, 1, 4), { firstBar: 1, lastBar: 4, from: 0, to: 12240 });
    assert.equal(sectionOf(roll, 2, 2).from, 3600);
  });

  it("takes the reconstruction's corrections of the velocities, as the dynamics are fitted to them", () => {
    const work = JSON.parse(readFileSync(join(ROOT, '../mpm/work.json'), 'utf8')) as {
      provenance: Correction[];
    };
    const corrected = withCorrections(roll, work.provenance);
    const at = (r: Roll, date: number): number => r.chords.find((c) => c.date === date)?.velocity ?? NaN;
    // the published MPM's dynamics begin at these values (mpm/performance.mpm)
    assert.equal(at(roll, 0), 41);
    assert.ok(Math.abs(at(corrected, 0) - 28.2105) < 1e-3);
    assert.ok(Math.abs(at(corrected, 2520) - 21.3684) < 1e-3);
    // a spread chord counts as its loudest note: 35, 35 and 42 as recorded
    assert.ok(Math.abs(at(corrected, 4320) - 29.5789) < 1e-3);
    // the four notes at 1440, mapped and then taken down by six steps
    assert.ok(Math.abs(at(corrected, 1440) - 14) < 1e-9);
  });

  it('tells the time of a score position and back', () => {
    for (const date of [0, 1000, 5000, 40000])
      assert.ok(Math.abs(dateAt(roll, timeAt(roll, date)) - date) < 1e-6);
    assert.equal(timeAt(roll, roll.chords[3].date), roll.chords[3].first);
  });
});

describe('a tempo fitted to a clock', () => {
  it('is constant where the clock is', () => {
    const points = [0, 720, 1440, 2160].map((date) => ({ date, time: date / 720 }));
    const tempo = fitTempo(points, 0, 2160, 0.25);
    assert.ok(tempo && tempo.transitionTo === undefined);
    assert.ok(Math.abs(tempo.bpm - 60) < 1e-6);
  });

  it('slows down where the clock does', () => {
    // beats of 1, 1.1, 1.25, 1.45 s
    const times = [0, 1, 2.1, 3.35, 4.8];
    const tempo = fitTempo(
      times.map((time, i) => ({ date: i * 720, time })),
      0,
      2880,
      0.25,
    );
    assert.ok(tempo?.transitionTo !== undefined);
    assert.ok(tempo.bpm > 58 && tempo.transitionTo < 45, `${tempo.bpm} → ${tempo.transitionTo}`);
  });
});

describe('the dynamics fitted through points, as the desk fits them', () => {
  it('is a constant for one point and a straight ramp for two', () => {
    assert.deepEqual(fitDynamics([{ date: 0, velocity: 30 }]), { date: 0, endDate: 0, volume: 30 });
    const ramp = fitDynamics([
      { date: 0, velocity: 30 },
      { date: 720, velocity: 40 },
    ]);
    assert.deepEqual(ramp, {
      date: 0,
      endDate: 720,
      volume: 30,
      transitionTo: 40,
      curvature: 0.5,
      protraction: 0,
    });
  });

  it('bends to points that lie off the ramp, the same way every time', () => {
    // most of the way up within the first quarter of the stretch
    const points = [0, 180, 360, 720, 1440].map((date, i) => ({ date, velocity: [20, 32, 37, 39, 40][i] }));
    const bent = fitDynamics(points);
    assert.ok(bent?.curvature !== undefined && bent.protraction !== undefined);
    assert.ok(bent.curvature !== 0.5 || bent.protraction !== 0, 'not the straight ramp it set out from');
    assert.deepEqual(fitDynamics(points), bent);
  });
});

describe('a take read against the roll', () => {
  const roll = loadRoll();
  const section = sectionOf(roll, 1, 4);
  // the take begins half a second before the roll; the voice breathes at the second bar's downbeat
  const start = -0.5;
  const downbeat = timeAt(roll, 3600);
  const end = timeAt(roll, section.to);
  const n = frameOf(end - start + 0.5);
  const tracks = emptyTracks(n);
  const voiced = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / FRAME_RATE + start;
    const first = t >= 0 && t < downbeat - 0.3;
    if (!first && !(t >= downbeat && t < end)) continue;
    voiced[i] = 1;
    // a swell over the first bar to its middle, a fall through the others
    const db = first
      ? -10 + 10 * Math.sin((Math.PI * t) / (downbeat - 0.3))
      : -8 * ((t - downbeat) / (end - downbeat));
    tracks.pressure[i] = 7000 * 10 ** (db / 20);
  }
  const movements: Movements = movementsOf(tracks, voiced, new Float32Array(n).fill(-30));
  // taps on every quarter, 40 ms early; on a spread chord, on its last note
  const beats = Array.from({ length: 16 }, (_, k) => 720 + k * 720).filter((date) => date < section.to);
  const taps = beats.map((date) => {
    const chord = roll.chords.find((c) => c.date === date);
    return (chord ? chord.last : timeAt(roll, date)) - 0.04 - start;
  });
  const timing: TakeTiming = { section, start, taps, pulse: 720 };
  let count = 0;
  const reading = read(roll, timing, movements, { id: () => `call-${++count}` });

  it('knows how the tapper taps, and where the beat falls where no note sounds', () => {
    assert.ok(Math.abs(reading.tapLead + 0.04) < 0.005, `the taps' lead read as ${reading.tapLead}`);
    assert.deepEqual(
      reading.silentOnsets.map((s) => s.date),
      [2160, 5040],
    );
    assert.equal(reading.tapLeadFrom, 'take');
    assert.ok(Math.abs(reading.silentOnsets[0].onset - timeAt(roll, 2160)) < 0.005);
  });

  it("takes the tapper's lead from an earlier take where this one has too few chords struck at once", () => {
    const short: TakeTiming = { ...timing, section: sectionOf(roll, 1, 1), taps: taps.slice(0, 4) };
    assert.equal(read(roll, short, movements).tapLeadFrom, 'none');
    const told = read(roll, short, movements, { tapLead: -0.04 });
    assert.equal(told.tapLeadFrom, 'earlier');
    assert.equal(told.tapLead, -0.04);
  });

  it('places the spread chords by the taps', () => {
    const tapped = reading.spreads.filter((s) => s.position !== null);
    assert.ok(tapped.length >= 3);
    assert.ok(tapped.every((s) => s.placement === 'before-beat'));
  });

  it('begins a movement where the voice turns and where it breathes', () => {
    assert.deepEqual(
      reading.boundaries.map((b) => b.kind),
      ['start', 'peak', 'breath', 'end'],
    );
    assert.equal(reading.boundaries[2].date, 3600);
    assert.deepEqual(
      reading.gestures.map((g) => g.kind),
      ['grow', 'shrink', 'shrink'],
    );
  });

  it('writes each movement as a tempo and a dynamics call over the same stretch', () => {
    const of = (name: string): string[] =>
      reading.calls.filter((c) => c.name === name).map((c) => `${c.range.from}-${c.range.to}`);
    assert.deepEqual(of('InsertTempo'), of('InsertDynamicsInstructions'));
    assert.equal(of('InsertTempo').length, 3);
    const tempo = reading.calls.find((c) => c.name === 'InsertTempo');
    assert.deepEqual(
      Object.keys(tempo?.options ?? {})
        .sort()
        .slice(0, 3),
      ['beatLength', 'bpm', 'from'],
    );
    assert.equal(new Set(reading.calls.map((c) => c.id)).size, reading.calls.length);
  });

  it("draws what the calls come to: a tempo and a dynamics curve for each movement, and each spread's beat", () => {
    assert.equal(reading.fitted.tempo.length, 3);
    assert.equal(reading.fitted.dynamics.length, 3);
    for (const curve of [...reading.fitted.tempo, ...reading.fitted.dynamics]) {
      assert.ok(curve.points.every((p) => Number.isFinite(p.time) && Number.isFinite(p.value)));
      assert.ok(curve.points.every((p, i) => i === 0 || p.time >= curve.points[i - 1].time));
    }
    assert.ok(reading.clock.every((p, i) => i === 0 || p.date > reading.clock[i - 1].date));
    for (const s of reading.spreads) assert.ok(s.beat >= s.first && s.beat <= s.last);
  });

  it('gives a movement a value where it ends, even where the voice is silent', () => {
    // nothing but a boundary at a silent beat: the voice breathes through the first bar's third beat
    const silent = movementsOf(emptyTracks(n), new Uint8Array(n), new Float32Array(n).fill(-30));
    const marked: Movements = { ...silent, turns: [{ at: timeAt(roll, 2160) - start, kind: 'peak', db: 0 }] };
    const told = read(roll, timing, marked);
    assert.deepEqual(
      told.betweens.map((v) => [v.date, v.voiced]),
      [[2160, false]],
    );
    assert.equal(told.betweens[0].velocity, Math.round(told.betweens[0].line));
  });

  it('says what the voice does between the notes: the swell where no note sounds', () => {
    const phantoms = reading.calls
      .filter((c) => c.name === 'InsertDynamicsInstructions')
      .flatMap((c) => (c.options['phantomVelocities'] as { value: [number, number][] }).value);
    // the first bar's third beat has no note (2160), and the voice is at its fullest about there
    const at = phantoms.find(([date]) => date === 2160);
    assert.ok(at, 'a value at the silent beat');
    const [before, after] = [
      roll.chords.findLast((c) => c.date < 2160),
      roll.chords.find((c) => c.date > 2160),
    ];
    assert.ok(
      before && after && at[1] > Math.max(before.velocity, after.velocity),
      'above both its neighbours',
    );
  });
});

describe('a voice taken apart', () => {
  it('gives back the lungs, the folds, the lips and the pitch of a voice the model sang', async () => {
    const engine = await loadEngine();
    const body = readBody(loadSpeaker());
    const n = Math.round(2.4 * FRAME_RATE);
    const truth = emptyTracks(n);
    for (let i = 0; i < n; i++) {
      const t = i / FRAME_RATE;
      const sounding = t >= 0.2 && t < 2.2;
      truth.f0[i] = t < 1.2 ? 120 : 150;
      truth.pressure[i] = sounding ? 3000 + 5000 * Math.sin((Math.PI * (t - 0.2)) / 2) : 0;
      truth.adduction[i] = 0.3 + 0.3 * (t / 2.4);
      truth.opening[i] = t > 1.3 && t < 2 ? 0.4 * Math.sin((Math.PI * (t - 1.3)) / 0.7) : 0;
    }
    const sound = soundOf(engine, body, truth);
    assert.equal(sound.length, n * HOP);
    const { tracks, voiced, misfits } = invert(engine, body, sound, { equalize: false, anchor: 7800 });
    assert.ok((misfits.at(-1)?.level ?? Infinity) < 0.5, 'the copy lies on the voice in level');
    const off = { pressure: 0, adduction: 0, opening: 0, cents: 0 };
    let count = 0;
    for (let i = frameOf(0.4); i < frameOf(2.1); i++) {
      if (!voiced[i]) continue;
      off.pressure += Math.abs(20 * Math.log10(tracks.pressure[i] / truth.pressure[i]));
      off.adduction += Math.abs(tracks.adduction[i] - truth.adduction[i]);
      off.opening += Math.abs(tracks.opening[i] - truth.opening[i]);
      off.cents += Math.abs(1200 * Math.log2(tracks.f0[i] / truth.f0[i]));
      count++;
    }
    assert.ok(count > 300);
    assert.ok(off.pressure / count < 1.5, `the lungs off by ${(off.pressure / count).toFixed(2)} dB`);
    // the folds are the least certain: their band is faint, and the lips colour it as they part
    assert.ok(off.adduction / count < 0.3, `the folds off by ${(off.adduction / count).toFixed(2)}`);
    assert.ok(off.opening / count < 0.08, `the lips off by ${(off.opening / count).toFixed(3)}`);
    assert.ok(off.cents / count < 25, `the pitch off by ${(off.cents / count).toFixed(1)} cents`);
  });
});

/** A roll of one voice in 4/4: a note at each date, sounding at the time given, all as loud. */
function smallRoll(notes: readonly { date: number; time: number; velocity?: number }[]): {
  roll: Roll;
  msm: string;
} {
  const length = 360;
  const msm =
    '<msm title="" pulsesPerQuarter="720"><global><header /><dated /></global>' +
    '<part name="" number="1" midi.channel="0" midi.port="0"><header /><dated>' +
    '<timeSignatureMap><timeSignature date="0" numerator="4" denominator="4" /></timeSignatureMap><score>' +
    notes
      .map((n, i) => `<note xml:id="n${i}" date="${n.date}" midi.pitch="60" duration="${length}" />`)
      .join('') +
    '</score></dated></part></msm>';
  const mei =
    '<recording source="s">' +
    notes
      .map(
        (n, i) =>
          `<when absolute="${Math.round(n.time * 1000)}ms" data="#n${i}"><extData type="velocity">${n.velocity ?? 40}</extData>` +
          '<extData type="duration">300ms</extData></when>',
      )
      .join('') +
    '</recording>';
  return { roll: readRoll(mei, msm, 's'), msm };
}

describe('what the tempo and the dynamics leave', () => {
  // two bars at 60 beats a minute; within each beat the eighth comes late or early by a power
  const intensity = 1.3;
  const eighth = 0.5 ** intensity;
  const dates = Array.from({ length: 17 }, (_, k) => k * 360);
  const { roll, msm } = smallRoll(
    dates.map((date, k) => ({
      date,
      time: Math.floor(k / 2) + (k % 2 ? eighth : 0),
      // louder on the beats than between them, about a level that does not move
      velocity: k % 2 ? 36 : 44,
    })),
  );
  const section = sectionOf(roll, 1, 2);
  const silent = movementsOf(emptyTracks(10), new Uint8Array(10), new Float32Array(10).fill(-30));
  const reading = read(roll, { section, start: 0, taps: [], pulse: 720 }, silent);

  it('is a rubato over each beat, by what its notes do against the tempo', () => {
    assert.equal(reading.instructions.tempo.length, 1);
    assert.ok(Math.abs(reading.instructions.tempo[0].bpm - 60) < 0.01);
    assert.equal(reading.rubatos.length, 8);
    for (const r of reading.rubatos)
      assert.ok(Math.abs(r.intensity - intensity) < 0.01, `read as ${r.intensity}`);
  });

  it('is accents at the chords, by what they do against the dynamics', () => {
    assert.equal(reading.accents.length, 1);
    const [accents] = reading.accents;
    assert.ok(Math.abs(accents.scale - 8) < 0.01);
    // the first chord lies on the curve, which begins there; the others under it and on it in turn
    assert.deepEqual(
      accents.values.slice(0, 4).map((v) => Math.round(v.value)),
      [0, -1, 0, -1],
    );
  });

  it('is named to the desk as calls of its own', () => {
    assert.equal(reading.calls.filter((c) => c.name === 'InsertRubato').length, 8);
    assert.deepEqual(reading.calls.find((c) => c.name === 'InsertRubato')?.options, {
      scope: 'global',
      date: 0,
      length: 720,
    });
    assert.equal(reading.calls.filter((c) => c.name === 'InsertMetricalAccentuation').length, 1);
  });

  it("comes back when the take's MPM is performed, and goes with its expression", () => {
    const mpm = takeMpm(roll, section, reading, 'a test');
    const asRead = performTake(msm, mpm, section, 1).notes;
    assert.equal(asRead.length, 16);
    asRead.forEach((note, k) => {
      const time = Math.floor(k / 2) + (k % 2 ? eighth : 0);
      assert.ok(Math.abs(note.on - time) < 0.005, `note ${k} at ${note.on} s, not ${time}`);
      assert.ok(Math.abs(note.velocity - (k % 2 ? 36 : 44)) <= 1, `note ${k} at velocity ${note.velocity}`);
    });
    // with no expression at all the eighths fall half way and are as loud as the beats
    const plain = performTake(msm, mpm, section, 0).notes;
    assert.ok(Math.abs(plain[1].on - plain[0].on - (plain[2].on - plain[1].on)) < 0.005);
    assert.ok(Math.abs(plain[1].velocity - plain[0].velocity) <= 1);
    // exaggerated, later still and softer still
    const more = performTake(msm, mpm, section, 2).notes;
    assert.ok(more[1].on - more[0].on < asRead[1].on - asRead[0].on - 0.02);
    assert.ok(more[0].velocity - more[1].velocity > asRead[0].velocity - asRead[1].velocity + 2);
  });
});
