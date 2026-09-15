"""The pedal channel, which the velocity analysis does not see: where the versions' pedal timelines differ from A,
whether the recording's loudness follows A's soft pedal or that of A1 and of B where they differ, and how far the
damper Kong transcribed agrees with each version's."""
import json
from pathlib import Path

import numpy as np

from analysis import block_bootstrap, design, least_squares
from hybrid_analysis import loudness_by_id

SCRATCH = Path(__file__).resolve().parent.parent
TRANS = SCRATCH / 'trans'
SIGLA = ['A', 'A1', 'B', 'B2', 'C']
COMPARISONS = {'A1': 'flicker, bars 8′–10', 'B': 'una corda, bar 13'}
DOWN = 0.5
DIFFERS = 0.05
SHORTEST_SPAN_SAMPLES = 5


def curve(version: dict, name: str):
    c = next(c for c in version['curves'] if c['name'] == name)
    return np.array(c['seconds']), np.array(c['travel']), np.array(c['place'])


def spans_where(mask: np.ndarray, place: np.ndarray) -> list[tuple[float, float]]:
    edges = np.flatnonzero(np.diff(np.concatenate([[0], mask.astype(int), [0]])))
    return [(float(place[a]), float(place[b - 1])) for a, b in zip(edges[::2], edges[1::2]) if b - a > SHORTEST_SPAN_SAMPLES]


def differing_spans(versions: dict, name: str) -> dict[str, list[tuple[float, float]]]:
    """Places where a version's pedal is down and A's is up, or the reverse."""
    t, reference, _ = curve(versions['A'], name)

    def spans(siglum: str):
        ts, travel, place = curve(versions[siglum], name)
        return spans_where(np.abs(np.interp(t, ts, travel) - reference) > DOWN, np.interp(t, ts, place))

    return {s: spans(s) for s in SIGLA if s != 'A'}


def rail_at(versions: dict, siglum: str, seconds: np.ndarray) -> np.ndarray:
    t, travel, _ = curve(versions[siglum], 'hammerRail')
    return np.interp(seconds, t, travel)


def soft_pedal_comparison(matched: Path, loudness_path: Path | None, measure: str, versions: dict, other: str,
                          rng: np.random.Generator, reps: int = 1000) -> dict:
    """Loudness ~ A's velocities + γ·hammer rail, with A's rail against the other version's."""
    loudness, _ = loudness_by_id(matched, loudness_path, measure)
    used = [r for r in json.loads(matched.read_text())['rows'] if r['id'] in loudness and r['V_A'] is not None]
    y = np.array([loudness[r['id']] for r in used], dtype=float)
    pitch = np.array([r['pitch'] for r in used], dtype=float)
    velocity = np.array([r['V_A'] for r in used], dtype=float)
    seconds = np.array([r['emu_t'] for r in used])
    rail = {s: rail_at(versions, s, seconds) for s in ('A', other)}
    predictors = lambda s, idx: np.column_stack([design(velocity[idx], pitch[idx]), rail[s][idx]])
    n = len(y)
    statistic = lambda idx: n * np.log(least_squares(y[idx], predictors(other, idx)).rss / least_squares(y[idx], predictors('A', idx)).rss)
    everything = np.arange(n)
    fit = least_squares(y, predictors('A', everything))
    residual = y - predictors('A', everything) @ fit.coefficients
    differing = np.abs(rail[other] - rail['A']) > DIFFERS
    boot = block_bootstrap(statistic, n, rng, reps=reps)
    return {'other': other, 'where': COMPARISONS[other], 'notes_differing': int(differing.sum()), 'gamma': float(fit.coefficients[-1]),
            'delta': float(statistic(everything)), 'ci': [float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5))],
            'share_favouring_A': float(np.mean(boot > 0)), 'mean_residual_under_A': float(residual[differing].mean()),
            'residual_sd': float(residual.std()), 'rail_A': float(rail['A'][differing].mean()), 'rail_other': float(rail[other][differing].mean())}


def damper_agreement(matched: Path, versions: dict) -> dict:
    """Share of time the damper Kong transcribed is down where each version's is, and up where it is up."""
    content = json.loads(matched.read_text())
    knots = np.array(content['time_map_knots'])
    to_emulated = lambda seconds: np.interp(seconds, knots[:, 1], knots[:, 0])
    events = json.loads((TRANS / 'kong.json').read_text())['pedals']
    t, _, _ = curve(versions['A'], 'damper')
    detected = np.any([(t >= to_emulated(e['onset_time'])) & (t <= to_emulated(e['offset_time'])) for e in events], axis=0)
    span = (t >= content['rows'][0]['emu_t']) & (t <= content['rows'][-1]['emu_t'])
    down = lambda s: np.interp(t, *curve(versions[s], 'damper')[:2]) > DOWN
    return {'events': len(events), 'agreement': {s: float(np.mean(down(s)[span] == detected[span])) for s in SIGLA}}


def main():
    versions = {v['siglum']: v for v in json.loads((SCRATCH / 'emu' / 'versions.json').read_text())['versions']}
    print(json.dumps({name: differing_spans(versions, name) for name in ('hammerRail', 'damper')}))
    rng = np.random.default_rng(225)
    for label, loudness_path, measure in [('Transkun velocities', None, ''), ('composite without Kong', TRANS / 'rec_composite3.json', 'composite')]:
        for other in COMPARISONS:
            print(label, json.dumps(soft_pedal_comparison(TRANS / 'matched_transkun.json', loudness_path, measure, versions, other, rng), ensure_ascii=False))
    print(json.dumps(damper_agreement(TRANS / 'matched_transkun.json', versions)))


if __name__ == '__main__':
    main()
