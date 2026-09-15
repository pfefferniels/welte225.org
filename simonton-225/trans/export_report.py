"""Every number the edition's statements about this copy rest on, in one JSON file, all under the per-half model."""
import os

os.environ['PER_HALF'] = '1'

import json
from functools import cache
from itertools import groupby
from pathlib import Path

import numpy as np

from ablation import ablation
from analysis import SIGLA, block_bootstrap, design, least_squares, load, version_fit
from cluster_analysis import DETECTABLE, normalised, span_class, verdicts
from hybrid_analysis import LAYERS, loudness_by_id, posterior, rss_of, velocity_matrix
from pedal_test import COMPARISONS, damper_agreement, differing_spans, soft_pedal_comparison
from red_paper import stretch_test, text_test, versions_by_siglum
from residual_runs import departures

TRANS = Path(__file__).resolve().parent
SCRATCH = TRANS.parent
TRANSKUN = TRANS / 'matched_transkun.json'
KONG = TRANS / 'matched.json'
TACET = SCRATCH / 'control' / 'tacet_matched_transkun.json'
# sox slowed the transfer by this factor to take it down the 19.1 cents it sounds sharp.
SPEED_CORRECTION = 0.98903
MEASURES = {
    'transkun': (TRANSKUN, None, ''),
    'kong': (KONG, None, ''),
    'nmf_harmonic': (TRANSKUN, TRANS / 'rec_nmf.json', 'harmonic_peak'),
    'nmf_onset': (TRANSKUN, TRANS / 'rec_nmf.json', 'onset_peak'),
    'composite': (KONG, TRANS / 'rec_composite.json', 'composite'),
    'composite_without_kong': (TRANSKUN, TRANS / 'rec_composite3.json', 'composite'),
}
PAIRS = [('A1', 'A'), ('B', 'A'), ('C', 'A'), ('B', 'A1'), ('C', 'A1')]
GREEN_COMPARED = ['A', 'A1', 'B', 'C', 'D2']
RNG = np.random.default_rng(225)


@cache
def emulated_runs() -> tuple:
    return tuple(json.loads((SCRATCH / 'emu' / 'hybrids.json').read_text())['runs'])


def pair_statistic(y, V, pitch, other: str, reference: str) -> dict:
    """n·log(RSS_other / RSS_reference) with its block bootstrap: positive favours the reference."""
    n = len(y)
    statistic = lambda idx: n * np.log(version_fit(y[idx], V[other][idx], pitch[idx]).rss / version_fit(y[idx], V[reference][idx], pitch[idx]).rss)
    boot = block_bootstrap(statistic, n, RNG, reps=500)
    return {'other': other, 'reference': reference, 'value': float(statistic(np.arange(n))),
            'ci': [float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5))], 'share_favouring_reference': float(np.mean(boot > 0))}


def version_comparison(matched: Path, loudness_path: Path | None, measure: str, bootstrap: bool = True) -> dict:
    y, V, pitch, _ = load(matched, loudness_path, measure)
    n = len(y)
    fits = {s: version_fit(y, V[s], pitch) for s in SIGLA}
    best = min(fits, key=lambda s: fits[s].rss)
    result = {'n': n, 'best': best, 'r2': {s: fit.r2 for s, fit in fits.items()},
              'delta_to_best': {s: float(n * np.log(fit.rss / fits[best].rss)) for s, fit in fits.items()}}
    return {**result, 'pairs': [pair_statistic(y, V, pitch, *pair) for pair in PAIRS]} if bootstrap else result


def runs_dataset(matched: Path, loudness_path: Path | None, measure: str, runs) -> tuple:
    loudness, pitch_by_id = loudness_by_id(matched, loudness_path, measure)
    candidates = [i for i in pitch_by_id if i in loudness]
    complete = ~np.isnan(velocity_matrix(runs, candidates)).any(axis=0)
    ids = [i for i, keep in zip(candidates, complete) if keep]
    return ids, np.array([loudness[i] for i in ids], dtype=float), np.array([pitch_by_id[i] for i in ids], dtype=float)


