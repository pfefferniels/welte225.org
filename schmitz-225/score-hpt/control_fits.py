"""The Simonton directory's control (TACET's recording against the newer tree) with Score-HPT next to Transkun."""
import json, os, sys
from pathlib import Path
os.environ['PER_HALF'] = '1'
TRANS = Path(sys.argv[1]).resolve(); sys.path.insert(0, str(TRANS))
import numpy as np
import export_report as er
out = {}
for label, path, measure in [('transkun', None, '')] + [(f'{Path(p).stem}:{m}', Path(p).resolve(), m) for p in sys.argv[2:] for m in ('v0_onset', 'onset_velocity')]:
    er.RNG = np.random.default_rng(225)
    res = er.version_comparison(er.TACET, path, measure, bootstrap=True)
    out[label] = res
    pairs = '  '.join(f"{p['other']}/{p['reference']} {p['value']:6.1f}" for p in res['pairs'])
    print(f"{label:36s} best {res['best']:2s} " + ' '.join(f"{s} {res['r2'][s]:.3f}" for s in er.SIGLA) + f"   C vs A: Δ(A−C) {res['delta_to_best']['A'] - res['delta_to_best']['C']:6.1f}")
json.dump(out, open(Path(__file__).resolve().parent / 'control_fits.json', 'w'), indent=1)
