// The described page (../described/): the roll with the remarks on it, to be read and heard.
// A remark that is clicked is chosen and its passage played, with what it takes around it to hear
// what is said of it (context.ts), at the level of elaboration chosen for it, the instructions the
// remark wrote brought out; the notes are drawn where that rendering has them for as long. What
// plays is passage.ts: the front page's piano and its inner voice.
import { element, recall, remember } from '../page/dom.ts';
import { instructionIri, readInstructions, type Instruction } from '../shared/instructions.ts';
import { mpmElements } from '../shared/mpm.ts';
import { ELABORATION, pianoPlays } from '../shared/shape.ts';
import type { Ms, Ticks } from '../shared/units.ts';
import { assemble, type Described } from './assemble.ts';
import { along, clamp } from './geometry.ts';
import { stretch, where } from './piece.ts';
import type { Sounded } from './rendering.ts';
import { RollView } from './roll.ts';
import { createPassagePlayer, type Emphasis, type PassageListeners, type PassagePlayer } from './passage.ts';
import { silentPlayer } from './sound.ts';
import { nameOf } from './staff.ts';
import type { Marked, RollNote } from './types.ts';

/** How much the instructions a remark did not write are damped while its own are brought out. */
const DAMPED = 0.35;
/** The pointer rests this long on a remark before its passage plays, and it plays on this long after the pointer has left. */
const DWELL: Ms = 500;
const LINGER: Ms = 200;
/**
 * Inside the passage of a remark that is lit, another's words take the pointer once it has rested
 * on them for so long, within so many pixels; crossed, they do not.
 */
const REST: Ms = 300;
const STILL = 4;
/** How long the notes of a rendering are waited for before its passage is played without them. */
const NOTES_WAIT: Ms = 6000;

/**
 * The seven levels of elaboration, as the front page's fader has them (shared/shape.ts), each named
 * by what the piano plays there; the quarters come twice, the second time at Grünfeld's tempo.
 */
const LEVELS = ELABORATION.points.map((elaboration, i) => {
  const plays = pianoPlays(elaboration);
  const again = i > 0 && pianoPlays(ELABORATION.points[i - 1]) === plays;
  return { elaboration, name: again ? `${plays}, at Grünfeld’s tempo` : plays };
});
/** The piece itself: what a passage is played as until another level is chosen for it. */
const PIECE = LEVELS.length - 1;

const ui = {
  roll: element('roll', HTMLCanvasElement),
  scroll: element('scroll', HTMLElement),
  spacer: element('spacer', HTMLElement),
  tip: element('tip', HTMLElement),
  loading: element('loading', HTMLElement),
  said: element('said', HTMLElement),
  where: element('where', HTMLElement),
  calls: element('calls', HTMLElement),
  play: element('play', HTMLButtonElement),
  playIcon: element('play-icon', SVGPathElement),
  level: element('level', HTMLSelectElement),
  bring: element('bring', HTMLInputElement),
  bringValue: element('bring-value', HTMLOutputElement),
  bringLabel: element('bring-label', HTMLElement),
  hint: element('hint', HTMLElement),
  staff: element('staff', HTMLButtonElement),
  notes: element('notes', HTMLButtonElement),
  zoomIn: element('zoom-in', HTMLButtonElement),
  zoomOut: element('zoom-out', HTMLButtonElement),
  fit: element('fit', HTMLButtonElement),
  interim: element('interim', HTMLElement),
};

const view = new RollView(ui.roll, ui.scroll, ui.spacer);
let described: Described | null = null;
/** The score and the MPM, for the player without sound: given once they are loaded. */
let performable: (texts: { msm: string; mpm: string }) => void = () => undefined;
// with `?silent` nothing sounds and no worker is started: the page keeps time by itself (sound.ts)
const player: PassagePlayer = new URLSearchParams(location.search).has('silent')
  ? silentPlayer(
      new Promise((resolve) => {
        performable = resolve;
      }),
    )
  : createPassagePlayer();

/** What the calls of the work file say, by their ids, for naming what a remark wrote. */
let instructions = new Map<string, Instruction>();
/** The level each remark was last played at, and the piece's own, for this visit. */
const levels = new Map<string, number>();
let pieceLevel = PIECE;
let factor = clamp(Number(recall('described.bring') ?? '1.5') || 1.5, 1, 1.9);

/* ---------- what is in focus ---------- */

