// A spectrogram as it is kept for drawing: tiles of columns in one ink, the darker the more opaque,
// so that one sound can be drawn over another.
import { SPECTROGRAM as SPEC } from '../shared/spectrogram.ts';

/** Spectrogram columns per tile canvas. */
export const TILE = 2048;
/**
 * Columns written to a tile in one piece, at most: a worker's message (10 columns of the voice, 25
 * of the piano) is one piece, where a piece for every column was a call into the canvas for each
 * (on a graphics card, an upload for each).
 */
const BATCH = 64;
/** Columns that share one count of how often they were drawn: 0.64 s of sound. */
const BLOCK = 64;

export interface Tile {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

/** The parts of `count` columns from `first` on that lie in one tile and one batch each. */
export function* spans(
  first: number,
  count: number,
): Generator<{ readonly tile: number; readonly x: number; readonly from: number; readonly count: number }> {
  for (let from = 0; from < count;) {
    const column = first + from;
    const x = column % TILE;
    const n = Math.min(count - from, TILE - x, BATCH);
    yield { tile: Math.floor(column / TILE), x, from, count: n };
    from += n;
  }
}

/**
 * Greys (0 black, 255 white; column after column, `rows` each) as the opacity of an image's
 * pixels: `count` columns from the `from`th on, into the image's left columns. The image is
 * `width` pixels wide, RGBA; its colour is left as it is.
 */
export function inkColumns(
  image: Uint8ClampedArray,
  width: number,
  pixels: Uint8Array,
  from: number,
  count: number,
  rows: number,
): void {
  for (let r = 0; r < rows; r++) {
    let at = r * width * 4 + 3;
    let grey = from * rows + r;
    for (let k = 0; k < count; k++, at += 4, grey += rows) image[at] = 255 - pixels[grey];
  }
}

/**
 * Which stretches of a strip have been drawn since when: every drawing is numbered, and each block
 * of columns keeps the number of the last that touched it. A view that remembers the highest number
 * among the columns it showed knows whether they have changed since.
 */
export class Revisions {
  readonly #blocks: number[] = [];
  #latest = 0;

  /** Columns from `first` on have been drawn. */
  drew(first: number, count: number): void {
    if (count <= 0) return;
    this.#latest++;
    const last = Math.floor((first + count - 1) / BLOCK);
    for (let b = Math.max(0, Math.floor(first / BLOCK)); b <= last; b++) this.#blocks[b] = this.#latest;
  }

  /** The number of the last drawing among the columns `from` up to `to`; 0 if none was drawn. */
  latest(from: number, to: number): number {
    let latest = 0;
    const last = Math.min(this.#blocks.length - 1, Math.floor((to - 1) / BLOCK));
    for (let b = Math.max(0, Math.floor(from / BLOCK)); b <= last; b++)
      latest = Math.max(latest, this.#blocks[b] ?? 0);
    return latest;
  }
}

export class Strip {
  readonly tiles: Tile[] = [];
  readonly #revisions = new Revisions();
  /** A batch of columns on its way into a tile: the ink, as opaque as the columns are dark. */
  #batch: ImageData | null = null;
  readonly #ink: readonly [number, number, number];
  #columns = 0;

  constructor(ink: readonly [number, number, number]) {
    this.#ink = ink;
  }

  /** How many columns have been drawn. */
  get columns(): number {
    return this.#columns;
  }

  /**
   * A number that changes when columns among `from` up to `to` are drawn: what a view compares to
   * know whether the stretch it shows has changed.
   */
  revision(from: number, to: number): number {
    return this.#revisions.latest(from, to);
  }

  /** Columns from `first` on, as grey levels (0 black, 255 white), rows each. */
  draw(first: number, count: number, pixels: Uint8Array): void {
    const batch = (this.#batch ??= this.#inked());
    for (const span of spans(first, count)) {
      inkColumns(batch.data, BATCH, pixels, span.from, span.count, SPEC.rows);
      this.#tile(span.tile).context.putImageData(batch, span.x, 0, 0, 0, span.count, SPEC.rows);
    }
    this.#revisions.drew(first, count);
    this.#columns += count;
  }

  /** An image of a batch's size, all in the ink. */
  #inked(): ImageData {
    const image = new ImageData(BATCH, SPEC.rows);
    const [red, green, blue] = this.#ink;
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = red;
      image.data[i + 1] = green;
      image.data[i + 2] = blue;
    }
    return image;
  }

  #tile(index: number): Tile {
    const existing = this.tiles[index] as Tile | undefined;
    if (existing) return existing;
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = SPEC.rows;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2D canvas');
    const tile = { canvas, context };
    this.tiles[index] = tile;
    return tile;
  }
}
