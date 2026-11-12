// The take's page: a stretch of the roll is played, and while it plays the listener hums and taps
// along. The sound and the taps go to the worker, which takes the voice apart and reads it against
// the roll; the page draws what comes back and plays the take, or the model's copy of it, with
// the roll.
import { element } from '../page/dom.ts';
import { PianoSampler } from '../page/piano.ts';
import { heldNotes, type HeldNote } from '../shared/piano.ts';
import { SAMPLE_RATE, type Seconds, type Ticks } from '../shared/units.ts';
import { Recorder } from './capture.ts';
import { draw, VIEW_HEIGHT, type View } from './draw.ts';
import type { MovementOptions } from './movements.ts';
import type { TakeRequest, TakeResponse, TakeResult } from './protocol.ts';
import type { TakeTiming } from './reading.ts';
import {
  readRoll,
  sectionOf,
  timeAt,
  withCorrections,
  type Correction,
  type Roll,
  type Section,
} from './roll.ts';
import { decodeWav, encodeWav, resample } from './wav.ts';

/** What is heard before the bars hummed: the bar before them, or this much silence at the piece's beginning. */
const LEAD_IN: Seconds = 1.5;
/** What is heard, and recorded, after them. */
const TAIL: Seconds = 1;
/** How long ahead the roll is scheduled when it is started. */
const AHEAD: Seconds = 0.25;

interface Work {
  readonly provenance: readonly (Correction & {
    readonly options: { readonly prefer?: string; readonly from?: number; readonly to?: number };
  })[];
}

/** A take as it is saved beside its sound. */
interface SavedTake {
  readonly firstBar: number;
  readonly lastBar: number;
  readonly start: Seconds;
  readonly taps: readonly Seconds[];
  readonly pulse: Ticks;
}

const ui = {
  first: element('first', HTMLInputElement),
  last: element('last', HTMLInputElement),
  pulse: element('pulse', HTMLSelectElement),
  listen: element('listen', HTMLButtonElement),
  record: element('record', HTMLButtonElement),
  stop: element('stop', HTMLButtonElement),
  status: element('status', HTMLElement),
  view: element('view', HTMLCanvasElement),
  after: element('after', HTMLElement),
  playTake: element('play-take', HTMLButtonElement),
  playCopy: element('play-copy', HTMLButtonElement),
  withRoll: element('with-roll', HTMLInputElement),
  smoothing: element('smoothing', HTMLInputElement),
  prominence: element('prominence', HTMLInputElement),
  between: element('between', HTMLInputElement),
  save: element('save', HTMLButtonElement),
  saveCalls: element('save-calls', HTMLButtonElement),
  open: element('open', HTMLInputElement),
  report: element('report', HTMLElement),
};

/** The roll as it was recorded: what is played. */
let played: Roll | null = null;
/**
 * The roll with the reconstruction's corrections of its velocities (roll.ts): what a take is read
 * against and what is drawn, since the dynamics are fitted on that scale.
 */
let roll: Roll | null = null;
let desk: View['desk'] = { tempo: [], dynamics: [] };
let context: AudioContext | null = null;
let sampler: PianoSampler | null = null;
let recorder: Recorder | null = null;
let worker: Worker | null = null;
/** The take on the page: its timing, its sound at 44.1 kHz, and what the worker made of it. */
let take: { timing: TakeTiming; samples: Float32Array; result: TakeResult | null } | null = null;
/** How early or late this listener taps, as the last take that could tell found it. */
let tapLead: number | undefined;
/** What sounds: its sources, when the roll's `from` was scheduled, and the timer that ends it. */
let sounding: { sources: AudioScheduledSourceNode[]; at: number; from: Seconds; end: number } | null = null;

const say = (text: string): void => {
  ui.status.textContent = text;
};
const fail = (error: unknown): void => {
  say(error instanceof Error ? error.message : String(error));
};

function section(): Section {
  if (!roll) throw new Error('the roll is not loaded yet');
  return sectionOf(roll, Number(ui.first.value), Number(ui.last.value));
}

/** The stretch of the roll's time that is played and shown for a section. */
function span(r: Roll, s: Section): { from: Seconds; to: Seconds } {
  const begin = timeAt(r, s.from);
  const before = r.bars.findLast((b) => b.date < s.from && b.number > 0);
  return { from: before ? timeAt(r, before.date) : begin - LEAD_IN, to: timeAt(r, s.to) + TAIL };
}

function redraw(): void {
  if (!roll) return;
  const s = take?.timing.section ?? section();
  const playhead =
    sounding && context ? context.currentTime - context.outputLatency - sounding.at + sounding.from : null;
  draw(ui.view, {
    roll,
    section: s,
    ...span(roll, s),
    timing: take?.timing ?? null,
    result: take?.result ?? null,
    desk,
    playhead,
  });
}

