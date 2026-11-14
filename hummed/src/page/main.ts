// The page: the spectrogram fills it; transport and faders float over it.
import { readReduction } from '../reduction/mei.ts';
import { isSpectrogramStyleName, SPECTROGRAM_STYLES } from '../shared/spectrogram.ts';
import { createAudioGraph } from './audio-graph.ts';
import { fetchMpm, placeControlCards, showMpmTitle } from './cards.ts';
import { DisplaySettings } from './display.ts';
import { element, formatTime, setFill, Written } from './dom.ts';
import { Glide } from './glide.ts';
import { InstructionsView } from './instructions-view.ts';
import {
  apart,
  exaggerationText,
  flightinessText,
  FOLLOWING,
  partsOf,
  settingOf,
  type Details,
} from './details.ts';
import { heard, mix, mixOf, performedOf } from './mix.ts';
import { BuiltInPiano, type PianoOutput } from './outputs.ts';
import { PianoSampler } from './piano.ts';
import { PianoPicture } from './piano-picture.ts';
import { Player } from './player.ts';
import { VoicePool, workerCount } from './pool.ts';
import { Readout } from './readout.ts';
import { Recordings } from './recordings.ts';
import { browserFrames, Redraws } from './redraws.ts';
import type { PianoPartName, Rendering } from './rendering.ts';
import { PianoSettings } from './settings.ts';
import { SpectrogramView } from './spectrogram-view.ts';

const canvas = element('spec', HTMLCanvasElement);
const playButton = element('play', HTMLButtonElement);
const playIcon = element('icon-play', SVGSVGElement);
const pauseIcon = element('icon-pause', SVGSVGElement);
const positionSlider = element('pos', HTMLInputElement);
const elaborationSlider = element('elaboration', HTMLInputElement);
const elaborationOutput = element('o-elaboration', HTMLOutputElement);
const detailsToggle = element('details-toggle', HTMLButtonElement);
const detailsBox = element('details', HTMLElement);
const flightySlider = element('d-flighty', HTMLInputElement);
const flightyOutput = element('o-flighty', HTMLOutputElement);
const exaggeratedSlider = element('d-exaggerated', HTMLInputElement);
const exaggeratedOutput = element('o-exaggerated', HTMLOutputElement);
const voiceChip = element('d-voice', HTMLButtonElement);
const harmoniesChip = element('d-harmonies', HTMLButtonElement);
const pieceChip = element('d-piece', HTMLButtonElement);
const statusLine = element('status', HTMLElement);
const nowText = element('now', HTMLElement);
const totalText = element('total', HTMLElement);
const barText = element('bar', HTMLElement);

// the spectrogram's style: the melodic range, or ?spectrogram=full for the full spectrogram
const requestedStyle = new URLSearchParams(location.search).get('spectrogram');
const spectrogramStyle = isSpectrogramStyleName(requestedStyle) ? requestedStyle : 'melodic';

const graph = createAudioGraph();
const sampler = new PianoSampler(graph.context, () => {
  setStatus('The piano samples did not load. Reload the page to try again.');
});
/** The sampled grand alone, and the Pianoteq recordings (the sampled grand where a level has none). */
const sampled = new BuiltInPiano(graph, sampler);
const recorded = new BuiltInPiano(graph, sampler);
/** The Pianoteq recordings, once their manifest is read; null where there are none. */
let recordings: Recordings | null = null;
// the voice is rendered by several workers side by side, as many as there are cores to spare
const pool = new VoicePool(workerCount(), (event) => {
  player.receive(event);
});
let seeking = false;

const setStatus = (text: string): void => {
  statusLine.textContent = text;
  statusLine.hidden = text === '';
};