def hybrid_marginals(matched: Path, loudness_path: Path | None, measure: str, reps: int = 300) -> dict:
    runs = [r for r in emulated_runs() if r['kind'] == 'hybrid']
    ids, y, pitch = runs_dataset(matched, loudness_path, measure, runs)
    H = velocity_matrix(runs, ids)
    n = len(y)
    marginals = lambda p: np.array([sum(q for q, run in zip(p, runs) if layer in run['toggles']) for layer in LAYERS])
    rss = rss_of(y, H, pitch)
    observed = posterior(rss, n)
    boot = block_bootstrap(lambda idx: marginals(posterior(rss_of(y[idx], H[:, idx], pitch[idx]), n)), n, RNG, reps=reps)
    ranked = [{'layers': '+'.join(runs[k]['toggles']) or 'A', 'delta': float(n * np.log(rss[k] / rss.min())), 'posterior': float(observed[k])}
              for k in np.argsort(rss)[:4]]
    return {'n': n, 'marginals': dict(zip(LAYERS, marginals(observed).tolist())),
            'share_of_resamples_above_half': dict(zip(LAYERS, (boot > 0.5).mean(axis=0).tolist())), 'best': ranked}


def instruments_comparison(matched: Path, loudness_path: Path | None, measure: str) -> dict:
    runs = [r for r in emulated_runs() if r['kind'] == 'version']
    ids, y, pitch = runs_dataset(matched, loudness_path, measure, runs)
    rss = [(run['instrument'], run['siglum'], least_squares(y, design(v, pitch)).rss) for run, v in zip(runs, velocity_matrix(runs, ids))]
    by_instrument = {name: {s: value for _, s, value in group} for name, group in groupby(rss, key=lambda item: item[0])}
    return {name: {s: float(len(y) * np.log(value / by_siglum['A'])) for s, value in by_siglum.items()} for name, by_siglum in by_instrument.items()}


def summarised(passages: list[dict], key) -> list[dict]:
    detectable = sorted((p for p in passages if p['detectability'] >= DETECTABLE), key=key)

    def summary(label, items):
        return {'group': label, 'detectable': len(items), 'favouring_toggle': sum(p['lambda'] > 0.5 for p in items),
                'sum_llr': float(sum(p['llr'] for p in items)), 'sum_detectability': float(sum(p['detectability'] for p in items))}

    return [summary(label, list(items)) for label, items in groupby(detectable, key=key)]


def passage_verdicts(matched: Path, loudness_path: Path | None, measure: str) -> dict:
    scan = json.loads((SCRATCH / 'emu' / 'scan_A.json').read_text())
    base = normalised(scan['base'])
    loudness, pitch_by_id = loudness_by_id(matched, loudness_path, measure)
    ids = [i for i in pitch_by_id if i in loudness and i in base]
    y = np.array([loudness[i] for i in ids], dtype=float)
    pitch = np.array([pitch_by_id[i] for i in ids], dtype=float)
    spans = {(c['family'], min(s['from'] for s in c['symbols'])): span_class(c) for c in scan['clusters']}
    passages = [{'family': v.family, 'from_mm': v.start_mm, 'readings': v.readings, 'span': spans[(v.family, v.start_mm)],
                 'notes': v.notes, 'detectability': v.detectability, 'llr': v.llr, 'lambda': v.local_lambda, 'p': v.p_value}
                for v in sorted(verdicts(y, pitch, ids, base, scan['clusters']), key=lambda v: v.start_mm)]
    return {'passages': passages, 'by_family': summarised(passages, lambda p: p['family']),
            'by_family_and_span': summarised(passages, lambda p: f"{p['family']} {p['span']}")}


def transcription_quality(matched: Path, transcription: Path) -> dict:
    content = json.loads(matched.read_text())
    knots = np.array(content['time_map_knots'])
    heard = [r for r in content['rows'] if r['rec_t'] is not None]
    residual = np.array([r['rec_t'] - np.interp(r['emu_t'], knots[:, 0], knots[:, 1]) for r in heard])
    unmatched = np.array([n['velocity'] for n in content['unmatched_transcribed']])
    return {'transcribed': len(json.loads(transcription.read_text())['notes']), 'matched': len(heard), 'reference_notes': len(content['rows']),
            'onset_residual_sd_ms': float(residual.std() * 1000), 'unmatched': len(unmatched),
            'unmatched_velocity_40_or_more': int(np.sum(unmatched >= 40)), 'missed_mm': [round(r['mm'], 1) for r in content['rows'] if r['rec_t'] is None]}


