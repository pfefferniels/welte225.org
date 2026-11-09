// The piano's picture: the spectrogram of a part's sound, which the page hands over whole, sent back
// in columns from where the playhead is to the end, then from the beginning.
import type { PictureColumns, PictureRequest } from '../shared/protocol.ts';
import { SPECTROGRAM, SPECTROGRAM_STYLES } from '../shared/spectrogram.ts';
import { makeSpectrogram } from './spectrogram.ts';

/** Columns per message: a quarter of a second. */
const BATCH = 25;

export async function drawPicture(
  request: PictureRequest,
  post: (message: PictureColumns, transfer: Transferable[]) => void,
  /** Gives way to newer messages; false once this request is no longer wanted. */
  goOn: () => Promise<boolean>,
): Promise<void> {
  const style = { ...SPECTROGRAM_STYLES[request.spectrogram], scale: request.scale };
  const columns = makeSpectrogram(style, request.sampleRate);
  const count = Math.ceil((request.samples.length / request.sampleRate) * SPECTROGRAM.columnsPerSecond);
  const from = Math.max(0, Math.min(count, Math.floor(request.from)));
  for (const [a, b] of [
    [from, count],
    [0, from],
  ] as const) {
    for (let first = a; first < b; first += BATCH) {
      const end = Math.min(b, first + BATCH);
      const pixels = columns(request.samples, 0, first, end);
      post({ type: 'columns', id: request.id, column: first, count: end - first, pixels }, [pixels.buffer]);
      if (!(await goOn())) return;
    }
  }
}
