"""Spectrogram of the hum as greyscale JPEG tiles for the mixing page: 100 columns a second,
rows log-spaced from FMIN to FMAX, black on white: white 60 dB below the loudest point, black
the loudest.
spectrogram_tiles.py <wav> <outdir> [top dB]: pass a top to put several renderings on one scale."""
import json, os, sys
import numpy as np, soundfile as sf
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
FMIN, FMAX, ROWS, COLS_PER_S, TILE, RANGE_DB = 70.0, 4500.0, 360, 100, 2048, 60.0
y, sr = sf.read(SRC)
if y.ndim > 1:
    y = y.mean(axis=1)
hop = sr // COLS_PER_S
win, nfft = 4096, 8192
w = np.hanning(win)
freqs = np.geomspace(FMIN, FMAX, ROWS)[::-1]                # top row = highest frequency
bins = freqs / sr * nfft
y = np.pad(y, (win // 2, win))
ncols = (len(y) - win) // hop
spec = np.empty((ROWS, ncols), np.float32)
for c0 in range(0, ncols, 512):
    c1 = min(ncols, c0 + 512)
    frames = np.stack([y[c * hop: c * hop + win] * w for c in range(c0, c1)])
    mag = np.abs(np.fft.rfft(frames, nfft, axis=1)).astype(np.float32)
    db = 20 * np.log10(mag + 1e-9)
    i0 = np.floor(bins).astype(int); fr = (bins - i0).astype(np.float32)
    spec[:, c0:c1] = (db[:, i0] * (1 - fr) + db[:, i0 + 1] * fr).T
top = float(sys.argv[3]) if len(sys.argv) > 3 else float(np.percentile(spec, 99.95))   # a shared scale
img = np.clip((spec - (top - RANGE_DB)) / RANGE_DB, 0, 1) ** 1.15
# black on white: silence white, through grey (at 0.45) to black at the loudest
img = np.where(img < 0.45, 255 - 115 * img / 0.45, 140 * (1 - (img - 0.45) / 0.55))
img = np.clip(np.round(img), 0, 255).astype(np.uint8)
os.makedirs(OUT, exist_ok=True)
tiles = []
for i, c0 in enumerate(range(0, ncols, TILE)):
    name = f'hum_{i:02d}.jpg'
    Image.fromarray(img[:, c0:c0 + TILE], 'L').save(os.path.join(OUT, name), quality=88, optimize=True)
    tiles.append(name)
print(json.dumps(dict(top=round(top, 2), tiles=tiles, tile=TILE, colsPerSec=COLS_PER_S, rows=ROWS, fmin=FMIN, fmax=FMAX,
                      seconds=round(ncols / COLS_PER_S, 2))))
