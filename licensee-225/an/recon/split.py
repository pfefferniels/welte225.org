import json
from dataclasses import asdict
import numpy as np
from model import *

def envelope_range(name, clock, pitches, gap=0.03):
    tps = ticks_per_second(name)
    notes = sorted((n["on"] / tps, n["vel"]) for n in E[name]["notes"] if n["pitch"] in pitches)
    groups = []
    for note in notes:
        if groups and note[0] - groups[-1][-1][0] <= gap: groups[-1].append(note)
        else: groups.append([note])
    t = np.array([np.mean([a for a, _ in g]) for g in groups]); v = np.array([float(np.median([b for _, b in g])) for g in groups])
    return Envelope(t, v, clock.millimetres(t))

if __name__ == "__main__":
  pass
RUNS = [("chaseEmR", "D1"), ("phillipsR", "C"), ("gourlin", "C"), ("gourlin", "B"), ("phillipsL", "C"), ("phillipsL", "B")]
out = {}
clocks = {}
for name, sig in RUNS:
    clock = clocks.setdefault(name, clock_of(name))
    n = int(clock.s.max() / STEP) + 200
    events = version_coding(sig, clock)
    res = {"bass": {}, "treble": {}}
    for kb in (60, 62, 63, 64, 65, 66):
        env = envelope_range(name, clock, range(0, kb))
        eng, cv, rr, coef = identify(events, env, "bass", n, variants=("momentary",))
        res["bass"][kb] = (round(cv, 3), asdict(eng), [round(float(c), 1) for c in coef])
    for kt in (64, 65, 66, 67, 68):
        env = envelope_range(name, clock, range(kt, 128))
        eng, cv, rr, coef = identify(events, env, "treble", n, variants=("momentary",))
        res["treble"][kt] = (round(cv, 3), asdict(eng), [round(float(c), 1) for c in coef])
    out[f"{name}/{sig}"] = res
    print(name, sig, 'bass', {k: v[0] for k, v in res['bass'].items()}, 'treble', {k: v[0] for k, v in res['treble'].items()}, flush=True)
json.dump(out, open("split.json", "w"), indent=1)
