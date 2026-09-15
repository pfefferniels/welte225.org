import json, numpy as np
from dataclasses import asdict
from model import *

TRUTH = {"chaseEmR": "D1", "phillipsR": "C"}
out = {}
for name, truth in TRUTH.items():
    clock = clock_of(name)
    n = int(clock.s.max() / STEP) + 200
    events = version_coding(truth, clock)
    out[name] = {}
    for split in (60, 62, 64, 65, 66, 67):
        row = {}
        for scope in ("bass", "treble"):
            env = envelope(name, scope, clock, split)
            eng, cv, rr, coef = identify(events, env, scope, n, variants=("momentary",))
            row[scope] = round(cv, 3)
        print(name, 'split', split, row, flush=True)
    for scope in ("bass", "treble"):
        env = envelope(name, scope, clock, 64)
        for var in ("momentary", "latched"):
            eng, cv, rr, coef = identify(events, env, scope, n, variants=(var,))
            out[name][f"{scope}/{var}"] = {"engine": asdict(eng), "cv": round(cv, 3), "r2": round(rr, 3), "map": [round(float(c), 2) for c in coef], "notes": len(env.v)}
            print(name, scope, var, out[name][f"{scope}/{var}"], flush=True)
json.dump(out, open("identify.json", "w"), indent=1)
