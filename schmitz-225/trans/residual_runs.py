"""Stretches of one keyboard half where the performance departs from C consistently, beyond what shuffled residuals produce."""
import argparse
import json
from pathlib import Path

import numpy as np

from analysis import TREBLE_FROM, design, least_squares
from hybrid_analysis import loudness_by_id

SCRATCH = Path(__file__).resolve().parent.parent
WINDOWS = (6, 12, 24)
NULL_BLOCK = 4


def window_means(values: np.ndarray, width: int) -> np.ndarray:
    return np.convolve(values, np.ones(width) / width, mode='valid')


def null_window_maxima(values: np.ndarray, width: int, rng: np.random.Generator, reps: int = 2000) -> np.ndarray:
    """Largest |window mean| once short blocks of residuals are shuffled and sign-flipped, which keeps their
    dependence within a block and removes any placement along the piece."""
    blocks = [values[k:k + NULL_BLOCK] for k in range(0, len(values), NULL_BLOCK)]

    def draw():
        order = rng.permutation(len(blocks))
        signs = rng.choice([-1.0, 1.0], size=len(blocks))
        return np.abs(window_means(np.concatenate([signs[k] * blocks[j] for k, j in enumerate(order)]), width)).max()

    return np.array([draw() for _ in range(reps)])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('matched', type=Path, nargs='?', default=SCRATCH / 'trans' / 'matched.json')
    parser.add_argument('--loudness', type=Path)
    parser.add_argument('--measure', default='harmonic_peak')
    args = parser.parse_args()

    loudness, _ = loudness_by_id(args.matched, args.loudness, args.measure)
    rows = [r for r in json.loads(args.matched.read_text())['rows'] if r['id'] in loudness and r['V_C'] is not None]
    y = np.array([loudness[r['id']] for r in rows], dtype=float)
    pitch = np.array([r['pitch'] for r in rows], dtype=float)
    predictors = design(np.array([r['V_C'] for r in rows], dtype=float), pitch)
    residual = y - predictors @ least_squares(y, predictors).coefficients
    halves = np.where(pitch >= TREBLE_FROM, 'treble', 'bass')
    rng = np.random.default_rng(225)
    print(f'notes: bass {np.sum(halves == "bass")}, treble {np.sum(halves == "treble")}; residual sd {residual.std():.2f}')

    for half in ('bass', 'treble'):
        idx = np.flatnonzero(halves == half)
        r = residual[idx]
        for width in WINDOWS:
            means = window_means(r, width)
            null_max = null_window_maxima(r, width, rng)
            threshold = np.percentile(null_max, 95)
            reported = []
            for k in np.argsort(-np.abs(means)):
                if abs(means[k]) < threshold or len(reported) == 4:
                    break
                if all(abs(k - j) >= width for j in reported):
                    reported.append(k)
            print(f'  {half:>6}, {width:2d} notes: family-wise 95% bound {threshold:.2f}' + ('; none beyond it' if not reported else ''))
            for k in reported:
                span = [rows[i] for i in idx[k:k + width]]
                mean_of = lambda key: np.mean([s[key] for s in span])
                print(f'      emu {span[0]["emu_t"]:6.1f}–{span[-1]["emu_t"]:6.1f} s, rec {span[0]["rec_t"]:6.1f}–{span[-1]["rec_t"]:6.1f} s: '
                      f'mean residual {means[k]:+.2f} (p_fw {np.mean(null_max >= abs(means[k])):.3f}); '
                      f'mean V A1 {mean_of("V_A1"):.1f} B {mean_of("V_B"):.1f} C {mean_of("V_C"):.1f}')


if __name__ == '__main__':
    main()
