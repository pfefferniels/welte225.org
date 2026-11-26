// The harmonic reductions the barer end of the fader plays, and what the voice sings over them.
//
// Three are written: in half notes (reduction/halves.mei), running evenly, chord after chord on the
// half note, as it was drafted; in quarter notes (reduction/quarters.mei), made by hand from the
// accompaniment; and the accompaniment itself, every chord where the piece has it
// (reduction/harmonies.mei). The half notes are struck again on every quarter, the quarters on every
// eighth. The MPM's tempo and dynamics apply to them as they are; its rubato, accents, articulation
// and pedalling do not, and of its arpeggios each chord is rolled as the piece rolls it where it
// stands in the piece (found among the accompaniment's chords). Over each the voice sings one held
// note for each chord as written: what the melodic reduction (reduction.mei) sings where that chord
// stands in the piece.
import { Msm, type Element } from 'espressivo';
import type { Reduction, SungNote } from '../reduction/types.ts';
import type { Roll } from '../shared/protocol.ts';
import type { Follows, Reduced as ReducedName } from '../shared/shape.ts';
import type { Ticks } from '../shared/units.ts';
import { GRACE } from './harmonies.ts';
import { gridRepeat } from './repeats.ts';

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const QUARTER: Ticks = 720;
const EIGHTH: Ticks = 360;
/** How far from its place in the half notes a chord is looked for in the piece. */
const REACH: Ticks = 2 * 2880;

/** A note of a score, as the reductions read it. */
interface ScoreNote {
  readonly id: string;
  readonly date: Ticks;
  readonly duration: Ticks;
  readonly pitch: number;
}

/** A chord: the notes struck together at a date. */
export interface Chord {
  readonly date: Ticks;
  readonly notes: readonly ScoreNote[];
}

const scoreOf = (part: Element): Element | null =>
  part.getFirstChildElement('dated')?.getFirstChildElement('score') ?? null;

function notesOf(part: Element): ScoreNote[] {
  const score = scoreOf(part);
  if (!score) return [];
  return [...score.getChildElements('note')].map((n) => ({
    id: n.getAttributeValue('id', XML_NAMESPACE) ?? '',
    date: Number(n.getAttributeValue('date')),
    duration: Number(n.getAttributeValue('duration')),
    pitch: Number(n.getAttributeValue('midi.pitch')),
  }));
}

/** A grace note, put back by harmonies.ts as a thirty-second off the quarter's pulse. */
const grace = (n: ScoreNote): boolean => n.duration <= GRACE && n.date % QUARTER !== 0;

/** The chords of a score, every part together, in order; grace notes are none. */
export function chordsOf(msm: string): Chord[] {
  const notes = new Msm(msm).getPartsArray().flatMap(notesOf);
  const byDate = new Map<Ticks, ScoreNote[]>();
  for (const n of notes) {
    if (grace(n)) continue;
    const at = byDate.get(n.date);
    if (at) at.push(n);
    else byDate.set(n.date, [n]);
  }
  return [...byDate.entries()].sort((a, b) => a[0] - b[0]).map(([date, chord]) => ({ date, notes: chord }));
}

/** How alike two chords are: the share of their pitches they have in common. */
function likeness(a: Chord, b: Chord): number {
  const x = new Set(a.notes.map((n) => n.pitch));
  const y = new Set(b.notes.map((n) => n.pitch));
  const both = [...x].filter((p) => y.has(p)).length;
  return both / new Set([...x, ...y]).size;
}

/**
 * Where each chord of the half notes stands in the piece: the chord of the harmonies most like it
 * (the same notes, or most of them: an appoggiatura is written out there) near its place, and no
 * earlier than where the chord before stands. A chord found nowhere stands where it is.
 */
