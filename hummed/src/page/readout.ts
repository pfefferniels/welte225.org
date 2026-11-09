// The transport's readout: the time, the bar, the slider's place with its filled track, and what a
// screen reader is told of it. The page is drawn in every frame while it plays; each of these is
// written only when it changes, and the slider, while the playhead moves, only when its thumb would
// move by a device pixel: every write to it has the browser lay the slider out and paint it again.
import type { Seconds } from '../shared/units.ts';
import { formatTime, setFill, Written } from './dom.ts';

/** The bar a time lies in, as the readout names it: a bar is named a moment before it begins. */
export function barAt(bars: readonly (readonly [Seconds, string])[], t: Seconds): string {
  let bar = 'Upbeat';
  for (const [start, label] of bars) if (start <= t + 0.02) bar = `Bar ${label}`;
  return bar;
}

/** The time a slider's thumb takes to cross one device pixel; 0 while its width is not known. */
export const thumbStep = (duration: Seconds, width: number, pixelRatio: number): Seconds =>
  width > 0 ? duration / (width * pixelRatio) : 0;

/** Whether a slider showing `shown` is to be moved to `t`: at rest wherever they differ, else by a `step`. */
export const thumbMoves = (shown: Seconds | null, t: Seconds, step: Seconds): boolean =>
  shown === null || (step > 0 ? Math.abs(t - shown) >= step : t !== shown);

export class Readout {
  readonly #slider: HTMLInputElement;
  readonly #time: Written<string>;
  readonly #bar: Written<string>;
  readonly #valueText: Written<string>;
  /** The slider's width in CSS pixels, the time it shows, and the time last asked to be shown. */
  #width = 0;
  #shown: Seconds | null = null;
  #latest: { readonly t: Seconds; readonly duration: Seconds } | null = null;

  constructor(time: HTMLElement, bar: HTMLElement, slider: HTMLInputElement) {
    this.#slider = slider;
    this.#time = new Written((text) => {
      time.textContent = text;
    });
    this.#bar = new Written((text) => {
      bar.textContent = text;
    });
    this.#valueText = new Written((text) => {
      slider.setAttribute('aria-valuetext', text);
    });
    new ResizeObserver((entries) => {
      this.#width = entries.at(-1)?.contentRect.width ?? 0;
    }).observe(slider);
    // a key pressed on the slider steps from where the playhead is, not from where the thumb was put
    slider.addEventListener('keydown', () => {
      if (this.#latest && this.#latest.t !== this.#shown) this.#place(this.#latest.t, this.#latest.duration);
    });
  }

  /** The slider has another range: its place is written anew. */
  forget(): void {
    this.#shown = null;
  }

  /**
   * Show the time `t` of a piece `duration` long. The slider is left alone while the visitor
   * holds it; while the playhead is `moving` it follows as finely as can be seen, at rest exactly.
   */
  show(
    t: Seconds,
    duration: Seconds,
    bars: readonly (readonly [Seconds, string])[],
    state: { readonly moving: boolean; readonly held: boolean },
  ): void {
    const time = formatTime(t);
    const bar = barAt(bars, t);
    this.#time.set(time);
    this.#bar.set(bar);
    const step = state.moving ? thumbStep(duration, this.#width, window.devicePixelRatio || 1) : 0;
    this.#latest = { t, duration };
    if (!state.held && thumbMoves(this.#shown, t, step)) this.#place(t, duration);
    this.#valueText.set(`${time}, ${bar.toLowerCase()}`);
  }

  #place(t: Seconds, duration: Seconds): void {
    this.#shown = t;
    this.#slider.value = String(t);
    setFill(this.#slider, t / duration);
  }
}
