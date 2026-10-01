"""Every number of README.md in report_data.json: Score-HPT's velocities of the notes of TACET's recording beside
the measures of ../trans/report_data.json, all under the per-half model of ../trans."""
import os

os.environ['PER_HALF'] = '1'

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
TRANS = HERE.parent / 'trans'
sys.path.insert(0, str(TRANS))
sys.path.insert(0, str(HERE / 'recording'))

import export_report as er  # noqa: E402
from analysis import SIGLA, design, least_squares, pitch_covariates  # noqa: E402
from cluster_analysis import DETECTABLE, normalised, verdicts  # noqa: E402
from hybrid_analysis import loudness_by_id, velocity_matrix  # noqa: E402
from same_recording import compare  # noqa: E402

MT = TRANS / 'matched_transkun.json'
RUNS = [r for r in json.loads((TRANS.parent / 'emu' / 'hybrids.json').read_text())['runs'] if r['kind'] == 'version']
SCORE_HPT = {'heard': HERE / 'scorehpt_heard.json', 'mapped': HERE / 'scorehpt_mapped.json'}
READINGS = ['onset_velocity', 'v0_onset', 'max_velocity', 'v0_max']


def fits(loudness_path, measure, bootstrap):
    er.RNG = np.random.default_rng(225)
    result = er.version_comparison(er.MATCHED, loudness_path, measure, RUNS, bootstrap=bootstrap)
    result['best'] = max(result['r2'], key=result['r2'].get)
    return result


def editor(path: Path) -> dict:
    out = json.loads(path.read_text())
    v0 = np.array([o['v0_onset'] for o in out])
    corr = np.array([o['onset_velocity'] for o in out])
    delta = corr - v0
    return {'notes': len(out), 'correction_mean': float(delta.mean()), 'correction_sd': float(delta.std()),
            'correction_range': [float(delta.min()), float(delta.max())], 'r_editor_v0': float(np.corrcoef(corr, v0)[0, 1])}


def passages_and_composites() -> dict:
    sources = {
        'transkun': (MT, None, ''), 'kong': (er.MATCHED, None, ''),
        'nmf_harmonic': (MT, TRANS / 'rec_nmf.json', 'harmonic_peak'), 'nmf_onset': (MT, TRANS / 'rec_nmf.json', 'onset_peak'),
        'score_hpt': (MT, SCORE_HPT['heard'], 'onset_velocity'), 'score_hpt_v0': (MT, SCORE_HPT['heard'], 'v0_onset'),
        'score_hpt_mapped': (MT, SCORE_HPT['mapped'], 'onset_velocity'),
    }
    loaded = {name: loudness_by_id(*spec) for name, spec in sources.items()}
    scan = json.loads((TRANS.parent / 'emu' / 'scan.json').read_text())
    base = normalised(scan['base'])
    passages = {}
    for name, (loudness, pitch_by_id) in loaded.items():
        ids = [i for i in pitch_by_id if i in loudness and i in base]
        y = np.array([loudness[i] for i in ids])
        pitch = np.array([pitch_by_id[i] for i in ids], dtype=float)
        found = [v for v in verdicts(y, pitch, ids, base, scan['clusters']) if v is not None]
        detectable = [v for v in found if v.detectability >= DETECTABLE]
        passages[name] = {'detectable': len(detectable), 'favour_C': sum(v.llr < 0 for v in detectable),
                          'favour_switch': sum(v.llr > 0 for v in detectable),
                          'flagged': sum(v.llr > 0 and v.p_value < 0.05 for v in detectable),
                          'median_detectability': float(np.median([v.detectability for v in found]))}

    ids = [i for i in loaded['transkun'][1] if all(i in loudness for loudness, _ in loaded.values())]
    pitch = np.array([loaded['transkun'][1][i] for i in ids], dtype=float)

    def standardised(name):
        y = np.array([loaded[name][0][i] for i in ids])
        residual = y - pitch_covariates(pitch) @ least_squares(y, pitch_covariates(pitch)).coefficients
        return residual / residual.std()

    z = {name: standardised(name) for name in loaded}
    consensus = [r for r in RUNS if r['instrument'] == 'consensus']
    V = dict(zip([r['siglum'] for r in consensus], velocity_matrix(consensus, ids)))
    keep = ~np.isnan(np.array(list(V.values()))).any(axis=0)

    def composite_fit(parts):
        y = np.mean([z[p] for p in parts], axis=0)[keep]
        rss = {s: least_squares(y, design(V[s][keep], pitch[keep])).rss for s in SIGLA}
        total = float(np.sum((y - y.mean()) ** 2))
        return {'parts': parts, 'r2': {s: 1 - rss[s] / total for s in SIGLA},
                'delta': {s: float(keep.sum() * np.log(rss[s] / rss['C'])) for s in SIGLA}}

    composites = {
        'without_kong': composite_fit(['transkun', 'nmf_harmonic', 'nmf_onset']),
        'without_kong_with_score_hpt': composite_fit(['transkun', 'nmf_harmonic', 'nmf_onset', 'score_hpt']),
        'with_kong': composite_fit(['transkun', 'nmf_harmonic', 'nmf_onset', 'kong']),
        'score_hpt_for_transkun': composite_fit(['score_hpt', 'nmf_harmonic', 'nmf_onset']),
        'transkun_and_score_hpt': composite_fit(['transkun', 'score_hpt']),
    }
    names = list(z)
    return {'passages': passages, 'composites': composites,
            'correlations': {'n': len(ids), 'names': names, 'matrix': np.corrcoef([z[k] for k in names]).round(4).tolist()}}