export function placesInPiece(halves: readonly Chord[], harmonies: readonly Chord[]): Map<Ticks, Ticks> {
  const places = new Map<Ticks, Ticks>();
  let after = -Infinity;
  for (const chord of halves) {
    let best: { readonly date: Ticks; readonly like: number } | null = null;
    for (const other of harmonies) {
      if (other.date < after || Math.abs(other.date - chord.date) > REACH) continue;
      const like = likeness(chord, other);
      if (
        like > 0 &&
        (!best ||
          like > best.like ||
          (like === best.like && Math.abs(other.date - chord.date) < Math.abs(best.date - chord.date)))
      )
        best = { date: other.date, like };
    }
    const place = best?.date ?? chord.date;
    places.set(chord.date, place);
    after = place;
  }
  return places;
}

/**
 * The reduction in quarter notes: on every quarter, the whole harmony that sounds there in the half
 * notes, struck again (each note in its own part); grace notes as they are.
 */
export function quartersScore(halvesMsm: string): string {
  const msm = new Msm(halvesMsm);
  for (const part of msm.getPartsArray()) {
    const score = scoreOf(part);
    if (!score) continue;
    const notes = notesOf(part);
    for (const n of [...score.getChildElements('note')]) score.removeChild(n);
    const struck: ScoreNote[] = [];
    for (const n of notes) {
      if (grace(n)) {
        struck.push(n);
        continue;
      }
      for (let q = n.date, k = 0; q < n.date + n.duration; q += QUARTER, k++)
        struck.push({
          id: k === 0 ? n.id : `${n.id}-q${k}`,
          date: q,
          duration: Math.min(QUARTER, n.date + n.duration - q),
          pitch: n.pitch,
        });
    }
    struck.sort((a, b) => a.date - b.date || a.pitch - b.pitch);
    for (const n of struck)
      msm.addNote(part, { date: n.date, duration: n.duration, midiPitch: n.pitch, id: n.id });
  }
  return msm.toXML();
}

/** The maps of the MPM the reductions leave out: they keep to its tempo and dynamics alone. */
const LEFT_OUT = ['rubatoMap', 'articulationMap', 'metricalAccentuationMap', 'movementMap'] as const;

/**
 * Where each chord the reductions strike is rolled from: for every strike, in half notes or in
 * quarters, the place in the piece of the chord of the half notes it belongs to. A chord struck
 * again on the quarter is rolled again, as the piece rolls it there; the MPM gives its arpeggios in
 * ticks, so a roll lasts as long as its stretch of the score takes where it is struck, and over a
 * ritardando the same roll comes slower.
 */
export function strikesInPiece(
  halves: readonly Chord[],
  quarters: readonly Chord[],
  places: ReadonlyMap<Ticks, Ticks>,
): Map<Ticks, Ticks> {
  const strikes = new Map(places);
  let i = -1;
  for (const { date } of quarters) {
    while (i + 1 < halves.length && halves[i + 1].date <= date) i++;
    const chord = halves.at(i);
    if (chord && !strikes.has(date)) strikes.set(date, places.get(chord.date) ?? chord.date);
  }
  return strikes;
}

/**
 * The MPM as the reductions are performed with: its tempo and dynamics as they are, no rubato,
 * accents, articulation or pedalling; and of its arpeggios, at each strike the one the piece has
 * where the chord struck stands (`strikesInPiece`; in ascending pitch where the piece names its
 * notes). With it, where each is rolled: at which strike, as which of the piece's arpeggios.
 */
