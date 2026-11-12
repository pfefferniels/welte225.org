// The take as Music Performance Markup: what the reading comes to, written out, so that it can be
// performed (espressivo), exaggerated and heard. The tempo and dynamics instructions of its
// movements, the rubato of its beats, the accents of its chords, the spread chords with their
// beats where they were placed, and the roll's pedal. MPM Desk's chain writes its own MPM from
// the calls; this is the same reading without the desk.
import { exaggerateMpm, performMsmToData, weightedFactors } from 'espressivo';
import { heldNotes, type HeldNote } from '../shared/piano.ts';
import type { Seconds, Ticks } from '../shared/units.ts';
import type { Reading } from './reading.ts';
import { dateAt, TICKS_PER_QUARTER, type Roll, type Section } from './roll.ts';

const STYLE = 'take';
const number = (x: number): string => String(Number(x.toFixed(4)));
const attributes = (values: Readonly<Record<string, string | number | undefined>>): string =>
  Object.entries(values)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => ` ${name}="${typeof value === 'number' ? number(value) : value}"`)
    .join('');
const element = (name: string, values: Readonly<Record<string, string | number | undefined>>): string =>
  `<${name}${attributes(values)} />`;

/** How unevenly a spread's notes follow each other: their places between first and last as a power of even steps. */
function spreadIntensity(onsets: readonly number[]): number | undefined {
  const [first, last] = [onsets[0], onsets[onsets.length - 1]];
  let xy = 0;
  let xx = 0;
  onsets.slice(1, -1).forEach((onset, k) => {
    const x = Math.log((k + 1) / (onsets.length - 1));
    const y = Math.log(Math.min(0.999, Math.max(0.001, (onset - first) / (last - first))));
    xy += x * y;
    xx += x * x;
  });
  return xx > 0 ? Math.min(5, Math.max(0.1, xy / xx)) : undefined;
}

/**
 * The take's MPM over its section. `title` goes into the metadata's comment. Beats are counted in
 * quarters (the accentuation patterns' unit in a time signature over 4).
 */
