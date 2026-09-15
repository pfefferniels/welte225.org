"""Timing noise at the size copies actually differ by, holes alone and command pairs together."""

import json
from pathlib import Path

import numpy as np

import expr_test as xt
import followup as fu


def jittered(siglum, clock, sigma, mode, seed):
    rng = np.random.default_rng(seed)
    carried = {}
    spans = []
    for symbol in sorted(xt.control_symbols(siglum), key=lambda s: s["from"]):
        kind = symbol["expressionType"]
        track = (xt.SOFT_ON if kind == "SoftPedalOn" else xt.SOFT_OFF if kind == "SoftPedalOff"
                 else xt.TRACK.get((kind, symbol["scope"])))
        if track is None:
            continue
        family = (kind.removesuffix("On").removesuffix("Off"), symbol["scope"])
        if mode == "pair" and kind.endswith("Off") and family in carried:
            d = carried.pop(family)
        else:
            d = float(rng.normal(0, sigma))
            if kind.endswith("On"):
                carried[family] = d
        start = float(clock.seconds(symbol["from"]))
        end = max(float(clock.seconds(symbol["to"])), start + 0.005)
        spans.append((track, start + d, end + d))
    return xt.wf._image(siglum, xt.NOTES, spans)


clock = fu.dp_clock("chaseEmR")
rows = []
for side in ("bass", "treble"):
    roles = xt.ROLES["licensee"][side]
    env = xt.envelope_of("chaseEmR", side, clock)
    for mode in ("independent", "pair"):
        for sigma in (0.03, 0.05, 0.1, 0.25):
            diffs = []
            for seed in range(8):
                b = xt.free_fit(jittered("B", clock, sigma, mode, seed), roles, env).score.cv
                c = xt.free_fit(jittered("C", clock, sigma, mode, seed), roles, env).score.cv
                diffs.append(c - b)
            rows.append({"side": side, "mode": mode, "sigma_s": sigma, "C_minus_B_mean": round(float(np.mean(diffs)), 3),
                         "min": round(float(np.min(diffs)), 3), "B_wins": int(sum(d < 0 for d in diffs)), "seeds": 8})
            print(rows[-1], flush=True)
Path("noise2.json").write_text(json.dumps(rows, indent=1))