/** The calls whose labels do not say what they are of (a curve's two levels, a count of notes). */
const UNNAMED: Partial<Record<Instruction['kind'], string>> = {
  dynamics: 'Dynamics',
  accentuation: 'Accents',
  articulation: 'Articulation',
};

const shown = (text: string): string =>
  text.length > 64 ? `${text.slice(0, 62)}…` : text.replace(/\s+/g, ' ');

/** The remark the foot speaks of and the controls act on: the one pointed at, else the one chosen. */
const inFocus = (): Marked | null => view.pointed ?? view.chosen;

function whereOf(marked: Marked): string {
  if (!described) return '';
  const { bars } = described.piece;
  const { about } = marked.remark;
  if (about.kind === 'piece') return 'the whole piece';
  if (about.kind === 'arrow' && marked.ends)
    return `${nameOf(marked.ends[0])} → ${nameOf(marked.ends[1])}, ${where(bars, marked.ends[0].date)} to ${where(bars, marked.ends[1].date)}`;
  const hands = new Set(marked.own.map((note) => note.part));
  const hand =
    about.kind !== 'span' && hands.size === 1 ? (hands.has(1) ? ', right hand' : ', left hand') : '';
  if (about.kind !== 'span' && marked.own.length === 1)
    return `${nameOf(marked.own[0])}, ${where(bars, marked.own[0].date)}${hand}`;
  const count = about.kind === 'span' ? '' : `${marked.own.length} notes, `;
  return `${count}${stretch(bars, about.from, about.to)}${hand}`;
}

function showFocus(): void {
  const marked = inFocus();
  const level = marked ? (levels.get(marked.remark.id) ?? PIECE) : pieceLevel;
  ui.level.value = String(level);
  ui.bring.disabled = !(view.chosen ?? view.brought);
  if (!marked || !described) {
    const count = described?.marked.length ?? 0;
    ui.said.textContent = '';
    ui.where.textContent = described
      ? `${count} ${count === 1 ? 'remark' : 'remarks'} on the playing, those on the longer passages from afar, the others as you zoom in. Point at one for its notes; rest on it, or click, to hear it.`
      : '';
    ui.calls.replaceChildren();
    return;
  }
  ui.said.textContent = marked.remark.text;
  ui.said.title = marked.remark.text;
  ui.where.textContent = whereOf(marked);
  // what it became: its calls, each named by what it wrote and opening in MPM Desk; those that
  // say the same (a remark about the whole piece can have a hundred) once, with how many
  const said = new Map<string, { readonly id: string; count: number }>();
  for (const id of marked.remark.calls) {
    const instruction = instructions.get(id);
    if (!instruction) continue;
    const kind = UNNAMED[instruction.kind];
    const label = kind ? `${kind}: ${instruction.label}` : instruction.label;
    const same = said.get(label);
    if (same) same.count += 1;
    else said.set(label, { id, count: 1 });
  }
  const links = [...said].map(([label, { id, count }]) => {
    const link = document.createElement('a');
    link.href = instructionIri(id);
    link.textContent = count > 1 ? `${label} × ${count}` : label;
    link.title = count > 1 ? 'Open the first of these calls in MPM Desk' : 'Open this call in MPM Desk';
    return link;
  });
  ui.calls.replaceChildren(...links);
}

/* ---------- playing ---------- */

let state: 'preparing' | 'playing' | 'stopped' = 'stopped';
/** The remark whose passage plays; null while the piece plays from the playhead, or nothing does. */
let bringing: Marked | null = null;
/** The remark whose rendering is being worked out, to be played once it is there. */
let pending: Marked | null = null;
/** Whether the passage that plays brings anything out. */
let emphasised = false;
/** Where the playhead rests, on the roll's clock. */
let at: Ms = 0;
/** Each asking for a rendering or a playing has a turn; only the latest counts. */
let turn = 0;
let unlocked = false;
let hovering: ReturnType<typeof setTimeout> | undefined;
/** Whether the pointer is on the slider: what is brought out stays while it is. */
let sliding = false;
/** While a remark is brought out: its rendering's clock on the roll's, for the playhead. */
let clock: { readonly dates: readonly Ticks[]; readonly ms: readonly Ms[] } | null = null;
let failed: string | null = null;

