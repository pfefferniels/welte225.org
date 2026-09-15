"""Which Stanford copy Phillips's red file reads: free fits of A, B, B1 and C on phillipsR, dp placement."""

import json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'expr'))
import expr_test as xt  # noqa: E402
import followup as fu  # noqa: E402

out = {}
for name in ('phillipsR', 'chaseEmR'):
    clock = fu.dp_clock(name)
    out[name] = {}
    for side in ('bass', 'treble'):
        roles = xt.ROLES['licensee'][side]
        env = xt.envelope_of(name, side, clock)
        out[name][side] = {'rows': len(env.rows)}
        for sig in ('A', 'B', 'B1', 'C', 'A1'):
            t = time.time()
            fit = xt.free_fit(xt.image_of(sig, clock), roles, env)
            out[name][side][sig] = xt.describe(fit)
            print(name, side, sig, xt.describe(fit), f'{time.time() - t:.1f}s', flush=True)
Path('control_red.json').write_text(json.dumps(out, indent=1))
