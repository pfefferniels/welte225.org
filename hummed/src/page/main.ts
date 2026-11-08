// The page: the spectrogram fills it; transport and faders float over it.
import { readReduction } from '../reduction/mei.ts';
import { isSpectrogramStyleName, SPECTROGRAM_STYLES } from '../shared/spectrogram.ts';
import { createAudioGraph } from './audio-graph.ts';
import { placeControlCards, showMpmTitle } from './cards.ts';
import { element, formatTime } from './dom.ts';
import { heard, mix } from './mix.ts';
import { BuiltInPiano, type PianoOutput } from './outputs.ts';
import { PianoSampler } from './piano.ts';
import { Player } from './player.ts';
import { VoicePool, workerCount } from './pool.ts';
import { Recordings } from './recordings.ts';
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
const levelSlider = element('saturation', HTMLInputElement);
const levelOutput = element('o-saturation', HTMLOutputElement);
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
const setFill = (input: HTMLInputElement, fraction: number): void => {
  input.style.setProperty('--p', `${fraction * 100}%`);
};

function updateReadout(): void {
  const cur = player.current;
  if (!cur) return;
  const t = player.position();
  nowText.textContent = formatTime(t);
  let bar = 'Upbeat';
  for (const [bt, label] of cur.bars) if (bt <= t + 0.02) bar = `Bar ${label}`;
  barText.textContent = bar;
  if (!seeking) {
    positionSlider.value = String(t);
    setFill(positionSlider, t / cur.duration);
  }
  positionSlider.setAttribute('aria-valuetext', `${formatTime(t)}, ${bar.toLowerCase()}`);
}

const view = new SpectrogramView(canvas, SPECTROGRAM_STYLES[spectrogramStyle], () => {
  redraw();
});
function redraw(): void {
  updateReadout();
  view.draw(player.current, player.position());
}

const player = new Player(graph, sampled, pool, {
  adopted(rendering: Rendering) {
    positionSlider.max = rendering.duration.toFixed(2);
    totalText.textContent = formatTime(rendering.duration);
    playButton.disabled = false;
    positionSlider.disabled = false;
    levelSlider.disabled = false;
  },
  status: setStatus,
  playingChanged(playing: boolean) {
    playIcon.toggleAttribute('hidden', playing);
    pauseIcon.toggleAttribute('hidden', !playing);
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  },
  changed() {
    requestAnimationFrame(redraw);
  },
});
/* ---------- the piano: in the page, or an instrument over MIDI ---------- */
/** The part an instrument over MIDI plays: the one the elaboration lets be heard. */
const instrumentPart = (): PianoPartName | null => {
  const what = heard(Number(elaborationSlider.value) / 100);
  return what === 'humming' ? null : what;
};
const settings = new PianoSettings({
  context: graph.context,
  sampled,
  part: instrumentPart,
  chosen(output: PianoOutput) {
    player.setPiano(output);
    applyGrid();
  },
  status: setStatus,
});

/* ---------- the faders: elaboration sets the mix, saturation the performance ---------- */
const setGain = (gain: GainNode, value: number): void => {
  gain.gain.setTargetAtTime(value, graph.context.currentTime, 0.02);
};
// the piano's two parts are both always playing: the gains, gliding, crossfade between them
const applyElaboration = (): void => {
  const e = Number(elaborationSlider.value) / 100;
  const gains = mix(e);
  setGain(graph.hum, gains.hum);
  setGain(graph.harmonies, gains.harmonies);
  setGain(graph.piano, gains.piece);
  const what = heard(e);
  elaborationOutput.value = what;
  elaborationSlider.setAttribute(
    'aria-valuetext',
    { humming: 'the humming alone', harmonies: 'humming and harmonies', piece: 'the piece, humming along' }[
      what
    ],
  );
  setFill(elaborationSlider, e);
  // an instrument plays one part: the other, or none, from where playing is
  if (settings.setPart(instrumentPart())) player.restartPiano();
};
elaborationSlider.addEventListener('input', applyElaboration);
applyElaboration();

let levelTimer: ReturnType<typeof setTimeout> | undefined;
const showLevel = (): void => {
  levelOutput.value = `×${Number(levelSlider.value).toFixed(2)}`;
  setFill(levelSlider, Number(levelSlider.value) / Number(levelSlider.max));
};
levelSlider.addEventListener('input', () => {
  showLevel();
  clearTimeout(levelTimer);
  levelTimer = setTimeout(() => {
    player.changeLevel(Number(levelSlider.value));
  }, 250);
});
showLevel();

/** The saturation in fine steps; in the recordings' steps while the page plays them. */
const FREE_STEP = 0.05;
function applyGrid(): void {
  const step = recordings && settings.kind === 'recorded' ? recordings.manifest.step : FREE_STEP;
  levelSlider.step = String(step);
  const value = Number(levelSlider.value);
  const snapped = Number((Math.round(value / step) * step).toFixed(4));
  if (Math.abs(snapped - value) < 1e-9) return;
  levelSlider.value = String(snapped);
  showLevel();
  if (player.current) player.changeLevel(snapped);
}

/** The Pianoteq recordings, if there are any: they name the piano, set the saturation's steps. */
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
  // the sampled grand plays, or stands in where a level is not rendered: load it now
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
  player.request(1, { seconds: 0 });
  setStatus('Starting VocalTractLab…');
}
placeControlCards();
void showMpmTitle(element('info-title', HTMLElement)).catch(() => undefined);
start().catch((error: unknown) => {
  setStatus(`The voice could not start: ${error instanceof Error ? error.message : String(error)}`);
});
