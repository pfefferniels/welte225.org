"""Whether the recording answers each expression function: A without its own commands of one function and register,
A with B's added commands of one, and A without the commands B strikes, each against A."""
import json
from pathlib import Path

import numpy as np

from analysis import design, least_squares, velocity_scale
from hybrid_analysis import loudness_by_id

TRANS = Path(__file__).resolve().parent
SCRATCH = TRANS.parent
CHANGED = 0.3


def ablation(matched: Path, loudness_path: Path | None, measure: str) -> dict:
    variants = json.loads((SCRATCH / 'emu' / 'ablate.json').read_text())
    loudness, pitch_by_id = loudness_by_id(matched, loudness_path, measure)
    ids = [i for i in pitch_by_id if loudness.get(i) is not None]
    y = np.array([loudness[i] for i in ids], dtype=float)
    pitch = np.array([pitch_by_id[i] for i in ids], dtype=float)
    velocities_of = lambda variant: np.array([variant['velocities'].get(i, np.nan) for i in ids])
    base = velocities_of(variants[0])
    predictors = design(base, pitch)
    fit = least_squares(y, predictors)
    sigma2 = fit.rss / (len(y) - predictors.shape[1])
    scale = velocity_scale(fit.coefficients, pitch)

    def compared(variant: dict) -> dict:
        v = velocities_of(variant)
        keep = np.isfinite(v) & np.isfinite(base)
        change = v[keep] - base[keep]
        rss = lambda velocities: least_squares(y[keep], design(velocities, pitch[keep])).rss
        return {'variant': variant['name'], 'punches': variant['count'], 'notes_changed': int(np.sum(np.abs(change) > CHANGED)),
                'detectability': float(np.sum((scale[keep] * change) ** 2) / (2 * sigma2)),
                'delta': float(keep.sum() * np.log(rss(v[keep]) / rss(base[keep])))}

    return {'n': len(y), 'r2_A': fit.r2, 'variants': [compared(v) for v in variants[1:]]}


def main():
    for label, loudness_path, measure in [('Transkun velocities', None, ''), ('composite without Kong', TRANS / 'rec_composite3.json', 'composite')]:
        result = ablation(TRANS / 'matched_transkun.json', loudness_path, measure)
        print(f'== {label}: n {result["n"]}, R² of A {result["r2_A"]:.3f}')
        print(f'{"variant":<52} {"punches":>7} {"notes":>5} {"detect":>7} {"n·log(RSS/RSS_A)":>17}')
        for v in result['variants']:
            print(f'{v["variant"]:<52} {v["punches"]:7d} {v["notes_changed"]:5d} {v["detectability"]:7.1f} {v["delta"]:+17.2f}')


if __name__ == '__main__':
    main()
