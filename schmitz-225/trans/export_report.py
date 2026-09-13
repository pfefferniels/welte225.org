"""Every number the report shows, in one JSON file, all under the per-half model."""
import os

os.environ['PER_HALF'] = '1'

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from analysis import SIGLA, TREBLE_FROM, block_bootstrap, design, least_squares
from cluster_analysis import DETECTABLE, normalised, verdicts
from hybrid_analysis import LAYERS, MOVED_NOTE, loudness_by_id, posterior, rss_of, velocity_matrix
from pedal_test import curve

SCRATCH = Path(__file__).resolve().parent.parent
TRANS = SCRATCH / 'trans'
MATCHED = TRANS / 'matched.json'
MEASURES = {
    'composite': (TRANS / 'rec_composite.json', 'composite'),
    'kong': (None, ''),
    'transkun': (TRANS / 'transkun_loudness.json', 'velocity'),
    'nmf_harmonic': (TRANS / 'rec_nmf.json', 'harmonic_peak'),
    'nmf_onset': (TRANS / 'rec_nmf.json', 'onset_peak'),
}
RNG = np.random.default_rng(225)


def dataset(matched: Path, loudness_path, measure, runs):
    loudness, pitch_by_id = loudness_by_id(matched, loudness_path, measure)
    candidates = [i for i in pitch_by_id if i in loudness]
    complete = ~np.isnan(velocity_matrix(runs, candidates)).any(axis=0)
    ids = [i for i, keep in zip(candidates, complete) if keep]
    return ids, np.array([loudness[i] for i in ids]), np.array([pitch_by_id[i] for i in ids], dtype=float)


def version_comparison(matched: Path, loudness_path, measure, version_runs, bootstrap=True):
    consensus = [r for r in version_runs if r['instrument'] == 'consensus']
    ids, y, pitch = dataset(matched, loudness_path, measure, consensus)
    V = dict(zip([r['siglum'] for r in consensus], velocity_matrix(consensus, ids)))
    n = len(y)
    rss = {s: least_squares(y, design(V[s], pitch)).rss for s in SIGLA}
    total = float(np.sum((y - y.mean()) ** 2))
    result = {'n': n, 'r2': {s: 1 - rss[s] / total for s in SIGLA}, 'delta': {s: float(n * np.log(rss[s] / rss['C'])) for s in SIGLA}}
    if bootstrap:
        for other in ('B1', 'A1'):
            stat = lambda idx: n * np.log(least_squares(y[idx], design(V[other][idx], pitch[idx])).rss
                                          / least_squares(y[idx], design(V['C'][idx], pitch[idx])).rss)
            boot = block_bootstrap(stat, n, RNG, reps=400)
            result[f'ci_{other}'] = [float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5))]
    return result


def instruments_comparison(version_runs):
    loudness_path, measure = MEASURES['composite']
    ids, y, pitch = dataset(MATCHED, loudness_path, measure, version_runs)
    by_instrument = defaultdict(dict)
    for run, v in zip(version_runs, velocity_matrix(version_runs, ids)):
        by_instrument[run['instrument']][run['siglum']] = least_squares(y, design(v, pitch)).rss
    return {instrument: {s: float(len(y) * np.log(rss[s] / rss['C'])) for s in SIGLA} for instrument, rss in by_instrument.items()}


def hybrid_marginals(hybrid_runs):
    loudness_path, measure = MEASURES['composite']
    ids, y, pitch = dataset(MATCHED, loudness_path, measure, hybrid_runs)
    H = velocity_matrix(hybrid_runs, ids)
    post = posterior(rss_of(y, H, pitch), len(y))
    return {layer: float(sum(p for p, run in zip(post, hybrid_runs) if layer in run['toggles'])) for layer in LAYERS}


def passage_map():
    scan = json.loads((SCRATCH / 'emu' / 'scan.json').read_text())
    rows = {r['id']: r for r in json.loads(MATCHED.read_text())['rows']}
    base = normalised(scan['base'])
    by_measure = {}
    for name in ('composite', 'kong'):
        loudness, pitch_by_id = loudness_by_id(MATCHED, *MEASURES[name])
        ids = [i for i in pitch_by_id if i in loudness and i in base]
        y = np.array([loudness[i] for i in ids])
        pitch = np.array([pitch_by_id[i] for i in ids], dtype=float)
        by_measure[name] = {(v.family, round(v.start_mm, 1)): v for v in verdicts(y, pitch, ids, base, scan['clusters'])}

    passages = []
    for cluster in scan['clusters']:
        key = (cluster['family'], round(min(s['from'] for s in cluster['symbols']), 1))
        verdict = by_measure['composite'].get(key)
        if verdict is None:
            continue
        affected = [rows[MOVED_NOTE.get(i, i)] for i in cluster['affected'] if MOVED_NOTE.get(i, i) in rows]
        rec_times = [r['rec_t'] for r in affected if r['rec_t'] is not None]
        kong = by_measure['kong'].get(key)
        passages.append({
            'family': cluster['family'],
            'from_mm': min(s['from'] for s in cluster['symbols']),
            'to_mm': max(s['from'] for s in cluster['symbols']),
            'readings': cluster['symbols'],
            'notes': verdict.notes,
            'rec_from': min(rec_times) if rec_times else None,
            'rec_to': max(rec_times) if rec_times else None,
            'treble_notes': sum(r['pitch'] >= TREBLE_FROM for r in affected),
            'detectability': verdict.detectability, 'llr': verdict.llr, 'lambda': verdict.local_lambda, 'p': verdict.p_value,
            'kong': None if kong is None else {'detectability': kong.detectability, 'llr': kong.llr, 'lambda': kong.local_lambda, 'p': kong.p_value},
        })
    return sorted(passages, key=lambda p: p['from_mm'])