/* ---------- drawing: once a frame, and in every frame while the playhead moves ---------- */
const readout = new Readout(nowText, barText, positionSlider);
const glide = new Glide();
const redraws = new Redraws(draw, () => player.moving, browserFrames());
/** Something to draw: in the next frame, with whatever else changes until then. */
const redraw = (): void => {
  redraws.request();
};
// a canvas that was resized is empty: it is drawn before the browser shows it
const view = new SpectrogramView(canvas, SPECTROGRAM_STYLES[spectrogramStyle], () => {
  draw(performance.now());
});
/* ---------- beside the humming: the piano in the spectrogram, the MPM's instructions ---------- */
const display = new DisplaySettings(() => {
  instructions.shown = display.instructions;
  redraw();
});
// the piano's part that is heard, drawn from its sound as the piano chosen plays it (an instrument
// over MIDI has no sound here: the page's own stands for it)
const picture = new PianoPicture(
  spectrogramStyle,
  (rendering, part) => (settings.kind === 'sampled' ? sampled : recorded).sound(rendering, part),
  redraw,
);
/** How many columns of the piano's picture there are, for whoever watches the page from outside. */
const pianoColumns = new Written<number>((columns) => {
  canvas.dataset['piano'] = String(columns);
});
const instructions = new InstructionsView(element('instructions', HTMLElement), () => {
  // the visitor goes to read the call in MPM Desk
  if (player.playing) player.pause();
});
instructions.shown = display.instructions;

/**
 * The page as it is in a frame at `time` (ms): the readout, the strip, the instructions. Returns
 * whether the strip had to be drawn.
 */
function draw(time: number): boolean {
  const cur = player.current;
  const moving = player.moving;
  // where the playhead is drawn: while it moves, carried evenly from frame to frame
  const glided = glide.at(player.position(), time, moving);
  const t = cur ? Math.min(cur.duration, glided) : glided;
  if (cur) readout.show(t, cur.duration, cur.bars, { moving, held: seeking });
  // the piano under the humming, as present as it is heard
  const parts = partsOf(elaboration(), details);
  const gains = mixOf(elaboration(), parts);
  const part = instrumentPart();
  const strip = cur && part && display.piano ? picture.strip(cur, part, t) : null;
  pianoColumns.set(strip?.columns ?? 0);
  const under = strip && { strip, alpha: Math.max(gains.harmonies, gains.piece) / mix(1).piece };
  const drew = view.draw(cur, t, under, moving);
  // of the piece, or of the harmonic reductions, which take its tempo, dynamics and arpeggios alone
  instructions.show(cur, t, performedOf(parts, heard(cur?.setting.elaboration ?? elaboration())));
  return drew;
}

const player = new Player(graph, sampled, pool, {
  adopted(rendering: Rendering) {
    positionSlider.max = rendering.duration.toFixed(2);
    readout.forget();
    totalText.textContent = formatTime(rendering.duration);
    playButton.disabled = false;
    positionSlider.disabled = false;
  },
  status: setStatus,
  playingChanged(playing: boolean) {
    playIcon.toggleAttribute('hidden', playing);
    pauseIcon.toggleAttribute('hidden', !playing);
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    // the playhead sets off, or has come to rest: where it rests is drawn exactly
    redraw();
  },
  changed: redraw,
});
/* ---------- the piano: in the page, or an instrument over MIDI ---------- */
/** The part an instrument over MIDI plays: the one that is heard, if any. */
const instrumentPart = (): PianoPartName | null => {
  const { piano } = partsOf(elaboration(), details);
  return piano === 'none' ? null : piano;
};
const settings = new PianoSettings({
  context: graph.context,
  sampled,
  part: instrumentPart,
  chosen(output: PianoOutput) {
    player.setPiano(output);
    picture.forget();
    redraw();
  },
  status: setStatus,
});

