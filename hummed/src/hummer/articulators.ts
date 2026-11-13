// Consonants that move only their own articulator. VocalTractLab's consonant gestures replace the
// target of every tract parameter with a prototype shaped for /a/, /i/ or /u/ (the jaw down, the
// lips apart), which inside a hum sounded like an 'Ä'. So the voice's consonants are not gestures:
// the parameters of their articulator are moved in the tract states themselves, towards the
// prototype's values in the /u/ context (nearest the hum), and everything else keeps the hum's shape.
import type { Ms } from '../shared/units.ts';

/** VocalTractLab's tract parameters, in the speaker's order (data/hummer.speaker.xml). */
export const TRACT_PARAMS = [
  'HX',
  'HY',
  'JX',
  'JA',
  'LP',
  'LD',
  'VS',
  'VO',
  'TCX',
  'TCY',
  'TTX',
  'TTY',
  'TBX',
  'TBY',
  'TRX',
  'TRY',
  'TS1',
  'TS2',
  'TS3',
] as const;
export type TractParam = (typeof TRACT_PARAMS)[number];
export type ArticulatorTarget = Readonly<Partial<Record<TractParam, number>>>;

/** The tongue tip closed at the ridge behind the teeth: the speaker's tt-alveolar-closure(u). */
export const TONGUE_TIP_CLOSURE: ArticulatorTarget = { TTX: 4.57, TTY: -0.02, TS3: 0 };

/**
 * The velum shut, as VocalTractLab's neutral has it: behind the closed lips of the hum, the voice
 * stops at once, and starts again through the nose as the velum opens. Moved in the tract states,
 * as the tongue tip is: the velum's gestures (15 ms) take some 85 ms to close it, the lungs' (12 ms)
 * a dip of breath of 90 ms leaves the voice sounding, softer.
 */
export const VELUM_SHUT: ArticulatorTarget = { VO: -0.1 };

/**
 * The tongue, the jaw and the hyoid as the speaker's "a" has them: where they go behind the closed
 * lips before the mouth opens, so that the lips part on an "a" and not on the hum's forward tongue.
 */
export const TONGUE_A: ArticulatorTarget = {
  HX: 0.1667,
  HY: -3.9392,
  JX: 0,
  JA: -4.1498,
  TCX: 0.1524,
  TCY: -1.8333,
  TTX: 4.2474,
  TTY: -1.694,
  TBX: 2.5488,
  TBY: -0.675,
  TRX: -2.8371,
  TRY: -2.9034,
  TS1: 0.2064,
  TS2: 0.0384,
  TS3: 0.1488,
};

/**
 * An articulator held at a target from `from` until `until` (ms of the rendering). It comes in over
 * `inMs` before `from` and goes out over `outMs` after `until` (25 and 30 ms if not given).
 */
export interface ArticulatorMove {
  readonly to: ArticulatorTarget;
  readonly from: Ms;
  readonly until: Ms;
  readonly inMs?: Ms;
  readonly outMs?: Ms;
}

/** How long a move takes to come in (before `from`) and to go out (after `until`). */
const IN: Ms = 25;
const OUT: Ms = 30;

const ease = (x: number): number => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/**
 * The moves applied to tract states, in place and in their order: `tract` holds `count` states of
 * `params` values each, `msPerState` apart. Each move comes in (over 25 ms unless it says otherwise),
 * holds, and goes out (over 30 ms) from just before `until`, so that a consonant's articulator lets
 * go as the note begins.
 */
export function moveArticulators(
  tract: Float64Array,
  count: number,
  params: number,
  msPerState: number,
  moves: readonly ArticulatorMove[],
): void {
  for (const m of moves) {
    const coming = m.inMs ?? IN;
    const going = m.outMs ?? OUT;
    const first = Math.max(0, Math.floor((m.from - coming) / msPerState));
    const last = Math.min(count - 1, Math.ceil((m.until + going) / msPerState));
    for (let i = first; i <= last; i++) {
      const t = i * msPerState;
      const e = Math.min(ease((t - (m.from - coming)) / coming), ease((m.until + going - 5 - t) / going));
      for (const [name, value] of Object.entries(m.to)) {
        const k = i * params + TRACT_PARAMS.indexOf(name as TractParam);
        tract[k] += e * (value - tract[k]);
      }
    }
  }
}
