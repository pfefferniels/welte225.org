"""Which version's emulated dynamics does a performance's per-note loudness follow?"""
import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np

SIGLA = ['A', 'A1', 'B', 'B2', 'C', 'D1', 'D3']
BLOCK = 24
LOG_MEASURES = {'harmonic_peak', 'onset_peak'}

# The two Nuancierbälge of a Vorsetzer are regulated apart, so each half may get its own scale and offset.
PER_HALF = os.environ.get('PER_HALF') == '1'
# Track 54 of the T-100 bar, the emulator's division; the note block starts at track 11 with MIDI 24.
TREBLE_FROM = 67


@dataclass(frozen=True)
class Fit:
    rss: float
    r2: float
    coefficients: np.ndarray


def pitch_covariates(pitch: np.ndarray) -> np.ndarray:
    z = (pitch - 60) / 12
    return np.column_stack([np.ones_like(z), z, z ** 2, z ** 3])


def design(velocity: np.ndarray, pitch: np.ndarray) -> np.ndarray:
    covariates = pitch_covariates(pitch)
    if not PER_HALF:
        return np.column_stack([velocity, covariates])
    treble = (pitch >= TREBLE_FROM).astype(float)
    return np.column_stack([velocity, velocity * treble, covariates, treble])


def velocity_scale(coefficients: np.ndarray, pitch: np.ndarray) -> np.ndarray:
    """Loudness per unit of emulated velocity, note by note, under the fitted design."""
    if not PER_HALF:
        return np.full(len(pitch), coefficients[0])
    return coefficients[0] + coefficients[1] * (pitch >= TREBLE_FROM)


def least_squares(y: np.ndarray, predictors: np.ndarray) -> Fit:
    coefficients, *_ = np.linalg.lstsq(predictors, y, rcond=None)
    rss = float(np.sum((y - predictors @ coefficients) ** 2))
    return Fit(rss, 1 - rss / float(np.sum((y - y.mean()) ** 2)), coefficients)


def version_fit(y, velocity, pitch) -> Fit:
    return least_squares(y, design(velocity, pitch))


def mixing_coefficient(y, base, other, pitch) -> float:
    """λ in y ≈ β·(base + λ·(other − base)) + pitch terms: 0 follows base, 1 follows other."""
    fit = least_squares(y, np.column_stack([base, other - base, pitch_covariates(pitch)]))
    return float(fit.coefficients[1] / fit.coefficients[0])


def block_bootstrap(statistic, n: int, rng: np.random.Generator, reps: int = 2000) -> np.ndarray:
    starts = np.arange(0, n - BLOCK + 1)
    blocks = n // BLOCK + 1

    def resample():
        chosen = rng.choice(starts, size=blocks)
        return np.concatenate([np.arange(s, s + BLOCK) for s in chosen])[:n]

    return np.array([statistic(resample()) for _ in range(reps)])


def load(matched: Path, loudness: Path | None, measure: str):
    rows = json.loads(matched.read_text())['rows']
    if loudness is None:
        y = np.array([np.nan if r['kong_velocity'] is None else r['kong_velocity'] for r in rows], dtype=float)
    else:
        by_index = {e['index']: e for e in json.loads(loudness.read_text())}
        to_scale = (lambda v: 20 * np.log10(v + 1e-12)) if measure in LOG_MEASURES else (lambda v: v)
        y = np.array([to_scale(by_index[k][measure]) if k in by_index else np.nan for k in range(len(rows))])
    velocities = {s: np.array([r[f'V_{s}'] for r in rows], dtype=float) for s in SIGLA}
    pitch = np.array([r['pitch'] for r in rows], dtype=float)
    keep = np.isfinite(y) & np.all([np.isfinite(v) for v in velocities.values()], axis=0)
    return y[keep], {s: v[keep] for s, v in velocities.items()}, pitch[keep], np.array(rows, dtype=object)[keep]


def report(y, V, pitch, rng):
    n = len(y)
    print(f'notes {n}')
    fits = {s: version_fit(y, V[s], pitch) for s in SIGLA}
    best = min(fits.values(), key=lambda f: f.rss)
    for s, fit in fits.items():
        print(f'  {s:>2}: R² {fit.r2:.3f}  β {fit.coefficients[0]:+.3f}  ΔRSS to best {fit.rss - best.rss:8.1f}  '
              f'Δ(n·log RSS) {n * np.log(fit.rss / best.rss):6.2f}')

    def delta_loglik(a, b):
        return lambda idx: n * np.log(version_fit(y[idx], V[a][idx], pitch[idx]).rss / version_fit(y[idx], V[b][idx], pitch[idx]).rss)

    for a, b in [('A1', 'C'), ('B', 'B2'), ('B2', 'C'), ('B', 'C'), ('A', 'A1'), ('A', 'B'), ('D3', 'C'), ('D3', 'B2'), ('D1', 'C')]:
        observed = delta_loglik(a, b)(np.arange(n))
        boot = block_bootstrap(delta_loglik(a, b), n, rng, reps=500)
        print(f'  n·log(RSS_{a}/RSS_{b}) = {observed:+7.2f}   block-bootstrap 95% [{np.percentile(boot, 2.5):+.2f}, {np.percentile(boot, 97.5):+.2f}]'
              f'   share favouring {b}: {np.mean(boot > 0):.2f}')

    for base, other in [('A1', 'C'), ('B', 'B2'), ('B2', 'C'), ('B', 'C'), ('A', 'A1'), ('A', 'B'), ('B2', 'D3'), ('C', 'D3')]:
        observed = mixing_coefficient(y, V[base], V[other], pitch)
        boot = block_bootstrap(lambda idx: mixing_coefficient(y[idx], V[base][idx], V[other][idx], pitch[idx]), n, rng, reps=1000)
        print(f'  λ({base}→{other}) = {observed:+.2f}   95% [{np.percentile(boot, 2.5):+.2f}, {np.percentile(boot, 97.5):+.2f}]')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('matched', type=Path)
    parser.add_argument('--loudness', type=Path)
    parser.add_argument('--measure', default='harmonic_peak')
    args = parser.parse_args()
    y, V, pitch, _ = load(args.matched, args.loudness, args.measure)
    report(y, V, pitch, np.random.default_rng(225))


if __name__ == '__main__':
    main()
