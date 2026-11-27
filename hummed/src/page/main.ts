// The page: the spectrogram fills it; transport and faders float over it.
import { readReduction } from '../reduction/mei.ts';
import { inkAlpha, isSpectrogramStyleName, PIANO_SCALES, SPECTROGRAM_STYLES } from '../shared/spectrogram.ts';
import { sameSetting, type Setting } from '../shared/protocol.ts';
import type { VoiceManifest } from '../shared/voice-recordings.ts';
import { counterpart } from './alignment.ts';
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
import { stepAt, voiceFollows } from '../shared/shape.ts';
import { budget, bytesPerSecond, Library, wanted } from './library.ts';
import {
  BORDERS,
  heard,
  LOUDEST,
  mixOf,
  partsAt,
  performedOf,
  RENDERED,
  voiceElaboration,
  type Mix,
} from './mix.ts';
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
import { SpectrogramView, type Layer } from './spectrogram-view.ts';
import { barsAt, wanderAt, wentOn } from './wander.ts';

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
const sampled = new BuiltInPiano(sampler);
const recorded = new BuiltInPiano(sampler);
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
// in every frame while the playhead moves, and while settings blend (paused, too)
const redraws = new Redraws(draw, () => player.moving || player.blending, browserFrames());
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
// over MIDI has no sound here: the page's own stands for it); and the voice rendered ahead, drawn
// from its sound
const picture = new PianoPicture(
  spectrogramStyle,
  (rendering, part) => (settings.kind === 'sampled' ? sampled : recorded).sound(rendering, part),
  redraw,
);
/** How many columns of the piano's picture there are, for whoever watches the page from outside. */
const pianoColumns = new Written<number>((columns) => {
  canvas.dataset['piano'] = String(columns);
});
/** How many settings sound at once (more than one while they blend), likewise. */
const soundingCount = new Written<number>((count) => {
  canvas.dataset['sounding'] = String(count);
});
const instructions = new InstructionsView(element('instructions', HTMLElement), () => {
  // the visitor goes to read the call in MPM Desk
  if (player.playing) player.pause();
});
instructions.shown = display.instructions;

/** The part of the piano a setting plays where the fader stands at it, the details following. */
const partHeard = (rendering: Rendering): PianoPartName | null => {
  const { piano } = partsAt(rendering.setting.elaboration);
  return piano === 'none' ? null : piano;
};
/** The part of the piano heard in a mix (one at a time), if any. */
const partIn = (mix: Mix): PianoPartName | null =>
  mix.piece > 0 ? 'piece' : mix.harmonies > 0 ? 'harmonies' : null;

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
  // each setting that sounds, as present as it is heard there (the humming at −52 dB all but gone,
  // as it sounds), and while settings blend, each as much as it weighs
  let columns = 0;
  const sounding = player.sounding(t);
  // the axis is theirs by their powers, as shares of all (a crossfade of settings alike in sound
  // takes both down a little, and of opposite ones up)
  const power = sounding.reduce((sum, s) => sum + s.weight * s.weight, 0) || 1;
  const layers = sounding.map(({ rendering, t: at, weight, mix }): Layer => {
    // the part each setting plays as it is heard: its mix, which the fader set while it was asked for
    const part = partIn(mix);
    const strip = part && display.piano ? picture.strip(rendering, part, at) : null;
    if (rendering === cur) columns = strip?.columns ?? 0;
    const voice = picture.voice(rendering, at);
    const loudest = Math.max(mix.harmonies, mix.piece) / LOUDEST.piano;
    const pianoAlpha = inkAlpha(PIANO_SCALES[spectrogramStyle], loudest);
    const humAlpha = inkAlpha(SPECTROGRAM_STYLES[spectrogramStyle].scale, mix.hum / LOUDEST.hum);
    return {
      rendering,
      t: at,
      share: (weight * weight) / power,
      voice: { strip: voice, alpha: weight * humAlpha },
      piano: strip && { strip, alpha: weight * pianoAlpha },
    };
  });
  pianoColumns.set(columns);
  soundingCount.set(layers.length);
  const drew = view.draw(layers, moving);
  // of the piece, or of the harmonic reductions, which take its tempo, dynamics and arpeggios alone
  const parts = partsOf(elaboration(), details);
  instructions.show(cur, t, performedOf(parts, voiceFollows(cur?.setting.elaboration ?? elaboration())));
  return drew;
}

/* ---------- the settings ready to go to at once: rendered ahead, or rendered whole here ---------- */
const phone =
  window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
