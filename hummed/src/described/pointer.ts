// What the pointer finds on the roll as it was last drawn: a remark's words or its arrow; the
// remark that is lit, over whose passage the pointer is; a note.
import type { Rect } from './geometry.ts';
import type { Drawn } from './notes.ts';
import type { Hit, Marked, RollNote } from './types.ts';

/** What was drawn where, for the pointer. */
export interface Targets {
  /** The remarks' words and arrows, the later drawn over the earlier. */
  marks: (Rect & { readonly marked: Marked })[];
  /** Where the pointer stays with a remark that is lit: over its notes. The one pointed at first. */
  holds: (Rect & { readonly marked: Marked })[];
  rects: Drawn[];
  shades: Drawn[];
}

export const noTargets = (): Targets => ({ marks: [], holds: [], rects: [], shades: [] });

/** What is at a point; `top` is the ruler's lower edge, `gutter` the roll's left one. */
export function hitAt(targets: Targets, x: number, y: number, top: number, gutter: number): Hit {
  const above = y < top - 5;
  const within = (r: Rect): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const direct = targets.marks.findLast(within)?.marked ?? null;
  const held = targets.holds.find(within)?.marked ?? null;
  let note: RollNote | null = null;
  if (!above && x >= gutter) {
    // the note itself, else the note whose shadow is there; of several, the smallest
    for (const rects of [targets.rects, targets.shades]) {
      let best: Drawn | null = null;
      for (const rect of rects) {
        if (x < rect.x - 2 || x > rect.x + rect.w + 2 || y < rect.y - 2 || y > rect.y + rect.h + 2) continue;
        if (!best || rect.w * rect.h < best.w * best.h) best = rect;
      }
      if (best) {
        note = best.note;
        break;
      }
    }
  }
  return { direct, held, note, above };
}