/* ---------- the fader: elaboration sets the mix, the performance and the voice ---------- */
const setGain = (gain: GainNode, value: number): void => {
  gain.gain.setTargetAtTime(value, graph.context.currentTime, 0.02);
};
const elaboration = (): number => Number(elaborationSlider.value) / 100;
/** What is set apart from the fader in the details under it: nothing, until one is moved. */
let details: Details = FOLLOWING;
/** The details: each slider where the fader is, or where it was set apart; what is heard. */
const showDetails = (e: number): void => {
  const flighty = details.flighty ?? e;
  const exaggerated = details.exaggerated ?? e;
  flightySlider.value = String(Math.round(flighty * 100));
  exaggeratedSlider.value = String(Math.round(exaggerated * 100));
  setFill(flightySlider, flighty);
  setFill(exaggeratedSlider, exaggerated);
  const [tempo, ms] = flightinessText(flighty).split(' · ');
  flightyOutput.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: tempo }),
    Object.assign(document.createElement('span'), { textContent: ms }),
  );
  flightySlider.setAttribute('aria-valuetext', `${tempo} as fast, ${ms} off`);
  const [piano, voice] = exaggerationText(exaggerated);
  exaggeratedOutput.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: piano, title: 'the piano' }),
    Object.assign(document.createElement('span'), { textContent: voice, title: 'the humming' }),
  );
  exaggeratedSlider.setAttribute('aria-valuetext', `the piano ${piano}, the humming ${voice}`);
  const parts = partsOf(e, details);
  voiceChip.setAttribute('aria-pressed', String(parts.voice));
  harmoniesChip.setAttribute('aria-pressed', String(parts.piano === 'harmonies'));
  pieceChip.setAttribute('aria-pressed', String(parts.piano === 'piece'));
  element('row-flighty', HTMLElement).classList.toggle('apart', details.flighty !== null);
  element('row-exaggerated', HTMLElement).classList.toggle('apart', details.exaggerated !== null);
  element('row-heard', HTMLElement).classList.toggle(
    'apart',
    details.voice !== null || details.piano !== null,
  );
  detailsToggle.classList.toggle('apart', apart(details));
};
// the piano's two parts are both always playing: the gains, gliding, crossfade between them; the
// voice itself is rendered anew for the elaboration, and for the details, once they rest
let elaborationTimer: ReturnType<typeof setTimeout> | undefined;
const renderSoon = (): void => {
  clearTimeout(elaborationTimer);
  elaborationTimer = setTimeout(() => {
    player.change(settingOf(elaboration(), details));
  }, 300);
};
const applyElaboration = (): void => {
  const e = elaboration();
  const gains = mixOf(e, partsOf(e, details));
  setGain(graph.hum, gains.hum);
  setGain(graph.harmonies, gains.harmonies);
  setGain(graph.piano, gains.piece);
  showDetails(e);
  const what = heard(e);
  elaborationOutput.value = what;
  elaborationSlider.setAttribute(
    'aria-valuetext',
    {
      halves: 'the harmonies in half notes, humming',
      quarters: 'the harmonies in quarter notes, humming',
      piece: 'the piece, humming along',
    }[what],
  );
  setFill(elaborationSlider, e);
  // an instrument plays one part: the other, or none, from where playing is
  if (settings.setPart(instrumentPart())) player.restartPiano();
  redraw();
};
elaborationSlider.addEventListener('input', () => {
  // the fader takes every detail with it
  details = FOLLOWING;
  applyElaboration();
  renderSoon();
});
detailsToggle.addEventListener('click', () => {
  const open = detailsBox.hidden;
  detailsBox.hidden = !open;
  detailsToggle.setAttribute('aria-expanded', String(open));
  detailsToggle.setAttribute(
    'aria-label',
    open ? 'Hide the details' : 'Show what elaboration sets, each on its own',
  );
});
flightySlider.addEventListener('input', () => {
  details = { ...details, flighty: Number(flightySlider.value) / 100 };
  applyElaboration();
  renderSoon();
});
exaggeratedSlider.addEventListener('input', () => {
  details = { ...details, exaggerated: Number(exaggeratedSlider.value) / 100 };
  applyElaboration();
  renderSoon();
});
// what is heard changes the mix alone: the voice and both parts of the piano are always rendered
voiceChip.addEventListener('click', () => {
  details = { ...details, voice: !partsOf(elaboration(), details).voice };
  applyElaboration();
});
const choosePiano = (part: 'harmonies' | 'piece'): void => {
  details = { ...details, piano: partsOf(elaboration(), details).piano === part ? 'none' : part };
  applyElaboration();
};
harmoniesChip.addEventListener('click', () => {
  choosePiano('harmonies');
});
pieceChip.addEventListener('click', () => {
  choosePiano('piece');
});
applyElaboration();