def green_subset(versions: dict) -> dict:
    rows = [r for r in json.loads(TRANSKUN.read_text())['rows'] if r['kong_velocity'] is not None and all(r[f'V_{s}'] is not None for s in GREEN_COMPARED)]
    y = np.array([r['kong_velocity'] for r in rows], dtype=float)
    pitch = np.array([r['pitch'] for r in rows], dtype=float)
    fits = {s: least_squares(y, design(np.array([r[f'V_{s}'] for r in rows], dtype=float), pitch)) for s in GREEN_COMPARED}
    best = min(fit.rss for fit in fits.values())
    covered = {n['canonical'] for n in versions['D2']['notes'] if n['canonical']}
    return {'n': len(y), 'C_notes_without_D2_counterpart': sum(n['id'] not in covered for n in versions['C']['notes']),
            'r2': {s: fit.r2 for s, fit in fits.items()}, 'delta_to_best': {s: float(len(y) * np.log(fit.rss / best)) for s, fit in fits.items()}}


def deformed_summary() -> dict:
    data = json.loads((TRANS / 'deformed_simulation.json').read_text())
    records = data['records']
    wrongly_A = [r['share_A_branch'] for r in records if r['truth'] in ('B', 'C')]
    rightly_A = [r['share_A_branch'] for r in records if r['truth'] == 'A' and r['deformation'] != 'dead crescendo valve']
    return {'notes': data['notes'], 'target_r2': data['target_r2'], 'draws': data['draws'],
            'largest_share_read_as_A_branch_when_B_or_C': max(wrongly_A), 'smallest_share_read_as_A_branch_when_A_with_a_working_crescendo': min(rightly_A),
            'records': records}


def main():
    versions = versions_by_siglum()
    timing = stretch_test(TRANSKUN)
    composite3 = MEASURES['composite_without_kong']
    report = {
        'audio': json.loads((TRANS / 'audio_probe.json').read_text()),
        'speed': {'rec_seconds_per_emulated_second_corrected': timing['rec_seconds_per_emulated_second'],
                  'rec_seconds_per_emulated_second_as_transferred': timing['rec_seconds_per_emulated_second'] * SPEED_CORRECTION},
        'transcriptions': {'transkun': transcription_quality(TRANSKUN, TRANS / 'transkun_rec.json'), 'kong': transcription_quality(KONG, TRANS / 'kong.json')},
        'red_paper': {'text_transkun': text_test(TRANSKUN, TRANS / 'transkun_rec.json', versions),
                      'text_kong': text_test(KONG, TRANS / 'kong.json', versions), 'timing': timing},
        'measures': {name: version_comparison(*spec) for name, spec in MEASURES.items()},
        'green': green_subset(versions),
        'instruments': instruments_comparison(*MEASURES['composite']),
        'hybrids': {'composite': hybrid_marginals(*MEASURES['composite']), 'transkun': hybrid_marginals(*MEASURES['transkun'])},
        'passages_against_A': {'transkun': passage_verdicts(*MEASURES['transkun']), 'composite_without_kong': passage_verdicts(*composite3)},
        'departures_from_A': {'transkun': departures(*MEASURES['transkun'], 'A', np.random.default_rng(225)),
                              'composite_without_kong': departures(*composite3, 'A', np.random.default_rng(225))},
        'ablation': {'transkun': ablation(*MEASURES['transkun']), 'composite_without_kong': ablation(*composite3)},
        'deformed_instruments': deformed_summary(),
        'pedals': {'differing': {name: differing_spans(versions, name) for name in ('hammerRail', 'damper')},
                   'soft': {label: [soft_pedal_comparison(*MEASURES[label], versions, other, np.random.default_rng(225)) for other in COMPARISONS]
                            for label in ('transkun', 'composite_without_kong')},
                   'damper': damper_agreement(TRANSKUN, versions)},
        'control_tacet': {'versions': version_comparison(TACET, None, '', bootstrap=False), 'hybrids': hybrid_marginals(TACET, None, '')},
        'detectable_threshold': DETECTABLE,
    }
    (TRANS / 'report_data.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(json.dumps({key: report[key] for key in ('speed', 'transcriptions', 'green', 'deformed_instruments')}, indent=1, ensure_ascii=False)[:3000])
    print(json.dumps({name: {'best': m['best'], 'r2': {s: round(v, 3) for s, v in m['r2'].items()}} for name, m in report['measures'].items()}, indent=1))
    print(json.dumps({k: v['by_family'] for k, v in report['passages_against_A'].items()}, indent=1))


if __name__ == '__main__':
    main()
