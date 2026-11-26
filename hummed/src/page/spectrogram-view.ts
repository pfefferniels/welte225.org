// The strip: the spectrogram scrolling under a fixed playhead (the humming, over the piano where
// that is shown), note names, bar lines. Asked to draw, it draws only what would look different
// from what it shows (frame.ts). While settings blend, each is drawn in its own time, as strongly as
// it is heard, along an axis that is theirs blended by their weights: each setting's score positions
// at the places the blend gives them, so that the picture goes over from the layout of the one
// going out to that of the one coming in, aligned at the playhead.
import { SPECTROGRAM as SPEC, type SpectrogramStyle } from '../shared/spectrogram.ts';
import type { Seconds } from '../shared/units.ts';
import { counterpart } from './alignment.ts';
import { differs, type Frame } from './frame.ts';
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

/** Columns in a slice of a strip drawn along a blended axis: a tile is a whole number of them. */
const SLICE = 32;

/** What the stylesheet says of the strip: its colours and the page's typeface. */
interface Palette {
  readonly ink: string;
  readonly head: string;
  readonly paper: string;
  readonly font: string;
}

/** One setting as the strip draws it: where it is at the playhead, its share of the axis, its pictures. */
export interface Layer {
  readonly rendering: Rendering;
  /** Its time at the playhead. */
  readonly t: Seconds;
  /** Its share of the axis: its power in the blend (the shares sum to one). */
  readonly share: number;
  readonly voice: { readonly strip: Strip; readonly alpha: number } | null;
  readonly piano: { readonly strip: Strip; readonly alpha: number } | null;
}

export class SpectrogramView {
  readonly #canvas: HTMLCanvasElement;
  readonly #g: CanvasRenderingContext2D;
  readonly #style: SpectrogramStyle;
  #width = 0;
  #height = 0;
  #dpr = 1;
  /** Read from the stylesheet when first drawn, and again when the colours may have changed. */
  #palette: Palette | null = null;
  /** What the canvas shows; null when it shows nothing that is still right. */
  #drawn: Frame | null = null;

  /**
   * `changed` is told when the canvas has to be drawn again at once: it was resized, and is empty,
   * or the stylesheet's colours have changed.
   */
  constructor(canvas: HTMLCanvasElement, style: SpectrogramStyle, changed: () => void) {
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
      this.#drawn = null;
      changed();
    }).observe(canvas);
    // the stylesheet has one colour scheme; should it get another, the colours are read again
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      this.#palette = null;
      this.#drawn = null;
      changed();
    });
  }

  /**
   * The colours and the typeface. Asking the browser for them in every frame had it work out the
   * page's styles in the middle of each drawing.
   */
  get #colours(): Palette {
    if (this.#palette) return this.#palette;
    const style = getComputedStyle(document.documentElement);
    this.#palette = {
      ink: style.getPropertyValue('--spec-label').trim(),
      head: style.getPropertyValue('--spec-head').trim(),
      paper: style.getPropertyValue('--spec-lo').trim(),
      font: `500 10px ${getComputedStyle(document.body).fontFamily}`,
    };
    return this.#palette;
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

  /**
   * The settings that sound, the current one last (its bar lines are drawn), each at its time at
   * the playhead: the humming over the piano. Nothing is drawn where the canvas shows the same
   * already; while the playhead is `moving`, nor where the strip has hardly scrolled. Returns
   * whether it drew.
   */
  draw(layers: readonly Layer[], moving = false): boolean {
    const W = this.#width;
    const H = this.#height;
    if (!W) return false;
    const g = this.#g;
    const s = this.pixelsPerSecond;
    const px = this.#playheadX;
    const current = layers.at(-1);
    const t = current?.t ?? 0;
    // the columns in view, and one more on either side, which the smoothing reaches; of a setting
    // blended, as far again on either side as tempi differ
    const across = (W / s) * (layers.length > 1 ? 4 : 1);
    const content: unknown[] = [];
    for (const layer of layers) {
      const c0 = Math.floor((layer.t - across) * SPEC.columnsPerSecond) - 1;
      const c1 = Math.ceil((layer.t + across) * SPEC.columnsPerSecond) + 1;
      content.push(
        layer.rendering,
        layer.voice?.strip,
        layer.voice?.strip.revision(c0, c1),
        layer.voice?.alpha,
        layer.piano?.strip,
        layer.piano?.strip.revision(c0, c1),
        layer.piano?.alpha,
        layers.length > 1 ? layer.share : 1,
        layers.length > 1 ? layer.t : 0,
      );
    }
    const frame: Frame = { scroll: t * s * this.#dpr, content };
    if (!differs(this.#drawn, frame, moving)) return false;
    this.#drawn = frame;
    const { ink, head, paper, font } = this.#colours;
    g.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);

    /**
     * Where a time of a layer's rendering is drawn: along the blended axis, its score position where
     * each setting has it, from where each is at the playhead, weighed by their shares.
     */
    const xOf = (layer: Layer, time: Seconds): number => {
      if (layers.length === 1) return px + (time - layer.t) * s;
      let x = 0;
      for (const other of layers)
        x +=
          other.share *
          ((other === layer ? time : counterpart(layer.rendering.clock, other.rendering.clock, time)) -
            other.t);
      return px + x * s;
    };

    const strip = (layer: Layer, strip: Strip, alpha: number): void => {
      if (alpha <= 0) return;
      g.imageSmoothingEnabled = true;
      g.globalAlpha = alpha;
      if (layers.length === 1) {
        const t0 = layer.t - px / s;
        const t1 = layer.t + (W - px) / s;
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
            px + (a - layer.t) * s,
            0,
            (b - a) * s,
            H,
          );
        });
      } else {
        // slice by slice from the playhead outward, each stretched to where the blend puts it
        const slice = (k: number): boolean => {
          const tile = strip.tiles[Math.floor((k * SLICE) / TILE)] as
            (typeof strip.tiles)[number] | undefined;
          const a = (k * SLICE) / SPEC.columnsPerSecond;
          const b = ((k + 1) * SLICE) / SPEC.columnsPerSecond;
          const xa = xOf(layer, a);
          const xb = xOf(layer, b);
          if (xb < 0 || xa > W) return false;
          if (tile && xb > xa)
            g.drawImage(tile.canvas, (k * SLICE) % TILE, 0, SLICE, SPEC.rows, xa, 0, xb - xa, H);
          return true;
        };
        const here = Math.floor((layer.t * SPEC.columnsPerSecond) / SLICE);
        const last = Math.ceil((layer.rendering.duration * SPEC.columnsPerSecond) / SLICE);
        for (let k = here; k <= last && slice(k); k++);
        for (let k = here - 1; k >= 0 && slice(k); k--);
      }
      g.globalAlpha = 1;
    };
    for (const layer of layers) if (layer.piano) strip(layer, layer.piano.strip, layer.piano.alpha);
    for (const layer of layers) if (layer.voice) strip(layer, layer.voice.strip, layer.voice.alpha);

    g.font = font;
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

    // bar lines, numbered along the top edge: the current setting's, where the blend has them
    if (current) {
      g.textBaseline = 'top';
      g.strokeStyle = ink;
      g.fillStyle = ink;
      for (const [bt, label] of current.rendering.bars) {
        const x = Math.round(xOf(current, bt)) + 0.5;
        if (x < -40 || x > W) continue;
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
    return true;
  }

  get canvas(): HTMLCanvasElement {
    return this.#canvas;
  }
}