function animate(): void {
  redraw();
  if (sounding) requestAnimationFrame(animate);
}

async function audio(): Promise<{ context: AudioContext; sampler: PianoSampler }> {
  context ??= new AudioContext({ latencyHint: 'interactive' });
  await context.resume();
  sampler ??= new PianoSampler(context, fail);
  const piano = sampler;
  if (!piano.ready()) {
    say('loading the piano …');
    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        if (!piano.ready()) return;
        clearInterval(poll);
        resolve();
      }, 100);
    });
  }
  return { context, sampler: piano };
}

/** The roll's notes over a span, as the sampler holds them. */
function rollNotes(r: Roll, from: Seconds, to: Seconds): HeldNote[] {
  const sustain = r.presses
    .filter((p) => p.kind === 'sustain')
    .flatMap((p) => [
      { at: p.onset, value: 127 },
      { at: p.end, value: 0 },
    ])
    .sort((a, b) => a.at - b.at);
  const keys = r.notes.map((n) => ({ on: n.onset, off: n.end, pitch: n.pitch, velocity: n.velocity }));
  return heldNotes({ keys, sustain, soft: [] }).filter((n) => n.on >= from && n.on < to);
}

function silence(): void {
  if (!sounding) return;
  clearTimeout(sounding.end);
  for (const source of sounding.sources) {
    try {
      source.stop();
    } catch {
      // not started yet, or over already
    }
  }
  sounding = null;
  ui.stop.disabled = true;
  redraw();
}

/**
 * Play the roll over a span (if `withRoll`), and a voice with it, placed where the take's first
 * sample lies. `ended` is called when the span is over, not when the playing is stopped.
 */