def chance_flags():
    """Passages flagged against C where C is what was played, beside the recording, on transcription velocities."""
    scan = json.loads((SCRATCH / 'emu' / 'scan.json').read_text())
    base = normalised(scan['base'])

    def counts(matched: Path):
        loudness, pitch_by_id = loudness_by_id(matched, None, '')
        ids = [i for i in pitch_by_id if i in loudness and i in base]
        y = np.array([loudness[i] for i in ids])
        pitch = np.array([pitch_by_id[i] for i in ids], dtype=float)
        detectable = [v for v in verdicts(y, pitch, ids, base, scan['clusters']) if v.detectability >= DETECTABLE]
        return {'detectable': len(detectable), 'flagged': sum(v.llr > 0 and v.p_value < 0.05 for v in detectable)}

    return {'synthetic C': counts(TRANS / 'matched_synth_C.json'), 'recording, Kong': counts(MATCHED),
            'recording, Transkun': counts(TRANS / 'matched_transkun.json')}


def validation(version_runs):
    cases = {
        'synthetic C': 'matched_synth_C.json', 'synthetic A1': 'matched_synth_A1.json', 'synthetic B1': 'matched_synth_B1.json',
        'B on instrument 1478, compressive map': 'matched_mismatch_B.json', 'C on instrument 3309, expansive map': 'matched_mismatch_C.json',
    }
    results = {}
    for label, file in cases.items():
        if (TRANS / file).exists():
            comparison = version_comparison(TRANS / file, None, '', version_runs, bootstrap=False)
            comparison['best'] = min(comparison['delta'], key=comparison['delta'].get)
            results[label] = comparison
    return results


def mismatch_summary():
    data = json.loads((TRANS / 'mismatch_simulation.json').read_text())
    groups = defaultdict(list)
    for record in data['records']:
        groups[record['true'], record['map']].append(record)
    return {'recording': data['recording'], 'groups': [{
        'true': true, 'map': map_name,
        'p5': min(r['p5'] for r in records), 'p95': max(r['p95'] for r in records),
        'median': float(np.median([r['median'] for r in records])),
        'chosen': {s: sum(r['chosen'].get(s, 0) for r in records) for s in SIGLA},
    } for (true, map_name), records in groups.items()]}


def soft_pedal():
    versions = {v['siglum']: v for v in json.loads((SCRATCH / 'emu' / 'versions.json').read_text())}
    rows = json.loads(MATCHED.read_text())['rows']
    loudness, _ = loudness_by_id(MATCHED, *MEASURES['composite'])
    used = [r for r in rows if r['id'] in loudness and r['V_C'] is not None]
    y = np.array([loudness[r['id']] for r in used])
    pitch = np.array([r['pitch'] for r in used], dtype=float)
    emu_t = np.array([r['emu_t'] for r in used])
    states = {}
    for s in ('A', 'A1', 'C'):
        t, travel, _ = curve(versions[s], 'hammerRail')
        states[s] = (np.interp(emu_t, t, travel) > 0.5).astype(float)
    contested = (states['A'] != states['C']) | (states['A1'] != states['C'])
    X = np.column_stack([design(np.array([r['V_C'] for r in used], dtype=float), pitch), states['C']])
    fit = least_squares(y[~contested], X[~contested])
    sigma2 = fit.rss / (np.sum(~contested) - X.shape[1])
    r = y[contested] - X[contested][:, :-1] @ fit.coefficients[:-1]
    gamma = fit.coefficients[-1]
    sse = {s: float(np.sum((r - gamma * states[s][contested]) ** 2)) for s in states}
    return {'gamma': float(gamma), 'contested_notes': int(contested.sum()), 'off_rail_uncontested': int(np.sum(states['C'][~contested] == 0)),
            'llr_vs_C': {s: (sse['C'] - v) / (2 * sigma2) for s, v in sse.items()}}


def main():
    runs = json.loads((SCRATCH / 'emu' / 'hybrids.json').read_text())['runs']
    version_runs = [r for r in runs if r['kind'] == 'version']
    hybrid_runs = [r for r in runs if r['kind'] == 'hybrid']
    measures = {name: version_comparison(MATCHED, path, measure, version_runs) for name, (path, measure) in MEASURES.items()
                if path is None or path.exists()}
    rows = json.loads(MATCHED.read_text())['rows']
    knots = np.array(json.loads(MATCHED.read_text())['time_map_knots'])
    report = {
        'measures': measures,
        'instruments': instruments_comparison(version_runs),
        'marginals': hybrid_marginals(hybrid_runs),
        'passages': passage_map(),
        'detectable_threshold': DETECTABLE,
        'validation': validation(version_runs),
        'chance_flags': chance_flags(),
        'mismatch': mismatch_summary(),
        'soft_pedal': soft_pedal(),
        'first_note': {k: rows[0][k] for k in ('pitch', 'rec_t', 'kong_velocity', 'V_A1', 'V_B', 'V_B1', 'V_C')},
        'matched_notes': sum(r['rec_t'] is not None for r in rows),
        'speed_ratio': float(np.polyfit(knots[:, 0], knots[:, 1], 1)[0]),
    }
    (TRANS / 'report_data.json').write_text(json.dumps(report, indent=1))
    print(json.dumps({k: report[k] for k in ('measures', 'marginals', 'validation', 'soft_pedal', 'first_note', 'speed_ratio')}, indent=1)[:6000])
    flagged = [p for p in report['passages'] if p['detectability'] >= DETECTABLE and p['llr'] > 0 and p['p'] < 0.05]
    print('passages', len(report['passages']), 'detectable', sum(p['detectability'] >= DETECTABLE for p in report['passages']), 'flagged', [(p['family'], p['from_mm']) for p in flagged])


if __name__ == '__main__':
    main()
