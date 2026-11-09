// The strip: the spectrogram scrolling under a fixed playhead (the humming, over the piano where
// that is shown), note names, bar lines.
import { SPECTROGRAM as SPEC, type SpectrogramStyle } from '../shared/spectrogram.ts';
import type { Seconds } from '../shared/units.ts';
import type { Rendering } from './rendering.ts';
import { TILE, type Strip } from './strip.ts';

const NOTE_NAMES: readonly (readonly [string, number])[] = [
  ['C2', 65.41],
  ['C3', 130.81],
  ['C4', 261.63],
  ['C5', 523.25],
  ['C6', 1046.5],
  ['C7', 2093.0],
  ['C8', 4186.0],
];

export class SpectrogramView {
  readonly #canvas: HTMLCanvasElement;
  readonly #g: CanvasRenderingContext2D;
  readonly #style: SpectrogramStyle;
  #width = 0;
  #height = 0;
  #dpr = 1;

  constructor(canvas: HTMLCanvasElement, style: SpectrogramStyle, onResize: () => void) {
    const g = canvas.getContext('2d');
    if (!g) throw new Error('no 2D canvas');
    this.#canvas = canvas;
    this.#style = style;
    this.#g = g;
    new ResizeObserver(() => {
      this.#dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      this.#width = r.width;
      this.#height = r.height;
      canvas.width = Math.round(this.#width * this.#dpr);
      canvas.height = Math.round(this.#height * this.#dpr);
      onResize();
    }).observe(canvas);
  }

  /** Pixels per second: about 16 seconds across, within limits. */
  get pixelsPerSecond(): number {
    return Math.max(36, Math.min(90, this.#width / 16));
  }

  get #playheadX(): number {
    return Math.round(this.#width * 0.3);
  }

  #y(frequency: number): number {
    return (
      ((Math.log(this.#style.fmax) - Math.log(frequency)) /
        (Math.log(this.#style.fmax) - Math.log(this.#style.fmin))) *
      this.#height
    );
  }

  /** The rendering at time `t`: its humming, over another sound's strip (the piano's) if one is given. */
  draw(
    rendering: Rendering | null,
    t: Seconds,
    under: { readonly strip: Strip; readonly alpha: number } | null = null,
  ): void {
    const W = this.#width;
    const H = this.#height;
    if (!W) return;
    const g = this.#g;
    const s = this.pixelsPerSecond;
    const px = this.#playheadX;
    const t0 = t - px / s;
    const t1 = t + (W - px) / s;
    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue('--spec-label').trim();
    const head = style.getPropertyValue('--spec-head').trim();
    const paper = style.getPropertyValue('--spec-lo').trim();
    g.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);

    const strip = (strip: Strip, alpha: number): void => {
      g.imageSmoothingEnabled = true;
      g.globalAlpha = alpha;
      strip.tiles.forEach((tile, i) => {
        const ts = (i * TILE) / SPEC.columnsPerSecond;
        const te = ts + TILE / SPEC.columnsPerSecond;
        if (te < t0 || ts > t1) return;
        const a = Math.max(ts, t0);
        const b = Math.min(te, t1);
        g.drawImage(
          tile.canvas,
          (a - ts) * SPEC.columnsPerSecond,
          0,
          (b - a) * SPEC.columnsPerSecond,
          SPEC.rows,
          px + (a - t) * s,
          0,
          (b - a) * s,
          H,
        );
      });
      g.globalAlpha = 1;
    };
    if (under) strip(under.strip, under.alpha);
    if (rendering) strip(rendering.strip, 1);

    g.font = `500 10px ${getComputedStyle(document.body).fontFamily}`;
    g.textBaseline = 'middle';
    for (const [name, f] of NOTE_NAMES) {
      const y = this.#y(f);
      if (y < 10 || y > H - 8) continue;
      g.globalAlpha = 0.75;
      g.fillStyle = paper;
      g.fillRect(0, y - 7, 30, 14);
      g.globalAlpha = 0.9;
      g.fillStyle = ink;
      g.fillRect(0, Math.round(y), 6, 1);
      g.fillText(name, 9, y);
    }

    // bar lines, numbered along the top edge
    if (rendering) {
      g.textBaseline = 'top';
      g.strokeStyle = ink;
      g.fillStyle = ink;
      for (const [bt, label] of rendering.bars) {
        if (bt < t0 - 1 || bt > t1) continue;
        const x = Math.round(px + (bt - t) * s) + 0.5;
        g.globalAlpha = 0.3;
        g.beginPath();
        g.moveTo(x, 18);
        g.lineTo(x, H);
        g.lineWidth = 1;
        g.stroke();
        g.globalAlpha = 0.9;
        g.fillText(label, x + 3, 5);
      }
    }

    // the playhead, edged in white
    g.globalAlpha = 1;
    g.fillStyle = paper;
    g.fillRect(px - 2, 0, 4, H);
    g.fillStyle = head;
    g.fillRect(px - 1, 0, 2, H);
    g.beginPath();
    g.moveTo(px - 6, 0);
    g.lineTo(px + 6, 0);
    g.lineTo(px, 7);
    g.closePath();
    g.fill();
  }

  get canvas(): HTMLCanvasElement {
    return this.#canvas;
  }
}
