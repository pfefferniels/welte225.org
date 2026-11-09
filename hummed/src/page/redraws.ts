// When the page is drawn: once in an animation frame however often it was asked for, and in every
// frame while the playhead moves. A worker's message, a tick of the transport, a seek each ask;
// several come within one frame while the voice streams in, and drawing for each of them drew the
// same picture several times over. The browser calls for no frames while the page is hidden, so
// nothing is drawn then, and what was asked for meanwhile is one drawing when it shows again.
//
// Drawing is kept to half of the main thread's time. With a graphics card a frame takes it a
// fraction of a millisecond, and every frame is drawn. Without one the browser rasterizes the
// canvas there (5 ms for 1280 by 720 pixels in headless Chromium, 20 ms for twice that each way,
// and more while the workers keep every core busy): then frames are left out, evenly, so that the
// transport and the workers' messages keep their turn, but never more than leave 20 drawings a
// second, as many as the transport's ticks once drew.

/** The share of the main thread's time that drawing may take. */
const SHARE = 1 / 2;
/** The longest that costly drawings are kept apart, in ms. */
const LONGEST = 50;
/** How many drawings the cost of one is judged from: their median, so that a single stall does not count. */
const JUDGED = 5;
/** Frames come a little early or late: this much (ms) before its time, a frame is drawn all the same. */
const SLACK = 2;

/** The browser's frames, as far as drawing needs them. */
export interface Frames {
  /** Call back before the next repaint, with the frame's time in ms (`requestAnimationFrame`). */
  next(callback: (time: number) => void): void;
  /**
   * Called as a drawing begins: call back when the browser has done all that the frame asks of the
   * main thread (the drawing, styles and layout, painting), with how long that took in ms.
   */
  cost(callback: (ms: number) => void): void;
}

/**
 * The browser's own frames. What a frame took is told by a task queued behind it: a message to
 * itself, which the page hears when the browser has finished the frame (or, where frames come
 * before all else, a later one: then it took at least as long).
 */
export function browserFrames(): Frames {
  const { port1, port2 } = new MessageChannel();
  const begun: { readonly at: number; readonly report: (ms: number) => void }[] = [];
  port1.onmessage = () => {
    const frame = begun.shift();
    frame?.report(performance.now() - frame.at);
  };
  return {
    next: (callback) => requestAnimationFrame(callback),
    cost(report) {
      begun.push({ at: performance.now(), report });
      port2.postMessage(null);
    },
  };
}

/** The least time (ms) between two drawings that keeps drawings of these costs (ms) within the share. */
export function leastInterval(costs: readonly number[]): number {
  const median = [...costs].sort((a, b) => a - b)[Math.floor(costs.length / 2)] ?? 0;
  return Math.min(LONGEST, median / SHARE);
}

export class Redraws {
  readonly #draw: (time: number) => boolean;
  readonly #moving: () => boolean;
  readonly #frames: Frames;
  /** Whether a frame has been asked for. */
  #waiting = false;
  /** The time of the frame the page was last drawn in, and what the last drawings cost. */
  #drawnAt = -Infinity;
  readonly #costs: number[] = [];

  /**
   * `draw` draws the page as it is at a frame's time, and says whether there was anything to draw;
   * `moving` says whether the page will look different in the next frame without anyone asking
   * (the playhead moves).
   */
  constructor(draw: (time: number) => boolean, moving: () => boolean, frames: Frames) {
    this.#draw = draw;
    this.#moving = moving;
    this.#frames = frames;
  }

  /** Something changed: draw in the next frame, once. */
  request(): void {
    if (this.#waiting) return;
    this.#waiting = true;
    this.#frames.next((time) => {
      // what is asked for while drawing is for the frame after
      this.#waiting = false;
      this.#frame(time);
    });
  }

  #frame(time: number): void {
    if (time - this.#drawnAt < leastInterval(this.#costs) - SLACK) {
      // too soon after drawings that were costly: in a later frame
      this.request();
      return;
    }
    let drew = false;
    this.#frames.cost((ms) => {
      if (!drew) return;
      this.#costs.push(ms);
      if (this.#costs.length > JUDGED) this.#costs.shift();
    });
    drew = this.#draw(time);
    if (drew) this.#drawnAt = time;
    if (this.#moving()) this.request();
  }
}