function showState(): void {
  const on = state !== 'stopped';
  ui.play.setAttribute('aria-pressed', String(on));
  ui.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
  ui.playIcon.setAttribute('d', on ? 'M2 1.5h3v9H2zM7 1.5h3v9H7z' : 'M2.5 1v10l8.5-5z');
  const strength = `× ${factor.toFixed(1)}`;
  if (failed) ui.hint.textContent = failed;
  else if (bringing && state === 'preparing')
    ui.hint.textContent = `Preparing “${shown(bringing.remark.text)}” …`;
  else if (bringing && emphasised)
    ui.hint.textContent = `Bringing out “${shown(bringing.remark.text)}”: what it wrote ${strength}, the rest held back, as ${LEVELS[levelOf(bringing)].name}.`;
  else if (bringing)
    ui.hint.textContent = `Playing “${shown(bringing.remark.text)}” as ${LEVELS[levelOf(bringing)].name}.`;
  else if (on) ui.hint.textContent = `Playing from the line, as ${LEVELS[pieceLevel].name}.`;
  else if (view.brought)
    ui.hint.textContent = `The notes show “${shown(view.brought.remark.text)}” brought out ${strength}.`;
  else ui.hint.textContent = 'Notes: what the MPM renders. Shadows: what was played. Space plays.';
}

const levelOf = (marked: Marked): number => levels.get(marked.remark.id) ?? PIECE;

function emphasisOf(marked: Marked): Emphasis | undefined {
  const ids = described?.written.get(marked.remark.id)?.ids ?? [];
  return ids.length > 0 ? { ids, factor, attenuation: DAMPED } : undefined;
}

/**
 * The stretch of the score played for a remark, in ticks, `to` exclusive: its passage with what
 * it takes around it; of a remark about the whole piece, what is in view.
 */
function passageOf(marked: Marked, d: Described): { from: Ticks; to: Ticks } {
  if (marked.heard) return marked.heard;
  const { piece, laid } = d;
  const { from, to } = view.inView;
  const first = piece.dates.find((date) => laid.msAt(date) >= from) ?? 0;
  const last = piece.dates.findLast((date) => laid.msAt(date) <= to) ?? piece.end;
  return { from: first, to: piece.dates.find((date) => date > Math.max(first, last)) ?? piece.end };
}

interface Rendering {
  readonly marked: Marked;
  readonly shown: ReadonlyMap<string, Sounded>;
  readonly from: Ticks;
  readonly to: Ticks;
  readonly emphasis: Emphasis | undefined;
}

/**
 * A remark's passage as espressivo performs it with the remark's instructions brought out: where
 * its notes are drawn. An exaggerated tempo moves every onset, so the rendering has a clock of its
 * own; it is laid on the roll's where the passage's first chord stands.
 */
async function render(marked: Marked): Promise<Rendering | null> {
  const d = described;
  if (!d) return null;
  const { from, to } = passageOf(marked, d);
  const emphasis = emphasisOf(marked);
  const plain: Rendering = { marked, shown: new Map(), from, to, emphasis };
  if (!emphasis) return plain;
  // without the rendering (the worker that performs it cannot start, or does not answer) the
  // passage is played all the same, the notes where they are
  const performed = await Promise.race([
    player.notes(emphasis).catch(() => null),
    new Promise<null>((resolve) => setTimeout(resolve, NOTES_WAIT, null)),
  ]);
  if (!performed) return plain;
  const fresh = d.roll.notes.flatMap((note) => {
    const sounds = note.date >= from && note.date < to ? performed.get(note.id) : undefined;
    return sounds ? [{ note, sounds }] : [];
  });
  if (fresh.length === 0) return plain;
  const first = Math.min(...fresh.map(({ note }) => note.date));
  const opening = fresh.filter(({ note }) => note.date === first);
  const shift =
    Math.min(...opening.map(({ note }) => note.mpm.ms)) - Math.min(...opening.map(({ sounds }) => sounds.on));
  return {
    ...plain,
    shown: new Map(
      fresh.map(({ note, sounds }) => [
        note.id,
        { ms: sounds.on + shift, msEnd: sounds.off + shift, velocity: sounds.velocity },
      ]),
    ),
  };
}

