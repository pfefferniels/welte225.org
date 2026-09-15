"""A version-neutral composite of several per-note loudness measures: each is freed of its pitch trend and
standardised without reference to any version, then they are averaged."""
import argparse
import json
from pathlib import Path

import numpy as np

from analysis import least_squares, pitch_covariates
from hybrid_analysis import loudness_by_id


def standardised(values: dict[str, float], pitch_by_id: dict[str, int], ids: list[str]) -> np.ndarray:
    y = np.array([values[i] for i in ids])
    covariates = pitch_covariates(np.array([pitch_by_id[i] for i in ids], dtype=float))
    residual = y - covariates @ least_squares(y, covariates).coefficients
    return residual / residual.std()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('matched', type=Path)
    parser.add_argument('out', type=Path)
    parser.add_argument('sources', nargs='+', help='"kong", or path:measure of a loudness json')
    args = parser.parse_args()

    def source(spec):
        if spec == 'kong':
            return loudness_by_id(args.matched, None, '')
        path, measure = spec.rsplit(':', 1)
        return loudness_by_id(args.matched, Path(path), measure)

    loaded = [source(spec) for spec in args.sources]
    pitch_by_id = loaded[0][1]
    ids = [i for i in pitch_by_id if all(i in values for values, _ in loaded)]
    columns = np.column_stack([standardised(values, pitch_by_id, ids) for values, _ in loaded])
    print('correlations between sources:\n', np.round(np.corrcoef(columns.T), 3))

    index_of = {r['id']: k for k, r in enumerate(json.loads(args.matched.read_text())['rows'])}
    args.out.write_text(json.dumps([{'index': index_of[i], 'composite': float(v)} for i, v in zip(ids, columns.mean(axis=1))]))
    print(f'{len(ids)} notes written to {args.out}')


if __name__ == '__main__':
    main()