const memory = (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
const makeLibrary = (manifest: VoiceManifest | null): Library =>
  new Library(manifest, {
    besides: (rendering) => picture.bytes(rendering) + recorded.bytes(rendering),
    inUse: (rendering) => player.inUse(rendering),
    changed: () => {
      showLibrary();
      redraw();
    },
    dropped: (rendering) => {
      picture.drop(rendering);
    },
    limit: budget(memory, phone),
    perSecond: bytesPerSecond(recordings ? graph.context.sampleRate : 0),
    fetchAll: !phone,
  });
/** The library, once the voice's manifest is read (one that holds what the workers render until then). */
let library = makeLibrary(null);
/** What the library holds, for whoever watches the page from outside. */
const showLibrary = (): void => {
  canvas.dataset['ready'] = library.decoded.join(' ');
  canvas.dataset['megabytes'] = String(library.megabytes);
};

const player = new Player(
  graph,
  sampled,
  pool,
  {
    ready: (setting) => library.ready(setting),
    coming: (setting) => library.coming(setting),
    keep: (rendering) => {
      library.keep(rendering);
    },
    used: (rendering) => {
      library.used(rendering);
    },
  },
  {
    adopted(rendering: Rendering) {
      const last = player.lastCrossfade;
      if (last) canvas.dataset['crossfade'] = JSON.stringify(last);
      canvas.dataset['setting'] = String(rendering.setting.elaboration);
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
  },
);

/**
 * The pictures of the settings around the fader, drawn ahead where they are ready, from where the
 * playhead is in each: a crossfade into one shows its picture at once. And what no setting kept
 * needs any more is let go of.
 */
const AHEAD_PICTURES = 3;
setInterval(() => {
  const cur = player.current;
  if (!cur) return;
  const position = player.position();
  for (const setting of wantedSettings().slice(0, AHEAD_PICTURES)) {
    const rendering = library.ready(setting);
    if (!rendering || rendering === cur) continue;
    const t = counterpart(cur.clock, rendering.clock, position);
    picture.voice(rendering, t, 'ahead');
    const part = partHeard(rendering);
    if (part && display.piano) picture.strip(rendering, part, t, 'ahead');
    // the piano of a setting rendered ahead, decoded with it
    if (settings.kind === 'recorded' && part) recorded.ready(rendering, [part]);
  }
  library.tidy();
  picture.keepOnly((rendering) => player.inUse(rendering) || library.holds(rendering));
  recordings?.keep([...library.elaborations(), ...player.renderings().map((r) => r.setting.elaboration)]);
  showLibrary();
}, 500);

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
// A setting that is ready takes over at once, crossfading from whatever sounds; one that is not is
// rendered once the fader rests. Each setting plays both of the piano's parts, its mix setting which
// is heard; as settings blend, so do their mixes.
let elaborationTimer: ReturnType<typeof setTimeout> | undefined;
const renderSoon = (): void => {
  clearTimeout(elaborationTimer);
  const setting = settingOf(elaboration(), details);
  if (player.canSwitch(setting)) {
    player.change(setting);
    return;
  }
  elaborationTimer = setTimeout(() => {
    player.change(settingOf(elaboration(), details));
  }, 300);
};
/** Where the fader was last, and which way it went: the library decodes more on that side. */
let lastElaboration: number | null = null;
let travel: 1 | -1 | 0 = 0;
/** The order in which settings are wanted: the fader's, then its neighbours, more on the side it travels to. */
function wantedSettings(): Setting[] {
  return wanted(RENDERED, voiceElaboration(elaboration()), travel).map((e) => ({ elaboration: e }));
}
const applyElaboration = (): void => {
  const e = elaboration();
  if (lastElaboration !== null && e !== lastElaboration) travel = e > lastElaboration ? 1 : -1;
  lastElaboration = e;
  // the setting's mix: the one playing glides to it where it is the same, one coming in comes in at it
  player.setMix(settingOf(e, details), mixOf(e, partsOf(e, details)));
  library.steer(wantedSettings());
  showDetails(e);
  const what = heard(e);
  elaborationOutput.value = what;
  elaborationSlider.setAttribute(
    'aria-valuetext',
    {
      humming: 'humming alone',
      halves: 'the harmonies in half notes, humming',
      'halves on quarters': 'the harmonies in half notes struck on every quarter, humming',
      quarters: 'the harmonies in quarter notes, humming',
      'quarters on eighths': 'the harmonies in quarter notes struck on every eighth, humming',
      accompaniment: 'the accompaniment, the melody sung over it',
      piece: 'the piece, humming along',
      'piece on eighths': 'the piece struck again on every eighth, humming along',
      'piece on sixteenths': 'the piece, its melody struck again on every sixteenth, humming along',
    }[what],
  );
  setFill(elaborationSlider, e);
  // an instrument plays one part: the other, or none, from where playing is
  if (settings.setPart(instrumentPart())) player.restartPiano();
  redraw();
};
elaborationSlider.addEventListener('input', () => {
  // the fader takes every detail with it; moved by hand, it wanders no more
  stopWandering();
  details = FOLLOWING;
  applyElaboration();
  renderSoon();
});

/* ---------- wandering: the fader glides over its settings by itself (wander.ts) ---------- */
const wanderButton = element('wander', HTMLButtonElement);
/**
 * How far the wandering has gone, in bars of the music, and where the music was at the last look
 * (null: look anew); null when it does not wander.
 */
let wandering: { bars: number; at: number | null } | null = null;
let wanderTimer: ReturnType<typeof setInterval> | undefined;
/** How often it looks where the music is and moves the fader on: often enough for the eye. */
const WANDER_EVERY_MS = 40;
/** The fader to where the wandering is, as if moved there, taking every detail with it. */
const wanderTo = (e: number): void => {
  const before = elaborationSlider.value;
  elaborationSlider.value = String(e * 100);
  if (elaborationSlider.value === before) return;
  details = FOLLOWING;
  applyElaboration();
  renderSoon();
};
/**
 * Look where the music is, and move the fader on by as far as the music went on since. Not while
 * paused; nor while the setting the fader has come to is neither heard nor ready to take over (it is
 * rendered as the fader waits there), so that none is passed by unheard.
 */
const wanderOn = (): void => {
  const cur = player.current;
  if (!wandering || !cur || !player.playing) return;
  const at = barsAt(cur.bars, player.position());
  const went = wentOn(wandering.at, at);
  wandering.at = at;
  const setting = settingOf(elaboration(), FOLLOWING);
  if (!sameSetting(cur.setting, setting) && library.ready(setting) === null) return;
  if (went === 0) return;
  wandering.bars += went;
  wanderTo(wanderAt(wandering.bars));
};
function stopWandering(): void {
  if (!wandering) return;
  wandering = null;
  clearInterval(wanderTimer);
  wanderButton.setAttribute('aria-pressed', 'false');
  // the fader in whole steps again, from where the glide left it
  elaborationSlider.step = '1';
  elaborationSlider.value = String(Math.round(Number(elaborationSlider.value)));
}
wanderButton.addEventListener('click', () => {
  if (wandering) {
    stopWandering();
    applyElaboration();
    return;
  }
  // from the far right (the piece as Grünfeld plays it), towards the far left; gliding, the fader
  // goes anywhere between its whole steps
  wandering = { bars: 0, at: null };
  wanderButton.setAttribute('aria-pressed', 'true');
  elaborationSlider.step = 'any';
  wanderTo(wanderAt(0));
  wanderTimer = setInterval(wanderOn, WANDER_EVERY_MS);
  if (!player.playing && !playButton.disabled) player.toggle();
});
// let go within a step, the fader goes to the step's point: that stretch is one setting
elaborationSlider.addEventListener('change', () => {
  const step = stepAt(elaboration());
  if (step === null || Math.abs(step - elaboration()) < 0.001) return;
  elaborationSlider.value = String(Math.round(step * 100));
  elaborationSlider.dispatchEvent(new Event('input'));
});
// the faders on its scale have a gap where what the piano plays changes (measured from the thumb's
// centre, which travels 15px short of the track)
const gaps = BORDERS.map((b) => {
  const at = `calc(7.5px + (100% - 15px) * ${b})`;
  return `transparent calc(${at} - 1.5px), var(--bg) calc(${at} - 1.5px) calc(${at} + 1.5px), transparent calc(${at} + 1.5px)`;
});
for (const fader of document.querySelectorAll<HTMLElement>('input.split'))
  fader.style.setProperty('--gaps', `linear-gradient(to right, ${gaps.join(', ')})`);
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
  stopWandering();
  details = { ...details, flighty: Number(flightySlider.value) / 100 };
  applyElaboration();
  renderSoon();
});
exaggeratedSlider.addEventListener('input', () => {
  stopWandering();
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
    recordings.changed = redraw;
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
  // a wandering fader goes on from where the music is now, as far as it goes on from there
  if (wandering) wandering.at = null;
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
  // the voice rendered ahead, where there is any of the table the page has
  try {
    library = makeLibrary(await Library.manifest());
  } catch (error) {
    console.warn('The voice rendered ahead could not be read; it is rendered as you listen.', error);
  }
  library.steer(wantedSettings());
  const first = settingOf(elaboration(), details);
  const ready = player.canSwitch(first);
  player.begin(first);
  if (!player.current) setStatus(ready ? 'Loading…' : 'Starting VocalTractLab…');
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
