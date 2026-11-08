// The page: the spectrogram fills it; transport and faders float over it.
import { readReduction } from '../reduction/mei.ts';
import { isSpectrogramStyleName, SPECTROGRAM_STYLES } from '../shared/spectrogram.ts';
import { createAudioGraph } from './audio-graph.ts';
import { placeControlCards, showMpmTitle } from './cards.ts';
import { element, formatTime } from './dom.ts';
import { PianoSampler } from './piano.ts';
import { Player } from './player.ts';
import { VoicePool, workerCount } from './pool.ts';
import type { Rendering } from './rendering.ts';
import { SpectrogramView } from './spectrogram-view.ts';

const canvas = element('spec', HTMLCanvasElement);
const playButton = element('play', HTMLButtonElement);
const playIcon = element('icon-play', SVGSVGElement);
const pauseIcon = element('icon-pause', SVGSVGElement);
const positionSlider = element('pos', HTMLInputElement);
const levelSlider = element('exag', HTMLInputElement);
const levelOutput = element('o-exag', HTMLOutputElement);
const statusLine = element('status', HTMLElement);
const nowText = element('now', HTMLElement);
const totalText = element('total', HTMLElement);
const barText = element('bar', HTMLElement);

// the spectrogram's style: the melodic range, or ?spectrogram=full for the full spectrogram
const requestedStyle = new URLSearchParams(location.search).get('spectrogram');
const spectrogramStyle = isSpectrogramStyleName(requestedStyle) ? requestedStyle : 'melodic';

const graph = createAudioGraph();
const piano = new PianoSampler(graph.context, graph.piano);
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

const player = new Player(graph, piano, pool, {
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
/* ---------- faders ---------- */
function fader(id: string, outputId: string, gain: GainNode): void {
  const input = element(id, HTMLInputElement);
  const output = element(outputId, HTMLOutputElement);
  const apply = (): void => {
    const x = Number(input.value) / 100;
    const g = x * x;
    gain.gain.setTargetAtTime(g, graph.context.currentTime, 0.02);
    output.value = g === 0 ? 'off' : `${(20 * Math.log10(g)).toFixed(1).replace('-', '−')} dB`;
    setFill(input, x);
  };
  input.addEventListener('input', apply);
  apply();
}
fader('g-piano', 'o-piano', graph.piano);
fader('g-hum', 'o-hum', graph.hum);

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
  player.request(1, { seconds: 0 });
  setStatus('Starting VocalTractLab…');
}
placeControlCards();
void showMpmTitle(element('info-title', HTMLElement)).catch(() => undefined);
piano.load().catch(() => {
  setStatus('The piano samples did not load. Reload the page to try again.');
});
start().catch((error: unknown) => {
  setStatus(`The voice could not start: ${error instanceof Error ? error.message : String(error)}`);
});