export function takeMpm(roll: Roll, section: Section, reading: Reading, title: string): string {
  const within = (date: Ticks): boolean => date >= section.from && date < section.to;

  // spread chords: the notes in the order they sound, from the first to the last about the beat,
  // the way up (or down) to the chord's loudest note as the spread's own gradient
  const ornamentDefs: string[] = [];
  const ornaments: string[] = [];
  for (const spread of reading.spreads) {
    const chord = roll.chords.find((c) => c.date === spread.date);
    if (!chord) continue;
    const velocities = chord.notes.map((n) => n.velocity);
    const loudest = Math.max(...velocities);
    const range = loudest - Math.min(...velocities);
    const gradient = (velocity: number): number => (range > 0 ? (velocity - loudest) / range : 0);
    const name = `spread-${spread.date}`;
    ornamentDefs.push(
      `<ornamentDef name="${name}">` +
        element('dynamicsGradient', {
          'transition.from': gradient(velocities[0]),
          'transition.to': gradient(velocities[velocities.length - 1]),
        }) +
        element('temporalSpread', {
          'frame.start': (spread.first - spread.beat) * 1000,
          frameLength: (spread.last - spread.first) * 1000,
          intensity: spreadIntensity(chord.notes.map((n) => n.onset)),
          'time.unit': 'milliseconds',
        }) +
        '</ornamentDef>',
    );
    ornaments.push(
      element('ornament', {
        date: spread.date,
        'name.ref': name,
        scale: range,
        'note.order': chord.notes.map((n) => `#${n.id}`).join(' '),
      }),
    );
  }

  // each movement's tempo; where none follows, the tempo it arrived at is stated, or its
  // transition would have nowhere to end and the renderer would hold its beginning
  const tempos = reading.instructions.tempo.flatMap((t) => {
    const own = element('tempo', {
      date: t.date,
      bpm: t.bpm,
      'transition.to': t.transitionTo,
      meanTempoAt: t.transitionTo === undefined ? undefined : (t.meanTempoAt ?? 0.5),
      beatLength: t.beatLength,
    });
    const followed = reading.instructions.tempo.some((other) => other.date === t.endDate);
    const arrived = element('tempo', {
      date: t.endDate,
      bpm: t.transitionTo ?? t.bpm,
      beatLength: t.beatLength,
    });
    return followed ? [own] : [own, arrived];
  });

  const rubatos = reading.rubatos.map((r) =>
    element('rubato', { date: r.date, frameLength: r.length, intensity: r.intensity, loop: 'false' }),
  );

  // each movement's curve, and where the last of a run ends, the level it arrives at
  const fits = reading.instructions.dynamics.filter((d) => d.endDate > d.date);
  const dynamics = fits.flatMap((d) => {
    const own = element('dynamics', {
      date: d.date,
      volume: d.volume,
      'transition.to': d.transitionTo,
      curvature: d.transitionTo === undefined ? undefined : d.curvature,
      protraction: d.transitionTo === undefined ? undefined : d.protraction,
    });
    const followed = fits.some((other) => other.date === d.endDate);
    return followed
      ? [own]
      : [own, element('dynamics', { date: d.endDate, volume: d.transitionTo ?? d.volume })];
  });

  // the accents of each movement as a pattern of its own, its chords where they are written
  const patternDefs: string[] = [];
  const patterns: string[] = [];
  for (const accents of reading.accents) {
    const name = `accents-${accents.from}`;
    const beat = (date: Ticks): number => 1 + (date - accents.from) / TICKS_PER_QUARTER;
    patternDefs.push(
      `<accentuationPatternDef name="${name}" length="${number((accents.to - accents.from) / TICKS_PER_QUARTER)}">` +
        accents.values
          .map((v, i) =>
            element('accentuation', {
              beat: beat(v.date),
              value: v.value,
              'transition.from': v.value,
              'transition.to': accents.values.at(i + 1)?.value ?? 0,
            }),
          )
          .join('') +
        '</accentuationPatternDef>',
    );
    patterns.push(
      element('accentuationPattern', {
        date: accents.from,
        'name.ref': name,
        scale: accents.scale,
        stickToMeasures: 'false',
      }),
    );
  }

  // the pedal as the roll has it, each press where the roll is in the score
  const movements = roll.presses
    .filter((p) => p.kind === 'sustain')
    .flatMap((p) => [
      { date: dateAt(roll, p.onset), position: 1 },
      { date: dateAt(roll, p.end), position: 0 },
    ])
    .filter((m) => within(m.date) || m.position === 0)
    .sort((a, b) => a.date - b.date)
    .map((m) => element('movement', { date: m.date, position: m.position, controller: 'sustain' }));

  const style = element('style', { date: 0, 'name.ref': STYLE });
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return (
    '<?xml version="1.0"?>\n<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">' +
    `<metadata><comment>${escaped}</comment></metadata>` +
    `<performance name="take" pulsesPerQuarter="${TICKS_PER_QUARTER}"><global><header>` +
    `<ornamentationStyles><styleDef name="${STYLE}">${ornamentDefs.join('')}</styleDef></ornamentationStyles>` +
    `<metricalAccentuationStyles><styleDef name="${STYLE}">${patternDefs.join('')}</styleDef></metricalAccentuationStyles>` +
    '</header><dated>' +
    `<ornamentationMap>${style}${ornaments.join('')}</ornamentationMap>` +
    `<tempoMap>${tempos.join('')}</tempoMap>` +
    `<rubatoMap>${rubatos.join('')}</rubatoMap>` +
    `<dynamicsMap>${dynamics.join('')}</dynamicsMap>` +
    `<metricalAccentuationMap>${style}${patterns.join('')}</metricalAccentuationMap>` +
    `<movementMap>${movements.join('')}</movementMap>` +
    '</dated></global></performance></mpm>\n'
  );
}

/**
 * The MPM performed against the score, its expression exaggerated by `factor` in every dimension
 * (1: as it stands; 0: none of it; 2: every departure doubled): the section's notes as the sampler
 * holds them, counted from the first of them, and how long they last.
 */
export function performTake(
  msm: string,
  mpm: string,
  section: Section,
  factor: number,
): { readonly notes: HeldNote[]; readonly length: Seconds } {
  const text = factor === 1 ? mpm : exaggerateMpm(mpm, { factors: weightedFactors(factor, {}) }).mpm;
  const data = performMsmToData({ msm, mpm: text });
  const performed = data.parts
    .flatMap((part) => part.notes)
    .filter((n) => n.date >= section.from && n.date < section.to);
  if (performed.length === 0) return { notes: [], length: 0 };
  const origin = Math.min(...performed.map((n) => n.milliseconds.date));
  const seconds = (ms: number): Seconds => (ms - origin) / 1000;
  const keys = performed
    .map((n) => ({
      on: seconds(n.milliseconds.date),
      off: seconds(n.milliseconds.end),
      pitch: n.pitch,
      velocity: Math.min(127, Math.max(1, n.velocity)),
    }))
    .sort((a, b) => a.on - b.on);
  const pedal = data.parts[0]?.controlChanges.find((c) => c.controller === 'sustain');
  const sustain = (pedal?.points ?? []).map((p) => ({ at: seconds(p.milliseconds), value: p.value }));
  const notes = heldNotes({ keys, sustain, soft: [] });
  return { notes, length: Math.max(...notes.map((n) => n.on + n.duration)) };
}
