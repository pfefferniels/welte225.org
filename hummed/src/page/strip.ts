// A spectrogram as it is kept for drawing: tiles of columns in one ink, the darker the more opaque,
// so that one sound can be drawn over another.
import { SPECTROGRAM as SPEC } from '../shared/spectrogram.ts';

/** Spectrogram columns per tile canvas. */
export const TILE = 2048;

export interface Tile {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly column: ImageData;
}

export class Strip {
  readonly tiles: Tile[] = [];
  readonly #ink: readonly [number, number, number];
  #columns = 0;

  constructor(ink: readonly [number, number, number]) {
    this.#ink = ink;
  }

  /** How many columns have been drawn. */
  get columns(): number {
    return this.#columns;
  }

  /** Columns from `first` on, as grey levels (0 black, 255 white), rows each. */
  draw(first: number, count: number, pixels: Uint8Array): void {
    const [red, green, blue] = this.#ink;
    for (let k = 0; k < count; k++) {
      const c = first + k;
      const tile = this.#tile(Math.floor(c / TILE));
      const d = tile.column.data;
      for (let r = 0; r < SPEC.rows; r++) {
        d[r * 4] = red;
        d[r * 4 + 1] = green;
        d[r * 4 + 2] = blue;
        d[r * 4 + 3] = 255 - pixels[k * SPEC.rows + r];
      }
      tile.context.putImageData(tile.column, c % TILE, 0);
    }
    this.#columns += count;
  }

  #tile(index: number): Tile {
    const existing = this.tiles[index] as Tile | undefined;
    if (existing) return existing;
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = SPEC.rows;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2D canvas');
    const tile = { canvas, context, column: context.createImageData(1, SPEC.rows) };
    this.tiles[index] = tile;
    return tile;
  }
}
