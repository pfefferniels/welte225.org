// The harmonic reductions the barer end of the fader plays, and what the voice sings over them.
//
// In half notes (reduction/halves.mei) the reduction runs evenly, chord after chord on the half
// note, as it was drafted; in quarter notes it is derived from that, the whole harmony sounding on
// every quarter struck again. The MPM's tempo and dynamics apply to them as they are; its rubato,
// accents, articulation and pedalling do not, and of its arpeggios each chord is rolled as the piece
// rolls it where it stands in the piece (reduction/harmonies.mei has every chord there). The voice
// sings one held note for each chord of the half notes, also over the quarters: what the melodic
// reduction (reduction.mei) sings where that chord stands in the piece.
import { Msm, type Element } from 'espressivo';
import type { Reduction, SungNote } from '../reduction/types.ts';
import type { Stage } from '../shared/shape.ts';
import type { Ticks } from '../shared/units.ts';
import { GRACE } from './harmonies.ts';

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const QUARTER: Ticks = 720;
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
 * The MPM as the reductions are performed with: its tempo and dynamics as they are, no rubato,
 * accents, articulation or pedalling; and of its arpeggios, at each chord of the half notes the
 * one the piece has where that chord stands (in ascending pitch where the piece names its notes).
 */
export function reductionMpm(mpm: string, places: ReadonlyMap<Ticks, Ticks>): string {
  let out = mpm;
  for (const name of LEFT_OUT)
    out = out.replace(new RegExp(`<${name}\\b[^>]*/>|<${name}\\b[^>]*>[\\s\\S]*?</${name}>`, 'g'), '');
  return out.replace(
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
      const moved = [...places.entries()]
        .sort((a, b) => a[0] - b[0])
        .flatMap(([date, place]) => {
          const tag = arpeggios.get(place);
          if (!tag) return [];
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

/** The reductions, made once from the half notes, the harmonies where they stand and the MPM. */
export interface Reductions {
  readonly halves: string;
  readonly quarters: string;
  readonly mpm: string;
  /** What the voice sings over them, from the melodic reduction. */
  readonly line: (melodic: Reduction) => Reduction;
}

export function reductions(halves: string, harmonies: string, mpm: string): Reductions {
  const chords = chordsOf(halves);
  const places = placesInPiece(chords, chordsOf(harmonies));
  let line: { readonly of: Reduction; readonly is: Reduction } | null = null;
  return {
    halves,
    quarters: quartersScore(halves),
    mpm: reductionMpm(mpm, places),
    line: (melodic) => {
      if (line?.of !== melodic) line = { of: melodic, is: harmonicLine(chords, places, melodic) };
      return line.is;
    },
  };
}

/** The piece and the MPM, as the voice and the piano read them. */
export interface Score {
  readonly msm: string;
  readonly mpm: string;
}

/** The harmonies the piano has beside the piece at a stage: in half notes there, else in quarters. */
export const harmoniesAt = (stage: Stage, r: () => Reductions): string =>
  stage === 'halves' ? r().halves : r().quarters;

/**
 * What the voice follows at a stage: the piece, or the reduction the piano plays with the reductions'
 * MPM, so that it is rolled as the piano rolls it (the quarters strike held notes again, which roll
 * with the rest); the line's notes are the half notes', which the quarters strike first by the same ids.
 */
export const voiceScore = (stage: Stage, piece: Score, r: () => Reductions): Score =>
  stage === 'piece' ? piece : { msm: harmoniesAt(stage, r), mpm: r().mpm };

/** What the voice sings at a stage: the melodic reduction over the piece, else the line over the reductions. */
export const sungReduction = (stage: Stage, melodic: Reduction, r: () => Reductions): Reduction =>
  stage === 'piece' ? melodic : r().line(melodic);
