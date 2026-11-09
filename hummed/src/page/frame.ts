// What a drawing of the strip shows, as far as it takes to tell whether another would look
// different: most frames the browser offers while nothing moves would show the same picture, and
// most of the voice streams in outside the stretch in view.

export interface Frame {
  /** How far the strip has scrolled under the playhead, in device pixels. */
  readonly scroll: number;
  /**
   * All else the picture depends on: what is drawn, how far it has come within the stretch in
   * view, how strongly. Two frames show the same where every entry is the same.
   */
  readonly content: readonly unknown[];
}

/**
 * The least the strip scrolls from one drawing to the next while the playhead moves, in device
 * pixels. The strip is drawn between pixels, so a smaller step would show, faintly; but it comes up
 * only where the display asks for more than four frames to the pixel (a narrow window, which
 * scrolls 36 pixels a second, on a display of more than 144 Hz), and there every other frame is as
 * smooth.
 */
export const LEAST_STEP = 0.25;

/**
 * Whether `next` would look different from the frame last `drawn`. While the playhead moves, a
 * step of less than `LEAST_STEP` is left out; at rest every position is drawn exactly.
 */
export function differs(drawn: Frame | null, next: Frame, moving: boolean): boolean {
  if (drawn?.content.length !== next.content.length) return true;
  if (next.content.some((entry, i) => !Object.is(entry, drawn.content[i]))) return true;
  return moving ? Math.abs(next.scroll - drawn.scroll) >= LEAST_STEP : next.scroll !== drawn.scroll;
}
