"""Could a roll of one version, played on an instrument regulated unlike the emulator, be taken for another?

Loudness is simulated from a true version emulated under each fitted instrument and passed through a
non-linear velocity map, with the recording's own residuals under C shifted around the piece as noise.
The analysis then ranks the versions as emulated under the consensus instrument, as it does for the recording."""
import json
from collections import Counter
from pathlib import Path

import numpy as np

from analysis import design, least_squares
from hybrid_analysis import loudness_by_id, velocity_matrix

SCRATCH = Path(__file__).resolve().parent.parent
SIGLA = ['A', 'A1', 'B', 'B1', 'C']
MAPS = {
    'linear': lambda v: v,
    'compressive': lambda v: 35 + 55 * np.clip((v - 35) / 55, 0, None) ** 0.6,
    'expansive': lambda v: 35 + 55 * np.clip((v - 35) / 55, 0, None) ** 1.6,
}


def main():
    loudness, pitch_by_id = loudness_by_id(SCRATCH / 'trans' / 'matched.json', None, '')
    runs = [r for r in json.loads((SCRATCH / 'emu' / 'hybrids.json').read_text())['runs'] if r['kind'] == 'version']
    candidates = [i for i in pitch_by_id if i in loudness]
    complete = ~np.isnan(velocity_matrix(runs, candidates)).any(axis=0)
    ids = [i for i, keep in zip(candidates, complete) if keep]
    y = np.array([loudness[i] for i in ids])
    pitch = np.array([pitch_by_id[i] for i in ids], dtype=float)
    emulated = {(r['instrument'], r['siglum']): v for r, v in zip(runs, velocity_matrix(runs, ids))}
    instruments = sorted({r['instrument'] for r in runs})

    real = least_squares(y, design(emulated['consensus', 'C'], pitch))
    residual = y - design(emulated['consensus', 'C'], pitch) @ real.coefficients
    n = len(y)
    rng = np.random.default_rng(225)

    def ranking(simulated):
        rss = {s: least_squares(simulated, design(emulated['consensus', s], pitch)).rss for s in SIGLA}
        return min(rss, key=rss.get), n * np.log(rss['B'] / rss['C'])

    records = []
    print('true  instrument  map          chosen (40 noise draws)                    n·log(RSS_B/RSS_C) median [5%, 95%]')
    for true in ['B', 'C', 'A1']:
        for instrument in instruments:
            for map_name, velocity_map in MAPS.items():
                signal = design(velocity_map(emulated[instrument, true]), pitch) @ real.coefficients
                outcomes = [ranking(signal + np.roll(residual, int(s))) for s in rng.integers(0, n, size=40)]
                chosen = Counter(o[0] for o in outcomes)
                deltas = np.array([o[1] for o in outcomes])
                records.append({'true': true, 'instrument': instrument, 'map': map_name, 'chosen': dict(chosen),
                                'median': float(np.median(deltas)), 'p5': float(np.percentile(deltas, 5)), 'p95': float(np.percentile(deltas, 95))})
                print(f'{true:>4}  {instrument:>10}  {map_name:<11}  {dict(chosen)!s:<42} {np.median(deltas):+6.1f} [{np.percentile(deltas, 5):+6.1f}, {np.percentile(deltas, 95):+6.1f}]')
    recording = float(n * np.log(least_squares(y, design(emulated['consensus', 'B'], pitch)).rss / real.rss))
    print(f'recording: n·log(RSS_B/RSS_C) = {recording:+.1f}')
    (SCRATCH / 'trans' / 'mismatch_simulation.json').write_text(json.dumps({'recording': recording, 'records': records}))


if __name__ == '__main__':
    main()