/** Draw the notes where a rendering has them, and keep its clock for the playhead. */
function show(rendering: Rendering): void {
  const d = described;
  if (!d) return;
  if (rendering.shown.size === 0) {
    if (view.brought) view.bring(null, true);
    clock = null;
    return;
  }
  // the first note of each date, as far as time goes on from one to the next
  const struck = new Map<Ticks, Ms>();
  for (const note of d.roll.notes) {
    const sounds = rendering.shown.get(note.id);
    if (sounds) struck.set(note.date, Math.min(struck.get(note.date) ?? Infinity, sounds.ms));
  }
  const dates: Ticks[] = [];
  const ms: Ms[] = [];
  for (const [date, on] of [...struck].sort((a, b) => a[0] - b[0])) {
    if (ms.length > 0 && on <= ms[ms.length - 1]) continue;
    dates.push(date);
    ms.push(on);
  }
  clock = dates.length > 1 ? { dates, ms } : null;
  view.bring({ marked: rendering.marked, shown: rendering.shown }, true);
}

/** Where a score position is on the roll, as the notes are drawn now. */
const msNow = (tick: Ticks): Ms =>
  clock && bringing ? along(clock.dates, clock.ms, tick) : (described?.laid.msAt(tick) ?? 0);

/** What a playing tells the page, as long as it is the latest: where it is, and when it is over. */
function listeners(mine: number, over: () => void): PassageListeners {
  return {
    onTick: (tick) => {
      if (mine === turn) view.playhead(msNow(tick), true);
    },
    onState: (next) => {
      if (mine !== turn) return;
      state = next;
      if (next === 'stopped') over();
      showState();
    },
  };
}

async function start(
  mine: number,
  request: Parameters<PassagePlayer['play']>[0],
  heard: PassageListeners,
): Promise<void> {
  failed = null;
  try {
    await player.play(request, heard);
  } catch {
    if (mine !== turn) return;
    state = 'stopped';
    bringing = null;
    failed = 'The roll could not be heard here.';
    view.playhead(at, false);
    showState();
  }
}

/** Show a remark brought out and play its passage. */
async function bring(marked: Marked, stillWanted: () => boolean = () => true): Promise<void> {
  halt();
  const mine = turn;
  pending = marked;
  const rendering = await render(marked);
  if (mine !== turn) return;
  pending = null;
  if (!rendering || !stillWanted()) return;
  show(rendering);
  bringing = marked;
  emphasised = rendering.emphasis !== undefined;
  state = 'preparing';
  showState();
  showFocus();
  const { from, to, emphasis } = rendering;
  await start(
    mine,
    { from, to, elaboration: LEVELS[levelOf(marked)].elaboration, ...(emphasis && { emphasis }) },
    listeners(mine, () => {
      // the passage is over: the line goes back to where it rests
      bringing = null;
      view.playhead(at, false);
      if (!kept()) rest();
    }),
  );
}

/**
 * Whether what is brought out, or about to be, is to stay: the slider is in hand, or its remark is
 * chosen or pointed at.
 */
function kept(): boolean {
  const remark = pending ?? bringing ?? view.brought;
  return sliding || (remark !== null && (remark === view.chosen || remark === view.pointed));
}

/** Stop what plays, whoever asked for it; the line goes back to where it rests. */
function halt(): void {
  // what is still being worked out is not played after all
  turn += 1;
  if (state !== 'stopped') player.stop();
  state = 'stopped';
  bringing = null;
  pending = null;
  view.follow(false);
  view.playhead(at, false);
}

/** Put the notes back where the MPM has them, and stop what was brought out. */
function rest(): void {
  // the piece playing from the line is no remark's: it goes on
  if (bringing || state === 'stopped') halt();
  if (view.brought) view.bring(null, true);
  clock = null;
  showState();
  showFocus();
}

/** Play the piece from the line, to its end. */
async function playOn(from: Ms = at): Promise<void> {
  const d = described;
  if (!d) return;
  halt();
  if (view.brought) view.bring(null, true);
  clock = null;
  const mine = turn;
  // from the line where it is in view, else from the left edge of what is
  const seen = from >= view.inView.from && from < view.inView.to;
  const begin = seen ? from : Math.max(0, view.inView.from);
  const first = d.laid.dateAt(begin < d.roll.total - 200 ? begin : 0);
  state = 'preparing';
  // no remark's notes are in sight for it: those around the line are, as it goes
  view.playhead(begin, false);
  view.follow(true);
  showState();
  await start(
    mine,
    { from: Math.max(0, first), to: d.piece.end, elaboration: LEVELS[pieceLevel].elaboration },
    listeners(mine, () => {
      // at its end the line goes back to the beginning
      at = 0;
      view.follow(false);
      view.playhead(at, false);
    }),
  );
}