def main():
    report = {
        'recording': {name: compare(TRANS / f'{name}_rec.json' if name == 'transkun' else TRANS / 'kong.json',
                                    HERE / 'recording' / (f'flac_{name}_rec.json' if name == 'transkun' else 'flac_kong.json'))
                      for name in ('transkun', 'kong')},
        'editor': {**{name: editor(path) for name, path in SCORE_HPT.items()},
                   **{f'variant {p.stem}': editor(p) for p in sorted((HERE / 'variants').glob('*.json'))},
                   **{f'synthetic {s}': editor(HERE / 'synth' / f'scorehpt_{s}.json') for s in ('A1', 'B1', 'C')}},
        'measures': {**{name: fits(path, measure, True) for name, (path, measure) in er.MEASURES.items()},
                     **{f'score_hpt {onsets}: {reading}': fits(path, reading, True)
                        for onsets, path in SCORE_HPT.items() for reading in READINGS}},
        'alignment': {p.stem: {reading: fits(p, reading, False) for reading in ('onset_velocity', 'v0_onset')}
                      for p in sorted((HERE / 'variants').glob('*.json'))},
        'synthetic': {s: {'transkun': fits(HERE / 'synth' / f'transkun_loudness_{s}.json', 'velocity', False),
                          'score_hpt': fits(HERE / 'synth' / f'scorehpt_{s}.json', 'onset_velocity', False),
                          'score_hpt_v0': fits(HERE / 'synth' / f'scorehpt_{s}.json', 'v0_onset', False)}
                      for s in ('A1', 'B1', 'C')},
        **passages_and_composites(),
        'control_tacet': json.loads((HERE / 'control_fits.json').read_text()),
        'editor_probe': json.loads((HERE / 'editor_probe.json').read_text()),
        'smd': json.loads((HERE / 'smd_check.json').read_text())['summary'],
    }
    (HERE / 'report_data.json').write_text(json.dumps(report, indent=1))
    for name, m in report['measures'].items():
        print(f"{name:34s} " + ' '.join(f"{s} {m['r2'][s]:.3f}" for s in SIGLA) + f"   Δ B1 {m['delta']['B1']:6.1f}  A1 {m['delta']['A1']:6.1f}")


if __name__ == '__main__':
    main()
