// From a level to its grey (255 white, 0 black) on a style's scale, and a table of the greys to
// spare the power that every pixel would otherwise take.
import type { SpectrogramScale } from '../shared/spectrogram.ts';

/** How light a level from 0 (quiet) to 1 (loud) is drawn, from 255 down to 0: its grey before rounding. */
export type Shade = (level: number) => number;

export function shadeOf(scale: SpectrogramScale): Shade {
  if (scale.kind === 'amplitude') return (level) => 255 * (1 - Math.pow(level, scale.power));
  // decibels: white through mid grey to black
  return (level) => {
    const x = Math.pow(level, 1.15);
    return x < 0.45 ? 255 - (115 * x) / 0.45 : 140 * (1 - (x - 0.45) / 0.55);
  };
}

/** The cells the levels from 0 to 1 are tabulated in: a level is in cell `(level * CELLS) | 0`. */
export const CELLS = 1 << 16;

/**
 * The grey of each cell of levels, or -1 where the shade itself has to decide: where the grey
 * changes within the cell, or the shade comes within a millionth of a grey level of rounding the
 * other way at either end. A shade only darkens as the level rises, so between two ends that round
 * alike, and by that margin (many times what the arithmetic can be off by), every level rounds as
 * they do: the table gives the grey that `Math.round(shade(level))` gives, never another.
 */
export function greysOf(shade: Shade): Int16Array {
  const greys = new Int16Array(CELLS + 1);
  const clear = (light: number): boolean => Math.abs(light - Math.floor(light) - 0.5) > 1e-6;
  let low = shade(0);
  for (let cell = 0; cell < CELLS; cell++) {
    const high = shade((cell + 1) / CELLS);
    const same = clear(low) && clear(high) && Math.round(low) === Math.round(high);
    greys[cell] = same ? Math.round(low) : -1;
    low = high;
  }
  // the last cell is the level 1 alone
  greys[CELLS] = Math.round(shade(1));
  return greys;
}
