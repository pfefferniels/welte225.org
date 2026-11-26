// The piece and the reductions struck again on a grid (every eighth, every sixteenth), the MPM that
// rolls the chords struck again, and the melody: the piece's top voice, as the voice sings it.
//
// A note struck again on the grid strikes at its own date, then at every multiple of the grid's unit
// while it sounds. Where two notes or more are struck again together and the MPM rolls nothing there,
// the chord is rolled between the chord rolled before and the one rolled after: as far from each as
// it stands from it, its spread (offset, length, intensity) and the velocities across it morph from
// the one into the other.
import { Msm, type Element } from 'espressivo';
import type { Reduction, ReductionEvent } from '../reduction/types.ts';
import type { Ticks } from '../shared/units.ts';
import { GRACE } from './harmonies.ts';

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const QUARTER: Ticks = 720;

/**
 * A score with every note struck again on the grid of `unit` while it sounds: at its own date, then
 * at every multiple of `unit` after it, each strike as long as to the next or to the note's end. A
 * grace note, a note no longer than `unit`, and a note whose id `only` turns down, as they are. The
 * first strike keeps the note's id; the others are `<id>-r<k>`.
 */
export function gridRepeat(text: string, unit: Ticks, only: (id: string) => boolean = () => true): string {
  const msm = new Msm(text);
  for (const part of msm.getPartsArray()) {
    const score = part.getFirstChildElement('dated')?.getFirstChildElement('score') as Element | undefined;
    if (!score) continue;
    const notes = [...score.getChildElements('note')].map((n) => ({
      id: n.getAttributeValue('id', XML_NAMESPACE) ?? '',
      date: Number(n.getAttributeValue('date')),
      duration: Number(n.getAttributeValue('duration')),
      pitch: Number(n.getAttributeValue('midi.pitch')),
    }));
    for (const n of [...score.getChildElements('note')]) score.removeChild(n);
    const struck: typeof notes = [];
    for (const n of notes) {
      const end = n.date + n.duration;
      if ((n.duration <= GRACE && n.date % QUARTER !== 0) || n.duration <= unit || !only(n.id)) {
        struck.push(n);
        continue;
      }
      const at = [n.date];
      for (let g = (Math.floor(n.date / unit) + 1) * unit; g < end; g += unit) at.push(g);
      at.forEach((date, k) => {
        struck.push({
          id: k === 0 ? n.id : `${n.id}-r${k}`,
          date,
          duration: (at.at(k + 1) ?? end) - date,
          pitch: n.pitch,
        });
      });
    }
    struck.sort((a, b) => a.date - b.date || a.pitch - b.pitch);
    for (const n of struck)
      msm.addNote(part, { date: n.date, duration: n.duration, midiPitch: n.pitch, id: n.id });
  }
  return msm.toXML();
}

/** A chord's roll as the MPM has it: the spread over its notes, and the velocities across them. */
interface Roll {
  readonly date: Ticks;
  /** The spread's frame, in ticks; with none, a frame of no length at the chord's date. */
  readonly offset: number;
  readonly length: number;
  readonly intensity: number;
  readonly noteoff: string | null;
  /** The velocities added to the first and the last note: the gradient's ends times the scale. */
  readonly from: number;
  readonly to: number;
}

const numberIn = (text: string, name: string, otherwise: number): number => {
  const value = new RegExp(`\\s${name.replace('.', '\\.')}="(-?[\\d.eE+-]+)`).exec(text)?.[1];
  return value === undefined ? otherwise : Number(value);
};

/** The roll an ornament makes with its definition, read with espressivo's defaults. */
function rollOf(ornament: string, def: string): Roll {
  const spread = /<temporalSpread\b[^>]*>/.exec(def)?.[0] ?? '';
  const gradient = /<dynamicsGradient\b[^>]*>/.exec(def)?.[0];
  const scale = numberIn(ornament, 'scale', 1);
  const from = gradient ? numberIn(gradient, 'transition.from', 0) : 0;
  const to = gradient ? numberIn(gradient, 'transition.to', from) : 0;
  return {
    date: numberIn(ornament, 'date', 0),
    offset: numberIn(spread, 'frame.offset', 0),
    length: numberIn(spread, 'frameLength', 0),
    intensity: numberIn(spread, 'intensity', 1),
    noteoff: /\snoteoff\.shift="([^"]*)"/.exec(spread)?.[1] ?? null,
    from: from * scale,
    to: to * scale,
  };
}

const ORNAMENT = /<ornament\b[^>]*\/>|<ornament\b[^>]*>[\s\S]*?<\/ornament>/g;
const dateOf = (tag: string): Ticks => Number(/\sdate="([^"]+)"/.exec(tag)?.[1]);

/**
 * The MPM for a piece struck again on a grid (`gridRepeat`): at every date where two notes or more
 * are struck again and the MPM rolls nothing, a roll morphed between the chord rolled before and the
 * one rolled after, in ascending pitch (the note ids the chords name are not struck there); after
 * the last chord rolled, its roll.
 */
