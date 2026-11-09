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

/** An articulator held at a target from `from` until `until` (ms of the rendering). */
export interface ArticulatorMove {
  readonly to: ArticulatorTarget;
  readonly from: Ms;
  readonly until: Ms;
}

/** How long a move takes to come in (before `from`) and to go out (after `until`). */
const IN: Ms = 25;
const OUT: Ms = 30;

const ease = (x: number): number => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/**
 * The moves applied to tract states, in place: `tract` holds `count` states of `params` values each,
 * `msPerState` apart. Each move comes in over 25 ms, holds, and goes out over 30 ms from just before
 * `until`, so that the articulator lets go as the note begins.
 */
export function moveArticulators(
  tract: Float64Array,
  count: number,
  params: number,
  msPerState: number,
  moves: readonly ArticulatorMove[],
): void {
  for (const m of moves) {
    const first = Math.max(0, Math.floor((m.from - IN) / msPerState));
    const last = Math.min(count - 1, Math.ceil((m.until + OUT) / msPerState));
    for (let i = first; i <= last; i++) {
      const t = i * msPerState;
      const e = Math.min(ease((t - (m.from - IN)) / IN), ease((m.until + OUT - 5 - t) / OUT));
      for (const [name, value] of Object.entries(m.to)) {
        const k = i * params + TRACT_PARAMS.indexOf(name as TractParam);
        tract[k] += e * (value - tract[k]);
      }
    }
  }
}
