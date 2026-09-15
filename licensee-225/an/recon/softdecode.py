"""Blind soft-pedal timeline from velocities: binary Viterbi over note times, both registers together."""
import json
import numpy as np
from dataclasses import replace
from model import *
from recon import SPLITS, engine_of, notes_of, expression, TRUTH

bars = json.load(open("../bars/bars.json"))
bar_of = lambda x: ([b["label"] for b in bars if b["from_mm"] <= x] or ["up"])[-1]


def per_note(name, coding_sig, clock):
    """Velocity predicted with soft forced on and forced off, for every note group in both registers."""
    n = int(clock.s.max() / STEP) + 300
    events = [e for e in version_coding(coding_sig, clock) if e.kind != "SoftPedal"]
    true_soft = latched(version_coding(TRUTH.get(name, coding_sig), clock), "SoftPedal", "both", n)
    rows = []
    for scope in ("bass", "treble"):
        eng, coef, cv = engine_of(name, scope, TRUTH.get(name, "C"))
        t, v = notes_of(name, clock, scope)
        idx = np.clip((t / STEP).astype(int), 0, n - 1)
        level = integrate(drive_of(events, scope, eng, n))[idx]
        s = max(eng.soft, 0.08)
        X = np.stack([1 - s * true_soft[idx], level * (1 - s * true_soft[idx])], axis=1)
        (a, b), *_ = np.linalg.lstsq(X, v, rcond=None)
        on, off = (a + b * level) * (1 - s), (a + b * level)
        sigma = float(np.std(v - X @ np.array([a, b])))
        rows += [(ti, vi, pon, poff, sigma) for ti, vi, pon, poff in zip(t, v, on, off)]
    rows.sort()
    return rows


def viterbi(rows, lam):
    cost = np.array([0.0, 0.0]); back = []
    for t, v, pon, poff, sigma in rows:
        e = np.array([(v - poff) ** 2, (v - pon) ** 2]) / (2 * sigma ** 2)
        stay = cost; switch = cost[::-1] + lam
        choose = switch < stay
        back.append(choose)
        cost = np.where(choose, switch, stay) + e
    state = int(np.argmin(cost)); path = []
    for choose in reversed(back):
        path.append(state)
        if choose[state]: state = 1 - state
    return path[::-1]


def changes(rows, path, clock):
    out = []
    for i in range(1, len(path)):
        if path[i] != path[i - 1]:
            mm = float(clock.millimetres((rows[i - 1][0] + rows[i][0]) / 2))
            out.append(("On" if path[i] else "Off", round(mm), bar_of(mm)))
    return out


for name in ("chaseEmR", "gourlin", "phillipsL"):
    clock = clock_of(name)
    for sig in (["D1"] if name == "chaseEmR" else ["B", "C"]):
        rows = per_note(name, sig, clock)
        for lam in (4.0, 10.0, 25.0):
            path = viterbi(rows, lam)
            print(f"{name} coding {sig} switch cost {lam}: soft changes {changes(rows, path, clock)}", flush=True)
print("\ncoded soft pedal, C/B:", [(s["expressionType"][9:], round(s["from"]), bar_of(s["from"])) for s in expression("C") if s["expressionType"].startswith("SoftPedal")])
print("coded soft pedal, A1:", [(s["expressionType"][9:], round(s["from"]), bar_of(s["from"])) for s in expression("A1") if s["expressionType"].startswith("SoftPedal")])