export function repeatedMpm(mpm: string, msm: string): string {
  const defs = new Map(
    [...mpm.matchAll(/<ornamentDef name="([^"]+)">([\s\S]*?)<\/ornamentDef>/g)].map((m) => [m[1], m[2]]),
  );
  const tags = [...msm.matchAll(/<note\b[^>]*>/g)].map((m) => m[0]);
  const sounding = new Map<Ticks, number>();
  for (const tag of tags) sounding.set(dateOf(tag), (sounding.get(dateOf(tag)) ?? 0) + 1);
  const repeated = [...new Set(tags.filter((tag) => /xml:id="[^"]*-r\d+"/.test(tag)).map(dateOf))]
    .filter((date) => (sounding.get(date) ?? 0) >= 2)
    .sort((a, b) => a - b);
  const made: string[] = [];
  const out = mpm.replace(
    /(<ornamentationMap\b[^>]*>)([\s\S]*?)(<\/ornamentationMap>)/,
    (_, open: string, body: string, close: string) => {
      const ornaments = [...body.matchAll(ORNAMENT)].map((m) => m[0]);
      const rolls = ornaments
        .filter((o) => !/\snoteid=/.test(o))
        .map((o) => ({ o, def: defs.get(/name\.ref="([^"]+)"/.exec(o)?.[1] ?? '') ?? '' }))
        .filter(({ def }) => /<temporalSpread\b|<dynamicsGradient\b/.test(def))
        .map(({ o, def }) => rollOf(o, def))
        .sort((a, b) => a.date - b.date);
      const rolled = new Set(rolls.map((r) => r.date));
      const added: string[] = [];
      let k = -1;
      for (const date of repeated) {
        while (k + 1 < rolls.length && (rolls.at(k + 1)?.date ?? Infinity) < date) k++;
        const a = rolls.at(k);
        if (rolled.has(date) || k < 0 || !a) continue;
        const b = rolls.at(k + 1) ?? a;
        const t = b.date > a.date ? (date - a.date) / (b.date - a.date) : 0;
        const at = (x: number, y: number): number => Number((x + (y - x) * t).toFixed(4));
        const noteoff = (t < 0.5 ? a : b).noteoff;
        const name = `def_morph_${date}`;
        made.push(
          `<ornamentDef name="${name}"><dynamicsGradient transition.from="${at(a.from, b.from)}" transition.to="${at(a.to, b.to)}" />` +
            `<temporalSpread frame.offset="${at(a.offset, b.offset)}ticks" frameLength="${at(a.length, b.length)}ticks" intensity="${at(a.intensity, b.intensity)}"` +
            `${noteoff ? ` noteoff.shift="${noteoff}"` : ''} /></ornamentDef>`,
        );
        added.push(
          `<ornament date="${date}" name.ref="${name}" scale="1" note.order="ascending pitch" xml:id="morph_${date}" />`,
        );
      }
      // what is not an ornament (the style the ornaments' definitions are found in) stays first
      const rest = body.replace(ORNAMENT, '');
      return open + rest + [...ornaments, ...added].sort((x, y) => dateOf(x) - dateOf(y)).join('') + close;
    },
  );
  // the morphed rolls' definitions, in the style the map's ornaments are found in
  return out.replace(
    /<ornamentationStyles>\s*<styleDef name="performance_style">/,
    (open) => open + made.join(''),
  );
}

/**
 * The ids of the piece's top voice in a transcription (MEI): the notes of the right hand's upper
 * layer (staff 1, layer 1), chords and grace notes among them.
 */
export function topVoiceIds(mei: string): string[] {
  const ids: string[] = [];
  for (const staff of mei.matchAll(/<staff\b[^>]*\bn="1"[^>]*>([\s\S]*?)<\/staff>/g))
    for (const layer of staff[1].matchAll(/<layer\b[^>]*\bn="1"[^>]*>([\s\S]*?)<\/layer>/g))
      for (const note of layer[1].matchAll(/<note\b[^>]*\bxml:id="([^"]+)"/g)) ids.push(note[1]);
  return ids;
}

/** A score's id without the mark of the repeat written out (the MSM's `-rend2`). */
const written = (id: string): string => id.replace(/-rend2$/, '');

/**
 * The melody as a line to sing: the piece's top voice (`top`, its ids), the highest note where it
 * strikes a chord; each note held to the next, following itself in the performance;
 * a rest wherever the melody has one. By `octaves` where the voice sings it.
 */
export function melodyLine(
  msm: string,
  top: ReadonlySet<string>,
  bars: Reduction['bars'],
  octaves: number,
): Reduction {
  const byDate = new Map<Ticks, { id: string; date: Ticks; pitch: number; end: Ticks }>();
  for (const part of new Msm(msm).getPartsArray()) {
    const score = part.getFirstChildElement('dated')?.getFirstChildElement('score');
    for (const n of score ? [...score.getChildElements('note')] : []) {
      const id = n.getAttributeValue('id', XML_NAMESPACE) ?? '';
      const date = Number(n.getAttributeValue('date'));
      const duration = Number(n.getAttributeValue('duration'));
      if (!top.has(written(id))) continue;
      const note = { id, date, pitch: Number(n.getAttributeValue('midi.pitch')), end: date + duration };
      const there = byDate.get(date);
      if (!there || note.pitch > there.pitch) byDate.set(date, note);
    }
  }
  const line = [...byDate.values()].sort((a, b) => a.date - b.date);
  const events: ReductionEvent[] = [];
  line.forEach((n, i) => {
    const next = line.at(i + 1);
    const end = next ? Math.min(n.end, next.date) : n.end;
    events.push({
      kind: 'note',
      id: n.id,
      ref: n.id,
      pitch: n.pitch + 12 * octaves,
      start: n.date,
      end,
      pedal: false,
    });
    if (next && end < next.date) events.push({ kind: 'rest', start: end, end: next.date });
  });
  return { events, bars };
}
