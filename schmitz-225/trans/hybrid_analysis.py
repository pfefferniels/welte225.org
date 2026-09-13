"""Rank hybrid texts and instrument settings by how well their emulated velocities explain a performance's loudness."""
import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from analysis import LOG_MEASURES, block_bootstrap, design, least_squares

SCRATCH = Path(__file__).resolve().parent.parent
MOVED_NOTE = {'symbol_bc5958aa-5fee-4daf-8457-9d96b98208a4': 'symbol_c365caf3-577d-4cb6-b5dd-ec9221af00d0'}
LAYERS = ['A1', 'B', 'B1', 'Cadd', 'Cdel']


def loudness_by_id(matched: Path, loudness: Path | None, measure: str) -> tuple[dict[str, float], dict[str, int]]:
    rows = json.loads(matched.read_text())['rows']
    pitch = {r['id']: r['pitch'] for r in rows}
    if loudness is None:
        return {r['id']: r['kong_velocity'] for r in rows if r['kong_velocity'] is not None}, pitch
    by_index = {e['index']: e for e in json.loads(loudness.read_text())}
    to_scale = (lambda v: 20 * np.log10(v + 1e-12)) if measure in LOG_MEASURES else (lambda v: v)
    return {rows[k]['id']: to_scale(e[measure]) for k, e in by_index.items()}, pitch


def velocity_matrix(runs, ids) -> np.ndarray:
    """One row per run; a note some run lacks (C moves one note, and a hybrid may hold neither place) is NaN."""
    def row(run):
        by_id = {MOVED_NOTE.get(note_id, note_id): velocity for note_id, _, _, velocity in run['notes']}
        return [by_id.get(i, np.nan) for i in ids]
    return np.array([row(run) for run in runs])


def rss_of(y, velocities, pitch) -> np.ndarray:
    return np.array([least_squares(y, design(v, pitch)).rss for v in velocities])


def posterior(rss: np.ndarray, n: int) -> np.ndarray:
    log_likelihood = -0.5 * n * np.log(rss)
    weights = np.exp(log_likelihood - log_likelihood.max())
    return weights / weights.sum()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('matched', type=Path)
    parser.add_argument('--loudness', type=Path)
    parser.add_argument('--measure', default='harmonic_peak')
    parser.add_argument('--hybrids', type=Path, default=SCRATCH / 'emu' / 'hybrids.json')
    args = parser.parse_args()

    loudness, pitch_by_id = loudness_by_id(args.matched, args.loudness, args.measure)
    runs = json.loads(args.hybrids.read_text())['runs']
    candidates = [i for i in pitch_by_id if i in loudness]
    complete = ~np.isnan(velocity_matrix(runs, candidates)).any(axis=0)
    ids = [i for i, keep in zip(candidates, complete) if keep]
    y = np.array([loudness[i] for i in ids])
    pitch = np.array([pitch_by_id[i] for i in ids], dtype=float)
    n = len(y)

    hybrids = [r for r in runs if r['kind'] == 'hybrid']
    H = velocity_matrix(hybrids, ids)
    rss = rss_of(y, H, pitch)
    post = posterior(rss, n)
    order = np.argsort(rss)
    print(f'notes {n}; hybrids ranked (n·log RSS relative to best, posterior under a flat prior):')
    for k in order[:10]:
        print(f'  {"+".join(hybrids[k]["toggles"]) or "A":<22} {n * np.log(rss[k] / rss[order[0]]):7.2f}  p={post[k]:.3f}')
    for layer in LAYERS:
        marginal = sum(p for p, run in zip(post, hybrids) if layer in run['toggles'])
        print(f'  marginal P({layer} present) = {marginal:.3f}')

    rng = np.random.default_rng(225)
    marginals = defaultdict(list)
    best_counts = defaultdict(int)

    def resampled(idx):
        p = posterior(rss_of(y[idx], H[:, idx], pitch[idx]), n)
        for layer in LAYERS:
            marginals[layer].append(sum(q for q, run in zip(p, hybrids) if layer in run['toggles']))
        best_counts['+'.join(hybrids[int(np.argmax(p))]['toggles']) or 'A'] += 1
        return 0.0

    block_bootstrap(resampled, n, rng, reps=300)
    print('  block bootstrap, 300 resamples:')
    for layer in LAYERS:
        values = np.array(marginals[layer])
        print(f'    P({layer}) median {np.median(values):.3f}, share of resamples > 0.5: {np.mean(values > 0.5):.2f}')
    print('    best hybrid per resample:', dict(sorted(best_counts.items(), key=lambda kv: -kv[1])))

    versions = [r for r in runs if r['kind'] == 'version']
    V = velocity_matrix(versions, ids)
    rss_versions = rss_of(y, V, pitch)
    table = defaultdict(dict)
    for run, value in zip(versions, rss_versions):
        table[run['instrument']][run['siglum']] = value
    print('  per instrument, n·log(RSS/RSS_C) (positive: C fits better) and R² of C:')
    for instrument, by_siglum in table.items():
        c = by_siglum['C']
        r2_c = 1 - c / np.sum((y - y.mean()) ** 2)
        print(f'    {instrument:>9}: ' + '  '.join(f'{s} {n * np.log(v / c):+6.1f}' for s, v in by_siglum.items()) + f'   R²(C)≈{r2_c:.3f}')


if __name__ == '__main__':
    main()
