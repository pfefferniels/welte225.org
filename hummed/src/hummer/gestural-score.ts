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
  readonly timeConstantMs: Ms;
  readonly neutral: string | number;
  /** Whether VocalTractLab marks its gaps as neutral (no gesture), rather than as a target. */
  readonly marksNeutral: boolean;
  readonly tier: (tiers: Tiers, open: boolean) => Tier<string> | Tier<number>;
}

const SPECS: readonly (TierSpec | { readonly type: string; readonly empty: true })[] = [
  {
    type: 'vowel-gestures',
    unit: '',
    timeConstantMs: TIME_CONSTANT_MS.posture,
    neutral: 'c10_0',
    marksNeutral: false,
    tier: (t, open) => (open ? t.vowelOpen : t.vowelClosed),
  },
  { type: 'lip-gestures', unit: '', timeConstantMs: 12, neutral: '', marksNeutral: true, tier: (t) => t.lip },
  {
    type: 'tongue-tip-gestures',
    unit: '',
    timeConstantMs: 12,
    neutral: '',
    marksNeutral: true,
    tier: (t) => t.tongueTip,
  },
  { type: 'tongue-body-gestures', empty: true },
  {
    type: 'velic-gestures',
    unit: '',
    timeConstantMs: 15,
    neutral: 0,
    marksNeutral: false,
    tier: (t) => t.velic,
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
    timeConstantMs: TIME_CONSTANT_MS.pitch,
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

/** One of the voice's two scores: lips closed (`open` false) or lips open. */
export function gesturalScore(tiers: Tiers, endMs: Ms, open: boolean): string {
  const out = ['<gestural_score>\n'];
  for (const spec of SPECS) {
    if ('empty' in spec) {
      out.push(`  <gesture_sequence type="${spec.type}" unit="">\n  </gesture_sequence>\n`);
      continue;
    }
    out.push(`  <gesture_sequence type="${spec.type}" unit="${spec.unit}">\n`);
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
          `time_constant_s="${(spec.timeConstantMs / 1000).toFixed(6)}" neutral="${neutral}" />\n`,
      );
    }
    out.push('  </gesture_sequence>\n');
  }
  out.push('</gestural_score>\n');
  return out.join('');
}