function toggle(): void {
  if (!described) return;
  if (state !== 'stopped') {
    // stopped by hand, the piece's line stays where it has come to; a passage's goes back
    if (!bringing) at = view.playheadMs;
    halt();
    if (view.brought && !kept()) rest();
    showState();
    return;
  }
  const marked = view.chosen;
  if (marked) void bring(marked);
  else void playOn();
}

/** The pointer came to rest on a remark, or left it. */
function hover(marked: Marked | null): void {
  clearTimeout(hovering);
  const free = unlocked && (state === 'stopped' || bringing !== null);
  if (marked && free && marked !== bringing)
    hovering = setTimeout(() => {
      // clicked meanwhile, it plays already
      if (marked !== bringing && marked !== pending) void bring(marked, () => view.pointed === marked);
    }, DWELL);
  else if (!marked)
    hovering = setTimeout(() => {
      if (!kept()) rest();
    }, LINGER);
}

/** Choose a remark and play its passage, or with null let go of the one chosen. */
function choose(marked: Marked | null): void {
  const before = view.chosen;
  view.choose(marked);
  showFocus();
  if (marked) {
    view.reveal(marked);
    if (unlocked) void bring(marked);
    else showState();
  } else if (before && (view.brought === before || bringing === before || pending === before)) rest();
}

/**
 * The slider moved: the notes go to where the rendering now has them. One rendering is worked out
 * at a time, and of the moves made meanwhile only the latest counts.
 */
let moves = 0;
let strengthening = false;
async function strengthen(): Promise<void> {
  moves += 1;
  if (strengthening) return;
  strengthening = true;
  for (let seen = -1; seen !== moves;) {
    seen = moves;
    const marked = view.chosen ?? view.brought;
    if (!marked) break;
    // what plays is of the slider's last place: it stops, and plays again once the slider is let go
    halt();
    const mine = turn;
    const rendering = await render(marked);
    if (rendering && mine === turn && seen === moves) show(rendering);
  }
  strengthening = false;
  showState();
}

/* ---------- the pointer ---------- */

const local = (event: MouseEvent): { x: number; y: number } => {
  const box = ui.roll.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
};

function showTip(note: RollNote, x: number, y: number): void {
  if (!described) return;
  const line = (label: string, text: string): HTMLElement => {
    const row = document.createElement('div');
    const key = document.createElement('span');
    key.className = 'k';
    key.textContent = label;
    row.append(key, text);
    return row;
  };
  const head = document.createElement('div');
  const name = document.createElement('b');
  name.textContent = nameOf(note);
  head.append(
    name,
    ` · ${where(described.piece.bars, note.date)} · ${note.part === 1 ? 'right hand' : 'left hand'}`,
  );
  const late = note.played.ms - note.mpm.ms;
  const loud = note.played.velocity - note.mpm.velocity;
  const long = note.played.msEnd - note.played.ms - (note.mpm.msEnd - note.mpm.ms);
  const off = [
    Math.abs(late) >= 8 ? `${Math.round(Math.abs(late))} ms ${late > 0 ? 'too early' : 'too late'}` : '',
    Math.abs(loud) >= 1.5 ? `${Math.abs(loud).toFixed(1)} ${loud > 0 ? 'too soft' : 'too loud'}` : '',
    Math.abs(long) >= 30 ? `${Math.round(Math.abs(long))} ms ${long > 0 ? 'too short' : 'too long'}` : '',
  ].filter(Boolean);
  ui.tip.replaceChildren(
    head,
    line(
      'played',
      `velocity ${Math.round(note.played.velocity)}, ${Math.round(note.played.msEnd - note.played.ms)} ms long`,
    ),
    line('the MPM', off.length > 0 ? `has it ${off.join(', ')}` : 'has it as it was played'),
  );
  ui.tip.hidden = false;
  const left = clamp(x + 14, view.gutter, view.width - ui.tip.offsetWidth - 8);
  const top = y + 16 + ui.tip.offsetHeight > view.height ? y - ui.tip.offsetHeight - 10 : y + 16;
  ui.tip.style.left = `${left}px`;
  ui.tip.style.top = `${top}px`;
}

