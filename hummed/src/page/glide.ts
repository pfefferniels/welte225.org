// The playhead as it is drawn while it moves. The transport reads its position from the audio
// clock, which the page sees advance in bursts, a buffer of the sound card at a time: from one
// animation frame to the next by 9 to 20 ms where the frame took 16.7 (measured in Chromium), so a
// strip drawn at that position in every frame would scroll in uneven steps. Between the transport's
// readings the playhead is carried forward by the frames' own times instead, and drawn towards each
// reading only gently. At rest it is where the transport says, exactly.
import type { Seconds } from '../shared/units.ts';

/** How soon the drawn playhead settles on the transport's, as a time constant. */
const SETTLE: Seconds = 0.3;
/** Beyond this the transport has gone elsewhere (a seek, a start, a stall): the playhead follows at once. */
const JUMP: Seconds = 0.1;

export class Glide {
  /** The playhead as last drawn, and the frame's time in ms. */
  #last: { readonly position: Seconds; readonly time: number } | null = null;
  /**
   * Where the transport stands before it sets off: a start is scheduled a little ahead, and until
   * then its position stays where it is.
   */
  #rest: Seconds | null = null;

  /**
   * Where to draw the playhead in a frame at `time` (ms): the transport's `position` if it is not
   * `moving`, or has just started or gone elsewhere; else carried on from the last frame.
   */
  at(position: Seconds, time: number, moving: boolean): Seconds {
    const last = this.#last;
    if (!moving) {
      this.#last = null;
      this.#rest = null;
      return position;
    }
    if (!last || position === this.#rest) return this.#from(position, time);
    this.#rest = null;
    const elapsed = Math.max(0, time - last.time) / 1000;
    const carried = last.position + elapsed;
    const ahead = position - carried;
    if (Math.abs(ahead) > JUMP) return this.#from(position, time);
    const drawn = carried + ahead * (1 - Math.exp(-elapsed / SETTLE));
    this.#last = { position: drawn, time };
    return drawn;
  }

  /** The transport's own position, from which the playhead is carried on once it leaves it. */
  #from(position: Seconds, time: number): Seconds {
    this.#last = { position, time };
    this.#rest = position;
    return position;
  }
}