export function reductionMpm(
  mpm: string,
  strikes: ReadonlyMap<Ticks, Ticks>,
): { readonly mpm: string; readonly rolls: readonly Roll[] } {
  let out = mpm;
  for (const name of LEFT_OUT)
    out = out.replace(new RegExp(`<${name}\\b[^>]*/>|<${name}\\b[^>]*>[\\s\\S]*?</${name}>`, 'g'), '');
  const rolls: Roll[] = [];
  out = out.replace(
    /(<ornamentationMap\b[^>]*>)([\s\S]*?)(<\/ornamentationMap>)/,
    (_, open: string, body: string, close: string) => {
      const arpeggios = new Map<Ticks, string>();
      for (const m of body.matchAll(/<ornament\b[^>]*\/>/g)) {
        const tag = m[0];
        if (/\snoteid=/.test(tag)) continue;
        const date = Number(/\sdate="([^"]+)"/.exec(tag)?.[1]);
        if (!arpeggios.has(date)) arpeggios.set(date, tag);
      }
      const kept = body.replace(/<ornament\b[^>]*\/>|<ornament\b[^>]*>[\s\S]*?<\/ornament>/g, '');
      const moved = [...strikes.entries()]
        .sort((a, b) => a[0] - b[0])
        .flatMap(([date, place]) => {
          const tag = arpeggios.get(place);
          if (!tag) return [];
          const ornament = /\sxml:id="([^"]*)"/.exec(tag)?.[1];
          if (ornament) rolls.push({ date, ornament });
          return [
            tag
              .replace(/\sdate="[^"]*"/, ` date="${date}"`)
              .replace(/\sxml:id="([^"]*)"/, ` xml:id="$1-at-${date}"`)
              .replace(/\snote\.order="#[^"]*"/, ' note.order="ascending pitch"'),
          ];
        });
      return open + kept + moved.join('') + close;
    },
  );
  return { mpm: out, rolls };
}

/** The melodic reduction's note at a place in the piece; in a rest, the next before `until`, else the last. */
function sungAt(melodic: Reduction, place: Ticks, until: Ticks): SungNote | null {
  const notes = melodic.events.filter((e): e is SungNote => e.kind === 'note');
  return (
    notes.find((n) => n.start <= place && place < n.end) ??
    notes.find((n) => n.start > place && n.start < until) ??
    notes.filter((n) => n.start <= place).at(-1) ??
    null
  );
}

/**
 * What the voice sings over the reductions: for each chord of the half notes, held until the next,
 * the note the melodic reduction sings where that chord stands in the piece; the same note again,
 * held on. Each follows the lowest note of its chord, struck first where the chord is rolled.
 */
export function harmonicLine(
  halves: readonly Chord[],
  places: ReadonlyMap<Ticks, Ticks>,
  melodic: Reduction,
): Reduction {
  const events: SungNote[] = [];
  halves.forEach((chord, i) => {
    const next = halves.at(i + 1);
    const end = next?.date ?? Math.max(...chord.notes.map((n) => n.date + n.duration));
    const place = places.get(chord.date) ?? chord.date;
    const nextPlace = next ? (places.get(next.date) ?? next.date) : Infinity;
    const sung = sungAt(melodic, place, nextPlace);
    if (!sung) return;
    const last = events.at(-1);
    if (last?.pitch === sung.pitch && last.end === chord.date) {
      events[events.length - 1] = { ...last, end, pedal: true };
      return;
    }
    const lowest = chord.notes.reduce((a, b) => (b.pitch < a.pitch ? b : a));
    events.push({
      kind: 'note',
      id: `l${chord.date}`,
      ref: lowest.id,
      pitch: sung.pitch,
      start: chord.date,
      end,
      pedal: false,
    });
  });
  return { events, bars: melodic.bars };
}

/** A harmonic reduction: its score and its MPM, and where it rolls a chord as the piece rolls it. */
export interface Reduced extends Score {
  readonly rolls: readonly Roll[];
}

/** The scores the reductions are made from (MSM): the half notes, the quarters, the accompaniment. */
export interface ReductionScores {
  readonly halves: string;
  readonly quarters: string;
  readonly accompaniment: string;
}

/**
 * The reductions, each made when first asked for: with an MPM of its own, rolled where it strikes
 * alone (an arpeggio dated where a score strikes nothing, espressivo gives to the next chord it
 * strikes); and what the voice sings over each, from the melodic reduction.
 */