let pressed: { x: number; y: number } | null = null;
ui.roll.addEventListener('pointerdown', (event) => {
  if (event.button > 0) return;
  pressed = local(event);
  ui.tip.hidden = true;
});
ui.roll.addEventListener('pointerup', (event) => {
  const down = pressed;
  pressed = null;
  if (!down || !described) return;
  const { x, y } = local(event);
  // a touch that moved was scrolling the roll
  if (Math.hypot(x - down.x, y - down.y) >= 8) return;
  const hit = view.hit(x, y);
  const marked = hit.direct ?? hit.held;
  settle(null);
  // a click takes the pointer along, also to words it had only crossed
  if (marked && event.pointerType !== 'touch') point(marked);
  if (marked) choose(marked);
  else if (view.chosen) choose(null);
  else if (x >= view.gutter && !hit.above) {
    // a click on nothing leaves the line there, and what plays goes on from it
    at = clamp(view.msOf(x), 0, described.roll.total);
    if (state !== 'stopped' && !bringing) void playOn(at);
    else view.playhead(at, false);
  }
});
ui.roll.addEventListener('pointercancel', () => {
  pressed = null;
});
/** Point at a remark, and at a note with it; a remark newly pointed at is in focus, and plays once dwelt on. */
function point(marked: Marked | null, note: RollNote | null = null): void {
  const before = view.pointed;
  view.point(marked, note);
  if (marked === before) return;
  hover(marked);
  showFocus();
}

/** The words the pointer is on inside another remark's passage, where it came to them, and what waits for it to rest. */
let crossing: {
  readonly on: Marked;
  readonly x: number;
  readonly y: number;
  readonly timer: ReturnType<typeof setTimeout>;
} | null = null;
/** The pointer is on such words at a place (or with null on none): rested on, they take it. */
function settle(on: Marked | null, x = 0, y = 0): void {
  if (crossing?.on === on && Math.hypot(x - crossing.x, y - crossing.y) < STILL) return;
  clearTimeout(crossing?.timer);
  crossing = on && {
    on,
    x,
    y,
    timer: setTimeout(() => {
      crossing = null;
      point(on);
    }, REST),
  };
}

ui.roll.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  const { x, y } = local(event);
  const { direct, held, note } = view.hit(x, y);
  // the pointer stays with a lit remark over its passage: another's words there are only crossed
  const crossed = direct && held && direct !== held && direct !== view.pointed ? direct : null;
  const marked = crossed ? held : (direct ?? held);
  settle(crossed, x, y);
  // words lie over the notes: on its own words, a remark's notes are not pointed at
  const under = direct && !crossed ? null : note;
  point(marked, under);
  ui.roll.style.cursor = (direct ?? marked) ? 'pointer' : 'default';
  if (under) showTip(under, x, y);
  else ui.tip.hidden = true;
});
ui.roll.addEventListener('pointerleave', () => {
  ui.tip.hidden = true;
  settle(null);
  point(null);
});
ui.scroll.addEventListener('scroll', () => {
  ui.tip.hidden = true;
});
ui.roll.addEventListener(
  'wheel',
  (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    // a wheel turns in small steps of its own: each is taken at once
    view.zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, local(event).x, false);
  },
  { passive: false },
);

/* ---------- the controls ---------- */

for (const [index, level] of LEVELS.entries()) ui.level.append(new Option(level.name, String(index)));
ui.level.addEventListener('change', () => {
  const index = clamp(Number(ui.level.value), 0, LEVELS.length - 1);
  const marked = view.chosen;
  if (marked) {
    levels.set(marked.remark.id, index);
    // its passage again, as it is now to be played
    if (unlocked) void bring(marked);
  } else {
    pieceLevel = index;
    if (state !== 'stopped' && !bringing) void playOn(view.playheadMs);
  }
  showState();
});

const showStrength = (): void => {
  ui.bring.value = String(factor);
  ui.bringValue.value = `× ${factor.toFixed(1)}`;
};
ui.bring.addEventListener('input', () => {
  factor = clamp(Number(ui.bring.value), 1, 1.9);
  remember('described.bring', String(factor));
  showStrength();
  void strengthen();
});
// let go of, the slider's remark is played as it now stands
ui.bring.addEventListener('change', () => {
  const marked = view.chosen ?? view.brought;
  if (marked && unlocked) void bring(marked);
});
ui.bringLabel.addEventListener('pointerenter', () => {
  sliding = true;
});
const letGo = (): void => {
  sliding = false;
  if (!kept() && !bringing) rest();
};
ui.bringLabel.addEventListener('pointerleave', letGo);
ui.bring.addEventListener('blur', letGo);

