// A gestural score as VocalTractLab reads it (its XML format), from the voice's tiers.
import type { Ms } from '../shared/units.ts';
import { TIME_CONSTANT_MS } from './gestures.ts';
import type { Tier, Tiers } from './tiers.ts';

interface Filled {
  start: Ms;
  end: Ms;
  readonly value: string | number;
  readonly slope: number;
  readonly neutral: boolean;
}

/** The tier over [start, end], gaps filled with the neutral value. */
function fill(tier: Tier<string> | Tier<number>, start: Ms, end: Ms, neutral: string | number): Filled[] {
  const out: Filled[] = [];
  let t = start;
  for (const g of [...tier].sort((x, y) => x.start - y.start)) {
    let a = Math.max(g.start, start);
    const b = Math.min(g.end, end);
    if (b <= t) continue;
    a = Math.max(a, t);
    if (a > t + 0.5) out.push({ start: t, end: a, value: neutral, slope: 0, neutral: true });
    out.push({ start: a, end: b, value: g.value, slope: g.slope, neutral: false });
    t = b;
  }
  if (t < end) out.push({ start: t, end, value: neutral, slope: 0, neutral: true });
  return out;
}

interface TierSpec {
  readonly type: string;
  readonly unit: string;
  readonly timeConstantMs: Ms | ((tiers: Tiers) => Ms);
  readonly neutral: string | number;
  /** Whether VocalTractLab marks its gaps as neutral (no gesture), rather than as a target. */
  readonly marksNeutral: boolean;
  readonly tier: (tiers: Tiers, open: boolean) => Tier<string> | Tier<number>;
  /** Set where the tier is another with the lips open. */
  readonly mouth?: true;
}

const SPECS: readonly (TierSpec | { readonly type: string; readonly empty: true })[] = [
  {
    type: 'vowel-gestures',
    unit: '',
    timeConstantMs: TIME_CONSTANT_MS.posture,
    neutral: 'c10_0',
    marksNeutral: false,
    tier: (t, open) => (open ? t.vowelOpen : t.vowelClosed),
    mouth: true,
  },
  {
    type: 'lip-gestures',
    unit: '',
    timeConstantMs: TIME_CONSTANT_MS.lip,
    neutral: '',
    marksNeutral: true,
    tier: (t) => t.lip,
  },
  {
    type: 'tongue-tip-gestures',
    unit: '',
    timeConstantMs: TIME_CONSTANT_MS.tongueTip,
    neutral: '',
    marksNeutral: true,
    tier: (t) => t.tongueTip,
  },
  { type: 'tongue-body-gestures', empty: true },
  {
    type: 'velic-gestures',
    unit: '',
    timeConstantMs: TIME_CONSTANT_MS.velum,
    neutral: 0,
    marksNeutral: false,
    // with the lips open the velum is shut: as they part, the nose closes, and the vowel is an "a",
    // not a nasal one
    tier: (t, open) => (open ? [] : t.velic),
    mouth: true,
  },
  {
    type: 'glottal-shape-gestures',
    unit: '',
    timeConstantMs: TIME_CONSTANT_MS.glottis,
    neutral: 'g00',
    marksNeutral: false,
    tier: (t) => t.glottal,
  },
  {
    type: 'f0-gestures',
    unit: 'st',
    timeConstantMs: (t) => t.f0TimeConstantMs,
    neutral: 12 * Math.log2(130),
    marksNeutral: false,
    tier: (t) => t.f0,
  },
  {
    type: 'lung-pressure-gestures',
    unit: 'dPa',
    timeConstantMs: TIME_CONSTANT_MS.pressure,
    neutral: 0,
    marksNeutral: false,
    tier: (t) => t.pressure,
  },
];

/** Gestures shorter than this are merged into the one before. */
const MIN_GESTURE: Ms = 3;
const MAX_PRESSURE = 15000;
const MAX_F0_SLOPE = 80;

/** One tier of a score: lips closed (`open` false) or lips open. */
function sequence(spec: (typeof SPECS)[number], tiers: Tiers, endMs: Ms, open: boolean): string {
  if ('empty' in spec) return `  <gesture_sequence type="${spec.type}" unit="">\n  </gesture_sequence>\n`;
  const out = [`  <gesture_sequence type="${spec.type}" unit="${spec.unit}">\n`];
  const merged: Filled[] = [];
  for (const g of fill(spec.tier(tiers, open), 0, endMs, spec.neutral)) {
    const last = merged.at(-1);
    if (last && g.end - g.start < MIN_GESTURE) last.end = g.end;
    else merged.push({ ...g });
  }
  if (merged.length > 1 && merged[0].end - merged[0].start < MIN_GESTURE) {
    merged[1].start = merged[0].start;
    merged.shift();
  }
  const tau = typeof spec.timeConstantMs === 'number' ? spec.timeConstantMs : spec.timeConstantMs(tiers);
  const isPressure = spec.type === 'lung-pressure-gestures';
  const isF0 = spec.type === 'f0-gestures';
  for (const g of merged) {
    const value =
      typeof g.value === 'string'
        ? g.value
        : (isPressure ? Math.min(MAX_PRESSURE, Math.max(0, g.value)) : g.value).toFixed(6);
    const slope = isF0 ? Math.max(-MAX_F0_SLOPE, Math.min(MAX_F0_SLOPE, g.slope)) : g.slope;
    const neutral = g.neutral && spec.marksNeutral ? 1 : 0;
    out.push(
      `    <gesture value="${value}" slope="${slope.toFixed(6)}" duration_s="${((g.end - g.start) / 1000).toFixed(6)}" ` +
        `time_constant_s="${(tau / 1000).toFixed(6)}" neutral="${neutral}" />\n`,
    );
  }
  out.push('  </gesture_sequence>\n');
  return out.join('');
}

/**
 * The voice's two scores, lips closed and lips open. They differ in the vowel tier and the velum
 * alone: the other tiers, most of the text, are written once.
 */
export function gesturalScores(tiers: Tiers, endMs: Ms): { readonly closed: string; readonly open: string } {
  const closed = SPECS.map((spec) => sequence(spec, tiers, endMs, false));
  const open = SPECS.map((spec, i) => ('mouth' in spec ? sequence(spec, tiers, endMs, true) : closed[i]));
  const score = (sequences: readonly string[]): string =>
    `<gestural_score>\n${sequences.join('')}</gestural_score>\n`;
  return { closed: score(closed), open: score(open) };
}
