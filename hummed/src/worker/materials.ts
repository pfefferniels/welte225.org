// What the piano plays and the voice follows at an elaboration (shared/shape.ts), made from the texts
// the worker loads, and in the tools and tests the same: the reductions (reductions.ts), the piece
// and its versions struck again on a grid (repeats.ts), and the melody the voice sings.
import type { Reduction } from '../reduction/types.ts';
import { harmoniesStage, pieceVersion, voiceFollows, type PieceVersion } from '../shared/shape.ts';
import type { Ticks } from '../shared/units.ts';
import { harmoniesScore } from './harmonies.ts';
import type { PianoScore } from './piano.ts';
import {
  reductions,
  sungReduction,
  voiceScore,
  type Reduced,
  type ReductionScores,
  type Reductions,
  type Score,
} from './reductions.ts';
import { gridRepeat, melodyLine, repeatedMpm } from './repeats.ts';

/** The texts the materials are made from. */
export interface Sources extends Score {
  /** The reductions as written (MEI): in half notes, in quarter notes, the accompaniment. */
  readonly halves: string;
  readonly quarters: string;
  readonly accompaniment: string;
  /** The ids of the piece's top voice (data/melody.json). */
  readonly melody: readonly string[];
}

/** The octaves by which the voice sings the melody below where the piano plays it. */
export const MELODY_OCTAVES = -2;

/** The grid each version of the piece is struck again on, and whether the melody alone is. */
const GRIDS: Readonly<
  Record<Exclude<PieceVersion, 'piece'>, { readonly unit: Ticks; readonly melody: boolean }>
> = {
  'piece on eighths': { unit: 360, melody: false },
  'piece on sixteenths': { unit: 180, melody: true },
};

export interface Materials {
  readonly reductions: () => Reductions;
  /** A version of the piece: its score and its MPM. */
  readonly piece: (version: PieceVersion) => Score;
  /** What the piano plays from at an elaboration, and where its harmonies roll a chord. */
  readonly pianoScore: (elaboration: number) => {
    readonly score: PianoScore;
    readonly rolls: Reduced['rolls'];
  };
  /** What the voice follows at an elaboration, and what it sings (over the melodic reduction given). */
  readonly voiceScore: (elaboration: number) => Score;
  readonly sung: (elaboration: number, melodic: Reduction) => Reduction;
  /**
   * The same with another MPM in the place of the piece's (one with instructions brought out,
   * emphasis.ts). What the MPM has no part in is made once for both: the reductions' scores, the
   * piece struck again, the melody.
   */
  readonly withMpm: (mpm: string) => Materials;
}

/** The materials, each made when first asked for (converting the MEI, striking again, takes a while). */
export function materials(sources: Sources): Materials {
  let scores: ReductionScores | null = null;
  const scoresOf = (): ReductionScores =>
    (scores ??= {
      halves: harmoniesScore(sources.halves),
      quarters: harmoniesScore(sources.quarters),
      accompaniment: harmoniesScore(sources.accompaniment),
    });
  const top = new Set(sources.melody);
  const struck = new Map<PieceVersion, string>();
  const struckAgain = (version: Exclude<PieceVersion, 'piece'>): string => {
    let msm = struck.get(version);
    if (msm === undefined) {
      const { unit, melody } = GRIDS[version];
      msm = gridRepeat(sources.msm, unit, melody ? (id) => top.has(id.replace(/-rend2$/, '')) : undefined);
      struck.set(version, msm);
    }
    return msm;
  };
  let melody: { readonly bars: Reduction['bars']; readonly line: Reduction } | null = null;
  const melodyOf = (bars: Reduction['bars']): Reduction => {
    if (melody?.bars !== bars) melody = { bars, line: melodyLine(sources.msm, top, bars, MELODY_OCTAVES) };
    return melody.line;
  };
  const withMpm = (mpm: string): Materials => {
    let made: Reductions | null = null;
    const reductionsOf = (): Reductions => (made ??= reductions(scoresOf(), mpm));
    const whole: Score = mpm === sources.mpm ? sources : { msm: sources.msm, mpm };
    const versions = new Map<PieceVersion, Score>();
    const piece = (version: PieceVersion): Score => {
      if (version === 'piece') return whole;
      let score = versions.get(version);
      if (!score) {
        const msm = struckAgain(version);
        score = { msm, mpm: repeatedMpm(mpm, msm) };
        versions.set(version, score);
      }
      return score;
    };
    return {
      reductions: reductionsOf,
      piece,
      pianoScore: (elaboration) => {
        const harmonies = reductionsOf().reduced(harmoniesStage(elaboration));
        const played = piece(pieceVersion(elaboration));
        return {
          score: { msm: played.msm, mpm: played.mpm, harmonies: harmonies.msm, harmoniesMpm: harmonies.mpm },
          rolls: harmonies.rolls,
        };
      },
      voiceScore: (elaboration) => voiceScore(voiceFollows(elaboration), whole, reductionsOf),
      sung: (elaboration, melodic) =>
        sungReduction(voiceFollows(elaboration), melodic, reductionsOf, () => melodyOf(melodic.bars)),
      withMpm,
    };
  };
  return withMpm(sources.mpm);
}
