"""Stretches of one keyboard half where the performance departs from a version consistently, beyond what shuffled
residuals produce."""
import argparse
import json
from functools import reduce
from pathlib import Path

import numpy as np

from analysis import TREBLE_FROM, design, least_squares
from hybrid_analysis import loudness_by_id

SCRATCH = Path(__file__).resolve().parent.parent
WINDOWS = (6, 12, 24)
NULL_BLOCK = 4
MOST_REPORTED = 4


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


def beyond_bound(means: np.ndarray, bound: float, width: int) -> list[int]:
    """Starts of the largest windows beyond the bound, no two of them overlapping."""
    candidates = [int(k) for k in np.argsort(-np.abs(means)) if abs(means[k]) >= bound]
    return reduce(lambda taken, k: taken + [k] if len(taken) < MOST_REPORTED and all(abs(k - j) >= width for j in taken) else taken,
                  candidates, [])


def departures(matched: Path, loudness_path: Path | None, measure: str, base: str, rng: np.random.Generator) -> list[dict]:
    """For each keyboard half and window width, the family-wise 95 % bound and the windows beyond it."""
    loudness, _ = loudness_by_id(matched, loudness_path, measure)
    rows = [r for r in json.loads(matched.read_text())['rows'] if r['id'] in loudness and r[f'V_{base}'] is not None]
    y = np.array([loudness[r['id']] for r in rows], dtype=float)
    pitch = np.array([r['pitch'] for r in rows], dtype=float)
    predictors = design(np.array([r[f'V_{base}'] for r in rows], dtype=float), pitch)
    residual = y - predictors @ least_squares(y, predictors).coefficients
    halves = np.where(pitch >= TREBLE_FROM, 'treble', 'bass')

    def in_half(half: str, width: int) -> dict:
        idx = np.flatnonzero(halves == half)
        means = window_means(residual[idx], width)
        null_max = null_window_maxima(residual[idx], width, rng)
        bound = float(np.percentile(null_max, 95))
        windows = [{'from_mm': rows[idx[k]]['mm'], 'to_mm': rows[idx[k + width - 1]]['mm'], 'mean_residual': float(means[k]),
                    'p_familywise': float(np.mean(null_max >= abs(means[k])))} for k in beyond_bound(means, bound, width)]
        return {'half': half, 'width': width, 'notes': int(len(idx)), 'residual_sd': float(residual.std()), 'bound': bound, 'windows': windows}

    return [in_half(half, width) for half in ('bass', 'treble') for width in WINDOWS]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('matched', type=Path, nargs='?', default=SCRATCH / 'trans' / 'matched_transkun.json')
    parser.add_argument('--loudness', type=Path)
    parser.add_argument('--measure', default='harmonic_peak')
    parser.add_argument('--base', default='A')
    args = parser.parse_args()
    for result in departures(args.matched, args.loudness, args.measure, args.base, np.random.default_rng(225)):
        print(f'  {result["half"]:>6}, {result["width"]:2d} notes: family-wise 95% bound {result["bound"]:.2f}'
              + ('; none beyond it' if not result['windows'] else ''))
        for window in result['windows']:
            print(f'      {window["from_mm"]:.0f}–{window["to_mm"]:.0f} mm: mean residual {window["mean_residual"]:+.2f} (p_fw {window["p_familywise"]:.3f})')


if __name__ == '__main__':
    main()
