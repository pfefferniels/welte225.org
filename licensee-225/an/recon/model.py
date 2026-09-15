"""Forward model of a Welte expression engine and the clocks that put the edition's coding into a file's time.

Level per register in [0, 1]: the slow crescendo latches from an On to the next Off and rises at `slow`,
otherwise the level falls at `decay`; the forzando either latches the same way at `fast` or acts only while
its perforation is open, with `fast_decay` while an Off perforation is open. Velocity is a line in the level,
attenuated by `soft` while the soft pedal is latched.
"""
from __future__ import annotations

import json, os, sys
from numba import njit
from dataclasses import dataclass, replace
from pathlib import Path
import numpy as np

AN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AN))
V = json.loads((AN / "versions.json").read_text())
E = json.loads((AN / "midi_events.json").read_text())
STEP = 0.01


def ticks_per_second(name: str) -> float:
    return E[name]["tpq"] / (E[name]["tempos"][0][1] / 1e6)


@dataclass(frozen=True)
class Clock:
    mm: np.ndarray
    s: np.ndarray

    def seconds(self, x):
        return np.interp(x, self.mm, self.s)

    def millimetres(self, t):
        return np.interp(t, self.s, self.mm)


def clock_of(name: str) -> Clock:
    """The sequence-aligned local map of align_dp, sampled densely and made monotone."""
    here = os.getcwd(); os.chdir(AN)
    try:
        import align_dp
        m = align_dp.local_map(name)
    finally:
        os.chdir(here)
    tps = ticks_per_second(name)
    last = max(n["off"] for n in E[name]["notes"])
    ticks = np.linspace(0, last, 20000)
    mm = np.maximum.accumulate(np.array([m["to_x"](t) for t in ticks]))
    keep = np.concatenate([[True], np.diff(mm) > 1e-6])
    return Clock(mm[keep], ticks[keep] / tps)


@dataclass(frozen=True)
class Event:
    kind: str      # SlowCrescendo, Forzando, SoftPedal
    on: bool
    scope: str     # bass, treble, both
    start: float   # seconds
    end: float


def coding(symbols, clock: Clock) -> list[Event]:
    out = []
    for s in symbols:
        t = s.get("expressionType") or ""
        for base in ("SlowCrescendo", "Forzando", "SoftPedal"):
            if t.startswith(base) and t[len(base):] in ("On", "Off"):
                scope = "both" if base == "SoftPedal" else s["scope"]
                a = float(clock.seconds(s["from"])); b = max(float(clock.seconds(s["to"])), a + STEP)
                out.append(Event(base, t.endswith("On"), scope, a, b))
    return sorted(out, key=lambda e: e.start)


def version_coding(siglum: str, clock: Clock) -> list[Event]:
    return coding([s for s in V["snapshots"][siglum] if s["type"] == "expression"], clock)


@dataclass(frozen=True)
class Engine:
    slow: float = 0.25
    decay: float = 0.25
    fast: float = 3.0
    fast_decay: float = 3.0
    forzando: str = "momentary"   # or "latched"
    soft: float = 0.0


def latched(events, kind, scope, n):
    state = np.zeros(n, bool)
    edges = sorted((e.start, e.on) for e in events if e.kind == kind and e.scope in (scope, "both"))
    open_at = None
    for t, on in edges:
        i = int(t / STEP)
        if on and open_at is None: open_at = i
        elif not on and open_at is not None:
            state[open_at:min(i, n)] = True; open_at = None
    if open_at is not None: state[open_at:] = True
    return state


def momentary(events, kind, on, scope, n):
    state = np.zeros(n, bool)
    for e in events:
        if e.kind == kind and e.on == on and e.scope == scope:
            state[int(e.start / STEP):min(int(e.end / STEP) + 1, n)] = True
    return state


def drive_of(events, scope, engine: Engine, n):
    c = latched(events, "SlowCrescendo", scope, n)
    d = np.where(c, engine.slow, -engine.decay)
    if engine.forzando == "latched":
        d = np.where(latched(events, "Forzando", scope, n), engine.fast, d)
    else:
        d = d + momentary(events, "Forzando", True, scope, n) * engine.fast
    d = d - momentary(events, "Forzando", False, scope, n) * engine.fast_decay
    return d * STEP