/** The Pianoteq recordings, if there are any: they name the piano, and play unless declined. */
async function loadRecordings(): Promise<void> {
  try {
    recordings = await Recordings.load(graph.context);
  } catch (error) {
    console.warn('The Pianoteq recordings could not be read; the sampled grand plays.', error);
  }
  recorded.recordings = recordings;
  if (recordings) {
    element('piano-credit', HTMLElement).textContent =
      `${recordings.manifest.credit}; Salamander Grand Piano by Alexander Holm (CC BY 3.0)`;
    settings.offerRecorded(recorded, recordings.manifest);
  }
  // the sampled grand plays, or stands in where a setting is not rendered: load it now
  if (settings.kind === 'sampled') sampler.ready();
}

/* ---------- seeking: the slider, dragging the strip, the wheel, the keys ---------- */
positionSlider.addEventListener('pointerdown', () => {
  seeking = true;
});
positionSlider.addEventListener('input', () => {
  const cur = player.current;
  if (!cur) return;
  setFill(positionSlider, Number(positionSlider.value) / cur.duration);
  player.seek(Number(positionSlider.value));
});
positionSlider.addEventListener('change', () => {
  seeking = false;
});
window.addEventListener('pointerup', () => {
  seeking = false;
});
playButton.addEventListener('click', () => {
  player.toggle();
});

let drag: { readonly x: number; readonly t: number; readonly wasPlaying: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!player.current) return;
  drag = { x: e.clientX, t: player.position(), wasPlaying: player.playing };
  if (player.playing) player.pause();
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (drag) player.scrub(drag.t - (e.clientX - drag.x) / view.pixelsPerSecond);
});
const endDrag = (): void => {
  if (!drag) return;
  canvas.classList.remove('dragging');
  const { wasPlaying } = drag;
  drag = null;
  player.seek(player.position());
  if (wasPlaying) player.play();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!player.current || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    player.seek(player.position() + e.deltaX / view.pixelsPerSecond);
  },
  { passive: false },
);
canvas.addEventListener('keydown', (e) => {
  if (!player.current) return;
  if (e.key === 'ArrowRight') player.seek(player.position() + 5);
  else if (e.key === 'ArrowLeft') player.seek(player.position() - 5);
  else if (e.key === ' ' && !playButton.disabled) player.toggle();
  else return;
  e.preventDefault();
});

/* ---------- start: what is hummed, then Grünfeld as played ---------- */
async function start(): Promise<void> {
  const response = await fetch('reduction/reduction.mei');
  if (!response.ok) throw new Error(`reduction.mei: ${response.status}`);
  const doc = new DOMParser().parseFromString(await response.text(), 'application/xml');
  pool.setup(readReduction(doc.documentElement), spectrogramStyle);
  await loadRecordings();
  player.request(settingOf(elaboration(), details), { seconds: 0 });
  setStatus('Starting VocalTractLab…');
}
placeControlCards();
const mpm = fetchMpm();
void showMpmTitle(element('info-title', HTMLElement), mpm).catch(() => undefined);
instructions.load(mpm).then(redraw, (error: unknown) => {
  console.warn('The reconstruction’s calls could not be read; none are listed.', error);
});
start().catch((error: unknown) => {
  setStatus(`The voice could not start: ${error instanceof Error ? error.message : String(error)}`);
});