async function play(
  from: Seconds,
  to: Seconds,
  withRoll: boolean,
  voice: { samples: Float32Array; start: Seconds } | null,
  ended: () => void,
): Promise<void> {
  if (!roll) return;
  const { context: c, sampler: piano } = await audio();
  silence();
  const at = c.currentTime + AHEAD;
  const sources: AudioScheduledSourceNode[] = [];
  if (withRoll)
    for (const note of rollNotes(played ?? roll, from, to)) {
      const source = piano.play(note, c.destination, at + note.on - from, 0);
      if (source) sources.push(source);
    }
  if (voice) {
    const buffer = c.createBuffer(1, voice.samples.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(voice.samples);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    const offset = voice.start - from;
    source.start(at + Math.max(0, offset), Math.max(0, -offset));
    sources.push(source);
  }
  const end = window.setTimeout(
    () => {
      ended();
      silence();
    },
    (to - from + AHEAD) * 1000,
  );
  sounding = { sources, at, from, end };
  ui.stop.disabled = false;
  animate();
}

function movementOptions(): MovementOptions {
  return { smoothing: Number(ui.smoothing.value), prominence: Number(ui.prominence.value) };
}

function analyser(): Worker {
  if (worker) return worker;
  worker = new Worker('take-worker.js', { name: 'take' });
  worker.addEventListener('message', (event: MessageEvent<TakeResponse>) => {
    const message = event.data;
    if (message.type === 'failed') say(message.message);
    else if (message.type === 'round')
      say(
        `the model sings the take: round ${message.pass} of ${message.passes}, ` +
          `${message.misfit.level.toFixed(1)} dB off in level`,
      );
    else if (take) {
      take.result = message.type === 'done' ? message.result : take.result && { ...take.result, ...message };
      if (take.result?.reading.tapLeadFrom === 'take') tapLead = take.result.reading.tapLead;
      if (take.result) report(take.result);
      ui.after.hidden = false;
      say('');
      redraw();
    }
  });
  worker.addEventListener('error', (event) => {
    say(event.message);
  });
  return worker;
}

/** A take's sound and timing to the worker. `equalize`: a real voice (see inversion.ts). */
function analyse(samples: Float32Array, timing: TakeTiming, equalize: boolean): void {
  if (!roll) return;
  take = { timing, samples, result: null };
  ui.after.hidden = true;
  ui.report.textContent = '';
  say('the model sings the take …');
  const request: TakeRequest = {
    type: 'analyse',
    samples,
    timing,
    roll,
    equalize,
    movements: movementOptions(),
    between: Number(ui.between.value),
    ...(tapLead === undefined ? {} : { tapLead }),
  };
  analyser().postMessage(request);
  redraw();
}

function report(result: TakeResult): void {
  const { movements: m, reading: r } = result;
  const ms = (t: Seconds): string => `${Math.round(t * 1000)} ms`;
  const last = result.misfits.at(-1);
  const lines = [
    `The model's copy lies ${last ? last.level.toFixed(1) : '?'} dB (median) from the take in level.`,
    `The body: ${m.phrases.length} phrases, ${m.breaths.length} breaths between them, ${m.notes.length} notes, ` +
      `${m.turns.length} turns of the effort, the lips parted ${m.openings.length} times.`,
    `Against the roll the voice's notes lie ${ms(r.lag)} behind.`,
    `${r.beats.filter((b) => b.tap !== null).length} of ${r.beats.length} beats tapped` +
      (r.tapLeadFrom === 'take'
        ? `, ${ms(r.tapLead)} against the chords struck at once, scattered by ${ms(r.tapScatter)}.`
        : r.tapLeadFrom === 'earlier'
          ? `; too few on chords struck at once here, so the lead of an earlier take is used (${ms(r.tapLead)}).`
          : '; too few on chords struck at once to say how early or late you tap: the spreads are placed by the taps as they are.'),
    `Between the notes, in time: ${r.silentOnsets.length} beats tapped where no note sounds` +
      (r.silentOnsets.length
        ? ` (${r.silentOnsets.map((o) => `${o.date} at ${o.onset.toFixed(2)} s`).join(', ')}).`
        : '.'),
    `Between the notes, in dynamics: ${r.betweens.length} values, ${r.betweens.filter((v) => v.voiced).length} of them the voice's ` +
      `(a dB of its effort counted as ${r.velocity.scale.toFixed(2)} velocity steps):`,
    ...r.betweens.map((v) => {
      const off = v.velocity - v.line;
      const said = !v.voiced
        ? 'the voice is silent: a straight line between the chords'
        : Math.abs(off) < 0.5
          ? 'as a straight line between the chords'
          : `${Math.abs(off).toFixed(1)} ${off > 0 ? 'above' : 'below'} a straight line between the chords`;
      return `  ${String(v.date).padStart(6)}  velocity ${String(v.velocity).padStart(3)}  ${said}`;
    }),
    `Spread chords: ${r.spreads.filter((s) => s.placement === 'before-beat').length} tapped on the last note, ` +
      `${r.spreads.filter((s) => s.placement === 'on-beat').length} on the first, ` +
      `${r.spreads.filter((s) => s.placement === 'estimate').length} between or not tapped.`,
    `The voice's effort and the roll's dynamics at the chords go together by r = ${r.velocity.r.toFixed(2)}.`,
    '',
    `${r.gestures.length} movements, each a tempo and a dynamics instruction:`,
    ...r.gestures.map((g) => {
      const dynamics = r.calls.find(
        (c) => c.name === 'InsertDynamicsInstructions' && c.range.from === g.from,
      );
      const phantoms =
        (dynamics?.options['phantomVelocities'] as { value: unknown[] } | undefined)?.value.length ?? 0;
      const tempo = r.calls.find((c) => c.name === 'InsertTempo' && c.range.from === g.from)?.options;
      const bpm = (v: unknown): string => (typeof v === 'number' ? v.toFixed(1) : '?');
      const pace = tempo
        ? tempo['transitionTo'] === undefined
          ? `${bpm(tempo['bpm'])} bpm`
          : `${bpm(tempo['bpm'])} → ${bpm(tempo['transitionTo'])} bpm`
        : 'no tempo (too few notes)';
      return (
        `  ${String(g.from).padStart(6)}–${String(g.to).padEnd(6)} ${g.kind.padEnd(6)} ${pace}` +
        (phantoms ? `, ${phantoms} ${phantoms === 1 ? 'value' : 'values'} between the notes` : '')
      );
    }),
  ];
  ui.report.textContent = lines.join('\n');
}

async function record(): Promise<void> {
  if (!roll) return;
  const r = roll;
  const s = section();
  const { context: c } = await audio();
  recorder ??= new Recorder(c);
  await recorder.open();
  const mic = recorder;
  const { from, to } = span(r, s);
  take = null;
  ui.after.hidden = true;
  ui.report.textContent = '';
  say('recording: hum, and tap any key on the beat. Escape stops.');
  (document.activeElement as HTMLElement | null)?.blur();
  await play(from, to, true, null, () => {
    finish(mic, s, from);
  });
  mic.start();
}

/** The recording's end: its sound and taps placed in the roll's time, and off to the worker. */
function finish(mic: Recorder, s: Section, from: Seconds): void {
  if (!context || !sounding || !mic.recording) return;
  const capture = mic.stop();
  // what was heard at a context time, in the roll's time
  const at = sounding.at;
  const heard = (time: number): Seconds => time - at + from;
  // a sample reaches the context after the microphone's delay, and was sung to what was heard then
  const start = heard(capture.startedAt - mic.inputLatency - context.outputLatency);
  const timing: TakeTiming = {
    section: s,
    start,
    taps: capture.taps.map((t) => heard(t) - start),
    pulse: Number(ui.pulse.value),
  };
  if (capture.samples.length === 0) {
    say('nothing was recorded');
    return;
  }
  analyse(resample(capture.samples, capture.sampleRate, SAMPLE_RATE), timing, true);
}

function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function open(files: FileList): Promise<void> {
  if (!roll) return;
  const all = [...files];
  const wav = all.find((f) => f.name.endsWith('.wav'));
  const json = all.find((f) => f.name.endsWith('.json'));
  if (!wav || !json) throw new Error('a take is two files: its .wav and its .json');
  const saved = JSON.parse(await json.text()) as SavedTake;
  const sound = decodeWav(new Uint8Array(await wav.arrayBuffer()));
  ui.first.value = String(saved.firstBar);
  ui.last.value = String(saved.lastBar);
  ui.pulse.value = String(saved.pulse);
  const timing: TakeTiming = {
    section: sectionOf(roll, saved.firstBar, saved.lastBar),
    start: saved.start,
    taps: saved.taps,
    pulse: saved.pulse,
  };
  analyse(resample(sound.samples, sound.sampleRate, SAMPLE_RATE), timing, true);
}

async function load(): Promise<void> {
  const get = async (name: string): Promise<string> => {
    const response = await fetch(`../mpm/${name}`);
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    return response.text();
  };
  const [mei, msm, workJson] = await Promise.all([
    get('transcription.mei'),
    get('score.msm'),
    get('work.json'),
  ]);
  const work = JSON.parse(workJson) as Work;
  played = readRoll(mei, msm, work.provenance.find((p) => p.name === 'MakeChoice')?.options.prefer);
  roll = withCorrections(played, work.provenance);
  const ends = (name: string): Ticks[] => [
    ...new Set(
      work.provenance
        .filter((p) => p.name === name)
        .flatMap((p) => [p.options.from, p.options.to].filter((d) => d !== undefined)),
    ),
  ];
  desk = { tempo: ends('InsertTempo'), dynamics: ends('InsertDynamicsInstructions') };
  const bars = roll.bars.filter((b) => b.number > 0).length;
  ui.first.max = ui.last.max = String(bars);
  ui.listen.disabled = ui.record.disabled = false;
  say('');
  redraw();
}

ui.view.style.height = `${VIEW_HEIGHT}px`;
ui.listen.addEventListener('click', () => {
  if (!roll) return;
  const { from, to } = span(roll, section());
  play(from, to, true, null, () => undefined).catch(fail);
});
ui.record.addEventListener('click', () => {
  record().catch(fail);
});
ui.stop.addEventListener('click', () => {
  if (recorder?.recording) recorder.stop();
  silence();
  say('');
});
const hear = (copy: boolean): void => {
  if (!roll || !take?.result) return;
  const { from, to } = span(roll, take.timing.section);
  const samples = copy ? take.result.copy : take.samples;
  play(from, to, ui.withRoll.checked, { samples, start: take.timing.start }, () => undefined).catch(fail);
};
ui.playTake.addEventListener('click', () => {
  hear(false);
});
ui.playCopy.addEventListener('click', () => {
  hear(true);
});
for (const input of [ui.smoothing, ui.prominence, ui.between])
  input.addEventListener('change', () => {
    if (!take?.result) return;
    const request: TakeRequest = {
      type: 'reread',
      movements: movementOptions(),
      between: Number(ui.between.value),
      ...(tapLead === undefined ? {} : { tapLead }),
    };
    analyser().postMessage(request);
  });
for (const input of [ui.first, ui.last])
  input.addEventListener('change', () => {
    if (Number(ui.last.value) < Number(ui.first.value)) ui.last.value = ui.first.value;
    take = null;
    ui.after.hidden = true;
    ui.report.textContent = '';
    redraw();
  });
ui.save.addEventListener('click', () => {
  if (!take) return;
  const { timing, samples } = take;
  const name = `take-${timing.section.firstBar}-${timing.section.lastBar}`;
  const saved: SavedTake = {
    firstBar: timing.section.firstBar,
    lastBar: timing.section.lastBar,
    start: timing.start,
    taps: timing.taps,
    pulse: timing.pulse,
  };
  download(`${name}.wav`, encodeWav(samples, SAMPLE_RATE), 'audio/wav');
  download(`${name}.json`, JSON.stringify(saved, null, 2), 'application/json');
});
ui.saveCalls.addEventListener('click', () => {
  if (!take?.result) return;
  const { firstBar, lastBar } = take.timing.section;
  download(
    `calls-${firstBar}-${lastBar}.json`,
    JSON.stringify(take.result.reading.calls, null, 2),
    'application/json',
  );
});
ui.open.addEventListener('change', () => {
  if (ui.open.files) open(ui.open.files).catch(fail);
});
window.addEventListener('keydown', (event) => {
  if (!recorder?.recording) return;
  if (event.key === 'Escape') {
    ui.stop.click();
    return;
  }
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  recorder.tap(event);
});
window.addEventListener('resize', redraw);
load().catch(fail);