@njit(cache=True)
def integrate(drive):
    out = np.empty(len(drive)); v = 0.0
    for i in range(len(drive)):
        v += drive[i]
        if v < 0.0: v = 0.0
        elif v > 1.0: v = 1.0
        out[i] = v
    return out


@dataclass(frozen=True)
class Envelope:
    t: np.ndarray
    v: np.ndarray
    mm: np.ndarray


def envelope(name: str, scope: str, clock: Clock, split: int = 64, gap: float = 0.03) -> Envelope:
    tps = ticks_per_second(name)
    notes = sorted((n["on"] / tps, n["vel"]) for n in E[name]["notes"] if (n["pitch"] < split) == (scope == "bass"))
    groups = []
    for note in notes:
        if groups and note[0] - groups[-1][-1][0] <= gap: groups[-1].append(note)
        else: groups.append([note])
    t = np.array([np.mean([a for a, _ in g]) for g in groups]); v = np.array([float(np.median([b for _, b in g])) for g in groups])
    return Envelope(t, v, clock.millimetres(t))


def predict(level_at, soft_at, v, s):
    att = 1.0 - s * soft_at
    X = np.stack([att, level_at * att], axis=1)
    coef, *_ = np.linalg.lstsq(X, v, rcond=None)
    return X @ coef, coef


def r2(v, p):
    return float(1 - np.sum((v - p) ** 2) / np.sum((v - v.mean()) ** 2))


def cv_r2(level_at, soft_at, v, s, folds=5):
    n = len(v); block = np.minimum((np.arange(n) * folds) // n, folds - 1); held = np.empty(n)
    for f in range(folds):
        te = block == f; tr = ~te
        _, coef = predict(level_at[tr], soft_at[tr], v[tr], s)
        att = 1.0 - s * soft_at[te]
        held[te] = coef[0] * att + coef[1] * level_at[te] * att
    return r2(v, held)


def evaluate(events, env: Envelope, scope: str, engine: Engine, n: int):
    level = integrate(drive_of(events, scope, engine, n))
    soft = latched(events, "SoftPedal", "both", n).astype(float)
    idx = np.clip((env.t / STEP).astype(int), 0, n - 1)
    return level[idx], soft[idx]


def identify(events, env: Envelope, scope: str, n: int, variants=("momentary", "latched")):
    """Staged grid search for rates, forzando variant and soft factor; returns (engine, cv, r2)."""
    best = None
    def score(engine):
        la, sa = evaluate(events, env, scope, engine, n)
        return cv_r2(la, sa, env.v, engine.soft)
    grid_slow = (0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.7)
    for var in variants:
        for a in grid_slow:
            for b in grid_slow:
                e = Engine(slow=a, decay=b, forzando=var)
                sc = score(e)
                if best is None or sc > best[1]: best = (e, sc)
    e0 = best[0]
    for f in (1.0, 2.0, 3.0, 5.0, 8.0, 12.0):
        for fd in (1.0, 3.0, 6.0, 12.0):
            e = replace(e0, fast=f, fast_decay=fd); sc = score(e)
            if sc > best[1]: best = (e, sc)
    e0 = best[0]
    for a in np.geomspace(e0.slow / 1.4, e0.slow * 1.4, 5):
        for b in np.geomspace(e0.decay / 1.4, e0.decay * 1.4, 5):
            e = replace(e0, slow=float(a), decay=float(b)); sc = score(e)
            if sc > best[1]: best = (e, sc)
    e0 = best[0]
    for s in (0.0, 0.05, 0.1, 0.15, 0.2, 0.3):
        e = replace(e0, soft=s); sc = score(e)
        if sc > best[1]: best = (e, sc)
    la, sa = evaluate(events, env, scope, best[0], n)
    p, coef = predict(la, sa, env.v, best[0].soft)
    return best[0], best[1], r2(env.v, p), coef
