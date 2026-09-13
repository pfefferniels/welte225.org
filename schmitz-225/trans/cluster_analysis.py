"""Passage by passage: does the performance follow C, or C with one cluster of readings toggled?"""
import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from analysis import design, least_squares, velocity_scale
from hybrid_analysis import MOVED_NOTE, loudness_by_id

SCRATCH = Path(__file__).resolve().parent.parent
DETECTABLE = 2.0


@dataclass(frozen=True)
class Verdict:
    family: str
    start_mm: float
    readings: str
    notes: int
    detectability: float
    llr: float
    local_lambda: float
    p_value: float


def normalised(pairs) -> dict[str, float]:
    return {MOVED_NOTE.get(note_id, note_id): velocity for note_id, velocity in pairs}


def circular_llr_null(residual: np.ndarray, positions: np.ndarray, d: np.ndarray, sigma2: float) -> np.ndarray:
    """LLR of the toggle under C, with C's residuals shifted around the piece so their autocorrelation is kept."""
    shifted = np.stack([np.roll(residual, s)[positions] for s in range(len(residual))])
    return ((shifted ** 2) - (shifted - d) ** 2).sum(axis=1) / (2 * sigma2)


def verdicts(y, pitch, ids, base, clusters) -> list[Verdict]:
    v_base = np.array([base[i] for i in ids])
    predictors = design(v_base, pitch)
    fit = least_squares(y, predictors)
    beta = velocity_scale(fit.coefficients, pitch)
    residual = y - predictors @ fit.coefficients
    sigma2 = fit.rss / (len(y) - predictors.shape[1])
    index = {i: k for k, i in enumerate(ids)}

    def verdict(cluster) -> Verdict | None:
        toggled = normalised(cluster['velocity'])
        positions = np.array(sorted({index[MOVED_NOTE.get(i, i)] for i in cluster['affected'] if MOVED_NOTE.get(i, i) in index}))
        if len(positions) == 0:
            return None
        d = beta[positions] * np.array([toggled.get(ids[k], base[ids[k]]) - base[ids[k]] for k in positions])
        r = residual[positions]
        llr = float(((r ** 2) - (r - d) ** 2).sum() / (2 * sigma2))
        null = circular_llr_null(residual, positions, d, sigma2)
        readings = ', '.join(f"{s['type']}/{s['scope'][0]}@{s['from']:.0f}" for s in cluster['symbols'])
        return Verdict(cluster['family'], min(s['from'] for s in cluster['symbols']), readings, len(positions),
                       float((d ** 2).sum() / (2 * sigma2)), llr, float(r @ d / (d @ d)), float(np.mean(null >= llr)))

    return [v for v in map(verdict, clusters) if v is not None]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('matched', type=Path)
    parser.add_argument('--loudness', type=Path)
    parser.add_argument('--measure', default='harmonic_peak')
    parser.add_argument('--scan', type=Path, default=SCRATCH / 'emu' / 'scan.json')
    parser.add_argument('--all', action='store_true')
    args = parser.parse_args()

    loudness, pitch_by_id = loudness_by_id(args.matched, args.loudness, args.measure)
    scan = json.loads(args.scan.read_text())
    base = normalised(scan['base'])
    ids = [i for i in pitch_by_id if i in loudness and i in base]
    y = np.array([loudness[i] for i in ids])
    pitch = np.array([pitch_by_id[i] for i in ids], dtype=float)

    results = sorted(verdicts(y, pitch, ids, base, scan['clusters']), key=lambda v: v.start_mm)
    shown = results if args.all else [v for v in results if v.detectability >= DETECTABLE]
    print(f'{len(results)} clusters with audible effect; showing {"all" if args.all else f"detectability ≥ {DETECTABLE}"}')
    print(f'{"family":>8} {"mm":>7} {"notes":>5} {"detect":>6} {"LLR":>7} {"λ":>6} {"p":>5}  readings')
    for v in shown:
        flag = '  <-- toggle favoured' if v.llr > 0 and v.p_value < 0.05 else ''
        print(f'{v.family:>8} {v.start_mm:7.0f} {v.notes:5d} {v.detectability:6.1f} {v.llr:+7.2f} {v.local_lambda:+6.2f} {v.p_value:5.2f}  {v.readings[:90]}{flag}')

    by_family = defaultdict(list)
    for v in results:
        by_family[v.family].append(v)
    print('per family (detectable clusters): count, how many favour the toggle (λ > 0.5), sum of LLR, sum of detectability')
    for family, items in by_family.items():
        detectable = [v for v in items if v.detectability >= DETECTABLE]
        print(f'  {family:>8}: {len(detectable):3d} detectable of {len(items):3d}, λ>0.5 in {sum(v.local_lambda > 0.5 for v in detectable):3d}, '
              f'ΣLLR {sum(v.llr for v in items):+8.2f}, Σdetect {sum(v.detectability for v in items):7.1f}')


if __name__ == '__main__':
    main()
