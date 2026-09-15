"""How often a text played on a deformed instrument reads as A or A1. B and C, and A as a check, are emulated with slow
and fast pumps and dead valves, bent by a velocity map, given noise at the level the recording leaves, and fitted
with the versions as emulated on the consensus instrument."""
import json
from pathlib import Path

import numpy as np

from analysis import design, least_squares

TRANS = Path(__file__).resolve().parent
SCRATCH = TRANS.parent
SIGLA = ['A', 'A1', 'B', 'B2', 'C']
# R² of C on the Transkun velocities of the recording: noise of that size keeps the simulation from being easier than the case.
TARGET_R2 = 0.52
DRAWS = 200
MAPS = {'linear': lambda v: v, 'compressive': np.log, 'expansive': np.square}


def simulated(run: dict, velocity_map, V: dict, pitch: np.ndarray, ids: list[str], rng: np.random.Generator) -> dict:
    signal = velocity_map(np.array([run['velocities'][i] for i in ids], dtype=float))
    sd = np.sqrt(np.var(signal) * (1 - TARGET_R2) / TARGET_R2)

    def draw():
        y = signal + rng.normal(0, sd, len(signal))
        rss = {s: least_squares(y, design(V[s], pitch)).rss for s in SIGLA}
        return min(rss, key=rss.get), len(y) * np.log(min(rss['B'], rss['B2'], rss['C']) / min(rss['A'], rss['A1']))

    draws = [draw() for _ in range(DRAWS)]
    winners = [best for best, _ in draws]
    return {'wins': {s: winners.count(s) for s in SIGLA},
            'share_A_branch': (winners.count('A') + winners.count('A1')) / DRAWS,
            'median_margin': float(np.median([margin for _, margin in draws]))}


def main():
    rows = [r for r in json.loads((TRANS / 'matched_transkun.json').read_text())['rows']
            if r['kong_velocity'] is not None and all(r[f'V_{s}'] is not None for s in SIGLA)]
    ids = [r['id'] for r in rows]
    pitch = np.array([r['pitch'] for r in rows], dtype=float)
    V = {s: np.array([r[f'V_{s}'] for r in rows], dtype=float) for s in SIGLA}
    rng = np.random.default_rng(1905)
    records = [{'deformation': run['deformation'], 'map': name, 'truth': run['truth'], **simulated(run, velocity_map, V, pitch, ids, rng)}
               for run in json.loads((SCRATCH / 'emu' / 'deformed.json').read_text()) for name, velocity_map in MAPS.items()]
    (TRANS / 'deformed_simulation.json').write_text(json.dumps({'notes': len(rows), 'target_r2': TARGET_R2, 'draws': DRAWS, 'records': records}, indent=1))
    for r in records:
        print(f'{r["deformation"]:<26} {r["map"]:<11} {r["truth"]:<2} ' + ' '.join(f'{r["wins"][s]:4d}' for s in SIGLA)
              + f'   A branch {r["share_A_branch"]:.2f}   margin {r["median_margin"]:+.1f}')


if __name__ == '__main__':
    main()
