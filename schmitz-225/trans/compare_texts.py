"""n·log RSS of each text relative to the first, with a block bootstrap, on every loudness measure."""
import json
import sys
from pathlib import Path

import numpy as np

from analysis import block_bootstrap
from hybrid_analysis import loudness_by_id, rss_of, velocity_matrix

SCRATCH = Path(__file__).resolve().parent.parent
MEASURES = [(None, ''), (SCRATCH / 'trans' / 'rec_nmf.json', 'harmonic_peak'), (SCRATCH / 'trans' / 'rec_nmf.json', 'onset_peak'),
            (SCRATCH / 'trans' / 'rec_composite.json', 'composite')]

runs = json.loads(Path(sys.argv[1]).read_text())['runs']
for loudness_path, measure in MEASURES:
    loudness, pitch_by_id = loudness_by_id(SCRATCH / 'trans' / 'matched.json', loudness_path, measure)
    candidates = [i for i in pitch_by_id if i in loudness]
    complete = ~np.isnan(velocity_matrix(runs, candidates)).any(axis=0)
    ids = [i for i, keep in zip(candidates, complete) if keep]
    y = np.array([loudness[i] for i in ids])
    pitch = np.array([pitch_by_id[i] for i in ids], dtype=float)
    V = velocity_matrix(runs, ids)
    n = len(y)
    rss = rss_of(y, V, pitch)
    print(f'--- {measure or "kong_velocity"} (n={n})')
    rng = np.random.default_rng(225)
    for k, run in enumerate(runs[1:], start=1):
        stat = lambda idx: n * np.log(rss_of(y[idx], V[[0, k]][:, idx], pitch[idx])[1] / rss_of(y[idx], V[[0, k]][:, idx], pitch[idx])[0])
        boot = block_bootstrap(stat, n, rng, reps=400)
        print(f'  {run["label"]:<26} n·log(RSS/RSS_{runs[0]["label"]}) = {n * np.log(rss[k] / rss[0]):+6.2f}   '
              f'95% [{np.percentile(boot, 2.5):+.2f}, {np.percentile(boot, 97.5):+.2f}]   share < 0 (text fits better): {np.mean(boot < 0):.2f}')
