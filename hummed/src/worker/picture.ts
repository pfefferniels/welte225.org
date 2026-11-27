// A picture from sound: the spectrogram of a part of the piano as it is heard, or of the voice
// rendered ahead, which the page hands over in pieces, from where the playhead is to the end and
// then from the beginning; sent back in columns in that order, each once its sound has come.
import type { PictureColumns, PictureRequest } from '../shared/protocol.ts';
import { SPECTROGRAM, SPECTROGRAM_STYLES } from '../shared/spectrogram.ts';
import { makeSpectrogram } from './spectrogram.ts';

/** Columns per message: a quarter of a second. */
const BATCH = 25;

/**
 * A picture's sound as it comes: all its samples (silence where none has come yet), and how many
 * have come, from `first` to the end and then from the beginning. `wake` is called as more come.
 */
export interface Arriving {
  readonly samples: Float32Array;
  readonly first: number;
  received: number;
  wake: () => void;
}

/** Whether the samples [from, to) have all come. */
export function arrived(sound: Arriving, from: number, to: number): boolean {
  const length = sound.samples.length;
  const a = Math.max(0, from);
  const b = Math.min(length, to);
  if (b <= a) return true;
  const ahead = sound.first + Math.min(sound.received, length - sound.first);
  const wrapped = Math.max(0, sound.received - (length - sound.first));
  if (a >= sound.first) return b <= ahead;
  if (b <= sound.first) return b <= wrapped;
  return wrapped >= sound.first && b <= ahead;
}

export async function drawPicture(
  request: PictureRequest,
  sound: Arriving,
  post: (message: PictureColumns, transfer: Transferable[]) => void,
  /** Gives way to newer messages; false once this request is no longer wanted. */
  goOn: () => Promise<boolean>,
): Promise<void> {
  const style = { ...SPECTROGRAM_STYLES[request.spectrogram], scale: request.scale };
  const columns = makeSpectrogram(style, request.sampleRate);
  const hop = request.sampleRate / SPECTROGRAM.columnsPerSecond;
  const half = style.window / 2;
  const count = Math.ceil((request.length / request.sampleRate) * SPECTROGRAM.columnsPerSecond);
  const from = Math.max(0, Math.min(count, Math.floor(request.from)));
  for (const [a, b] of [
    [from, count],
    [0, from],
  ] as const) {
    for (let first = a; first < b; first += BATCH) {
      const end = Math.min(b, first + BATCH);
      // the sound under these columns' windows
      const lo = Math.round(first * hop) - half;
      const hi = Math.round((end - 1) * hop) + half;
      while (!arrived(sound, lo, hi)) {
        await new Promise<void>((resolve) => {
          sound.wake = resolve;
        });
        if (!(await goOn())) return;
      }
      const pixels = columns(sound.samples, 0, first, end);
      post({ type: 'columns', id: request.id, column: first, count: end - first, pixels }, [pixels.buffer]);
      if (!(await goOn())) return;
    }
  }
}