ui.play.addEventListener('click', toggle);
ui.staff.addEventListener('click', () => {
  view.staff = !view.staff;
  ui.staff.setAttribute('aria-pressed', String(view.staff));
  remember('described.staff', view.staff ? 'on' : 'off');
});
ui.notes.addEventListener('click', () => {
  view.allNotes = !view.allNotes;
  ui.notes.setAttribute('aria-pressed', String(view.allNotes));
  remember('described.notes', view.allNotes ? 'on' : 'off');
});
ui.zoomIn.addEventListener('click', () => {
  view.zoom(1.3);
});
ui.zoomOut.addEventListener('click', () => {
  view.zoom(1 / 1.3);
});
ui.fit.addEventListener('click', () => {
  view.fit();
});

// sound can only be opened from a gesture; after the first one a remark plays when pointed at
for (const gesture of ['pointerdown', 'keydown'] as const)
  document.addEventListener(
    gesture,
    () => {
      unlocked = true;
      try {
        player.unlock();
      } catch (error) {
        // no sound to be had here: the roll is read all the same, and a passage says so when asked for
        console.warn('The sound could not be opened.', error);
      }
    },
    { once: true, capture: true },
  );

/** The remarks that are there at this zoom, in the order of the score, for going from one to the next. */
const inOrder = (): Marked[] =>
  (described?.marked ?? [])
    .filter((marked) => view.readable(marked))
    .sort((a, b) => a.remark.about.from - b.remark.about.from || a.remark.about.to - b.remark.about.to);

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
  if (!described || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Escape') {
    if (view.chosen) choose(null);
    return;
  }
  if (typing) return;
  if (event.key === ' ' && !(target instanceof HTMLButtonElement) && !(target instanceof HTMLAnchorElement)) {
    event.preventDefault();
    toggle();
    return;
  }
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const order = inOrder();
    if (order.length === 0) return;
    event.preventDefault();
    const index = view.chosen ? order.indexOf(view.chosen) : -1;
    const next =
      event.key === 'ArrowRight'
        ? order[Math.min(order.length - 1, index + 1)]
        : order[Math.max(0, index < 0 ? 0 : index - 1)];
    choose(next);
  }
});

/* ---------- loading ---------- */

async function load(): Promise<void> {
  const get = async (path: string): Promise<string> => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.text();
  };
  const [msm, mei, mpm, workJson] = await Promise.all([
    get('../mpm/score.msm'),
    get('../mpm/transcription.mei'),
    get('../mpm/performance.mpm'),
    get('../mpm/work.json'),
  ]);
  const work = JSON.parse(workJson) as unknown;
  // the remarks are the work file's; until it has any, those carried over from the segments
  const hasRemarks = /"name"\s*:\s*"Describe"/.test(workJson);
  const remarks = hasRemarks ? null : (JSON.parse(await get('../described/remarks.json')) as unknown);
  described = assemble({ msm, mei, mpm, work, remarks });
  performable({ msm, mpm });

  const elements = mpmElements(new DOMParser().parseFromString(mpm, 'application/xml'));
  // each call by itself: read together, of the calls of which one holds at a time only that one is kept
  const calls = (work as { provenance?: unknown }).provenance;
  instructions = new Map(
    (Array.isArray(calls) ? (calls as unknown[]) : [])
      .flatMap((call) => readInstructions({ provenance: [call] }, (id) => elements.get(id)))
      .map((instruction) => [instruction.id, instruction]),
  );

  ui.interim.hidden = !described.interim;
  view.staff = recall('described.staff') !== 'off';
  ui.staff.setAttribute('aria-pressed', String(view.staff));
  view.allNotes = recall('described.notes') === 'on';
  ui.notes.setAttribute('aria-pressed', String(view.allNotes));
  view.set(described.roll, described.marked);
  ui.loading.hidden = true;
  ui.play.disabled = false;
  showStrength();
  showFocus();
  showState();
}

showStrength();
load().catch((error: unknown) => {
  console.error(error);
  ui.loading.hidden = false;
  ui.loading.textContent = 'The roll could not be loaded. Reload the page to try again.';
});