export interface Reductions {
  readonly reduced: (name: ReducedName) => Reduced;
  readonly line: (name: ReducedName, melodic: Reduction) => Reduction;
}

/** Which of the three written a reduction is, or strikes again. */
const writtenName = (name: ReducedName): 'halves' | 'quarters' | 'accompaniment' =>
  name.startsWith('halves') ? 'halves' : name.startsWith('quarters') ? 'quarters' : 'accompaniment';

/** A reduction as written, and where its chords stand in the piece (found among the accompaniment's). */
interface Written {
  readonly msm: string;
  readonly chords: readonly Chord[];
  readonly places: ReadonlyMap<Ticks, Ticks>;
}

export function reductions(scores: ReductionScores, mpm: string): Reductions {
  const memo = <K, V>(make: (key: K) => V): ((key: K) => V) => {
    const made = new Map<K, V>();
    return (key) => {
      if (!made.has(key)) made.set(key, make(key));
      return made.get(key) as V;
    };
  };
  let placed: readonly Chord[] | null = null;
  const accompaniment = (): readonly Chord[] => (placed ??= chordsOf(scores.accompaniment));
  /** Each reduction is written as one of three; the others strike one of these again. */
  const written = memo((name: 'halves' | 'quarters' | 'accompaniment'): Written => {
    const msm = scores[name];
    const chords = chordsOf(msm);
    return { msm, chords, places: placesInPiece(chords, accompaniment()) };
  });
  const writtenOf = (name: ReducedName): Written => written(writtenName(name));
  const reduced = memo((name: ReducedName): Reduced => {
    const w = writtenOf(name);
    if (!name.includes(' on ')) return { msm: w.msm, ...reductionMpm(mpm, w.places) };
    const again = name === 'halves on quarters' ? quartersScore(w.msm) : gridRepeat(w.msm, EIGHTH);
    return { msm: again, ...reductionMpm(mpm, strikesInPiece(w.chords, chordsOf(again), w.places)) };
  });
  // the line over a reduction is the line over the one it is written as, for the melodic reduction last asked with
  let lines: { readonly of: Reduction; readonly made: Map<string, Reduction> } | null = null;
  return {
    reduced,
    line: (name, melodic) => {
      if (lines?.of !== melodic) lines = { of: melodic, made: new Map() };
      const { chords, places } = writtenOf(name);
      const line = lines.made.get(writtenName(name)) ?? harmonicLine(chords, places, melodic);
      lines.made.set(writtenName(name), line);
      return line;
    },
  };
}

/** The piece and the MPM, as the voice and the piano read them. */
export interface Score {
  readonly msm: string;
  readonly mpm: string;
}

/** The harmonies the piano has beside the piece: a reduction, and its MPM. */
export const harmoniesAt = (name: ReducedName, r: () => Reductions): Reduced => r().reduced(name);

/** Whether the voice follows the piece: humming the melodic reduction over it, or singing its melody. */
const ofThePiece = (follows: Follows): follows is 'piece' | 'melody' =>
  follows === 'piece' || follows === 'melody';

/**
 * What the voice follows: the piece, or a reduction the piano plays with the reductions' MPM, so
 * that it is rolled as the piano rolls it (a reduction struck again strikes held notes again, which
 * roll with the rest); the line's notes are the reduction's as written, which one struck again
 * strikes first by the same ids.
 */
export const voiceScore = (follows: Follows, piece: Score, r: () => Reductions): Score =>
  ofThePiece(follows) ? piece : r().reduced(follows);

/**
 * What the voice sings: over the piece the melodic reduction; the melody, the piece's top voice
 * (`melody`, by octaves where it is sung); over a reduction the line over it.
 */
export const sungReduction = (
  follows: Follows,
  melodic: Reduction,
  r: () => Reductions,
  melody: () => Reduction,
): Reduction =>
  follows === 'piece' ? melodic : follows === 'melody' ? melody() : r().line(follows, melodic);
