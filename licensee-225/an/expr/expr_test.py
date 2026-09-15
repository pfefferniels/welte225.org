"""Which version's expression coding explains Trachtman's emulation of Gourlin's Licensee copy.

The level model and the output stage are the earlier study's (`welte_fit.LevelModel`,
`emulator_fit._fit_output`). Added here: the edition's symbols as the control image, a
soft-pedal attenuation (measured as ~8/9 on emR in signatures.md), and the design of
fixed-parameter transfer, free refit, shifted-coding controls and pairwise tests.

    python3 expr_test.py      writes results.json
"""

from __future__ import annotations

import collections
import json
import sys
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

ANALYSIS = Path("/private/tmp/claude-501/-Users-nielspfeffer-Projects-measuring-early-records"
                "/f9048581-7585-42e1-82b3-b508c9f47a1d/scratchpad/analysis")
sys.path.insert(0, str(ANALYSIS))
import emulator_fit as ef  # noqa: E402
import welte_fit as wf  # noqa: E402
from run_welte import NOTES, ROLES  # noqa: E402

HERE = Path(__file__).resolve().parent
AN = HERE.parent
V = json.loads((AN / "versions.json").read_text())
E = json.loads((AN / "midi_events.json").read_text())
P = json.loads((AN / "placed.json").read_text())

SPLIT = 64
CANDIDATES = ("A", "A1", "B", "B1", "C", "D1")
SHIFTS = (-8.0, -4.0, -2.0, -1.0, 1.0, 2.0, 4.0, 8.0)
SOFT_GRID = (0.0, 0.04, 0.08, 1 / 9, 0.15)

#: The edition's reading of each command, onto the Licensee grid the earlier study measured.
TRACK = {
    ("SlowCrescendoOn", "bass"): 19, ("SlowCrescendoOff", "bass"): 18,
    ("ForzandoOn", "bass"): 21, ("ForzandoOff", "bass"): 20,
    ("MezzoforteOn", "bass"): 17, ("MezzoforteOff", "bass"): 16,
    ("SlowCrescendoOn", "treble"): 110, ("SlowCrescendoOff", "treble"): 111,
    ("ForzandoOn", "treble"): 108, ("ForzandoOff", "treble"): 109,
    ("MezzoforteOn", "treble"): 112, ("MezzoforteOff", "treble"): 113,
}
SOFT_ON, SOFT_OFF = 23, 22


# ------------------------------------------------------------------ clocks


@dataclass(frozen=True)
class Clock:
    """Edition millimetres to the emulation's seconds and back, through its matched notes."""

    grid_mm: np.ndarray
    grid_s: np.ndarray
    matched: int

    def seconds(self, mm):
        return np.interp(mm, self.grid_mm, self.grid_s)

    def millimetres(self, s):
        return np.interp(s, self.grid_s, self.grid_mm)


def ticks_per_second(name: str) -> float:
    events = E[name]
    return events["tpq"] / (events["tempos"][0][1] / 1e6)


def greedy_pairs(candidates):
    used_a, used_b, pairs = set(), set(), []
    for _, a, b in sorted(candidates):
        if a in used_a or b in used_b:
            continue
        used_a.add(a); used_b.add(b); pairs.append((a, b))
    return pairs


def running_median(values: np.ndarray, width: int) -> np.ndarray:
    half = width // 2
    return np.array([np.median(values[max(0, i - half):i + half + 1]) for i in range(len(values))])


def clock_of(name: str, window: float = 25.0) -> Clock:
    tps = ticks_per_second(name)
    placed = P[name]["notes"]
    reference = [s for s in V["snapshots"]["C"] if s["type"] == "note"]
    by_pitch = collections.defaultdict(list)
    for j, r in enumerate(reference):
        by_pitch[r["pitch"]].append(j)
    candidates = [(abs(n["x_on"] - reference[j]["from"]), i, j)
                  for i, n in enumerate(placed) for j in by_pitch[n["pitch"]]
                  if abs(n["x_on"] - reference[j]["from"]) <= window]
    pairs = sorted(greedy_pairs(candidates), key=lambda p: reference[p[1]]["from"])
    mm = np.array([reference[j]["from"] for _, j in pairs])
    s = np.array([E[name]["notes"][i]["on"] / tps for i, _ in pairs])
    coef = np.polyfit(mm, s, 2)
    smooth = running_median(s - np.polyval(coef, mm), 9)
    grid_mm = np.arange(mm.min() - 800, mm.max() + 800, 0.5)
    grid_s = np.polyval(coef, grid_mm) + np.interp(grid_mm, mm, smooth)
    return Clock(grid_mm, np.maximum.accumulate(grid_s), len(pairs))


# ------------------------------------------------------------------ images


def control_symbols(siglum: str | None):
    if siglum is None:
        return []
    return [s for s in V["snapshots"][siglum] if s["type"] == "expression"]


def image_of(siglum: str | None, clock: Clock, shift: float = 0.0) -> wf.Image:
    spans = []
    for symbol in control_symbols(siglum):
        kind = symbol["expressionType"]
        track = (SOFT_ON if kind == "SoftPedalOn" else SOFT_OFF if kind == "SoftPedalOff"
                 else TRACK.get((kind, symbol["scope"])))
        if track is None:
            continue
        start = float(clock.seconds(symbol["from"])) + shift
        end = max(float(clock.seconds(symbol["to"])) + shift, start + 0.005)
        spans.append((track, start, end))
    return wf._image(siglum or "null", NOTES, spans)


def soft_state(image: wf.Image, rows: np.ndarray) -> np.ndarray:
    """Latched from the leading edge of an on hole to the trailing edge of an off hole."""
    edges = sorted([(h.start, 1) for h in image.controls.get(SOFT_ON, [])]
                   + [(h.end, 0) for h in image.controls.get(SOFT_OFF, [])])
    if not edges:
        return np.zeros(len(rows))
    times = np.array([t for t, _ in edges])
    states = np.array([k for _, k in edges])
    index = np.searchsorted(times, rows, side="right") - 1
    return np.where(index >= 0, states[np.maximum(index, 0)], 0).astype(float)


# ---------------------------------------------------------------- envelope


@dataclass(frozen=True)
class Envelope:
    rows: np.ndarray          # emulator seconds
    velocity: np.ndarray
    mm: np.ndarray            # edition millimetres of each row


def envelope_of(name: str, side: str, clock: Clock, gap: float = 0.03) -> Envelope:
    tps = ticks_per_second(name)
    notes = sorted((n["on"] / tps, n["vel"]) for n in E[name]["notes"]
                   if (n["pitch"] < SPLIT) == (side == "bass"))
    groups: list[list[tuple[float, int]]] = []
    for note in notes:
        if groups and note[0] - groups[-1][-1][0] <= gap:
            groups[-1].append(note)
        else:
            groups.append([note])
    rows = np.array([np.mean([t for t, _ in g]) for g in groups])
    velocity = np.array([float(np.median([v for _, v in g])) for g in groups])
    return Envelope(rows, velocity, clock.millimetres(rows))


# ------------------------------------------------------------------- level


def level_of(model: wf.LevelModel, image: wf.Image, roles: wf.Roles, rows: np.ndarray) -> np.ndarray:
    """`LevelModel.run`, with the ramp integrated over plain floats; identical where no hook latches."""
    drive, latched_mf, steps = model.drive(image, roles, rows)
    if model.integrator != "ramp" or (model.hooked and model.hook is not None and latched_mf.any()):
        return model.run(image, roles, rows)
    floor, ceiling = model.floor, model.ceiling
    span = ceiling - floor
    out = np.empty(steps)
    value = floor
    for i, d in enumerate(drive.tolist()):
        wanted = value + d * span
        value = floor if wanted < floor else ceiling if wanted > ceiling else wanted
        out[i] = value
    return out[model._index(rows, image, steps)]


# ----------------------------------------------------------------- scoring


@dataclass(frozen=True)
class Score:
    cv: float
    r2: float
    kind: str
    soft: float
    held: np.ndarray
    full: np.ndarray


def score(level: np.ndarray, velocity: np.ndarray, soft: np.ndarray, kind: str, s: float,
          folds: int = 5) -> Score:
    attenuation = 1.0 - s * soft
    target = velocity / attenuation
    n = len(velocity)
    block = np.minimum((np.arange(n) * folds) // n, folds - 1)
    held = np.empty(n)
    for fold in range(folds):
        test = block == fold
        train = ~test
        if np.ptp(level[train]) < 1e-9:
            held[test] = target[train].mean() * attenuation[test]
        else:
            held[test] = ef._fit_output(level[train], target[train], kind)(level[test]) * attenuation[test]
    full = (ef._fit_output(level, target, kind)(level) if np.ptp(level) >= 1e-9
            else np.full(n, target.mean())) * attenuation
    total = float(np.sum((velocity - velocity.mean()) ** 2))
    return Score(float(1 - np.sum((velocity - held) ** 2) / total),
                 float(1 - np.sum((velocity - full) ** 2) / total), kind, s, held, full)


def best_score(level, velocity, soft, kinds=("linear",), softs=SOFT_GRID) -> Score:
    return max((score(level, velocity, soft, k, s) for k in kinds for s in softs), key=lambda x: x.cv)


@dataclass(frozen=True)
class Fit:
    model: wf.LevelModel
    score: Score


def free_fit(image: wf.Image, roles: wf.Roles, env: Envelope) -> Fit:
    """The study's staged search, latched ramp only (established for this engine), plus the soft term."""
    soft = soft_state(image, env.rows)

    def evaluate(models, kinds=("linear",)):
        return [Fit(m, best_score(level_of(m, image, roles, env.rows), env.velocity, soft, kinds))
                for m in models]

    base = wf.LevelModel(slow_rate=0.3, decay_rate=0.3, fast_rate=3.0, fast_decay=3.0, hook=None,
                         latched_crescendo=True, hooked=False, integrator="ramp")
    slow = (0.12, 0.2, 0.3, 0.45, 0.7, 1.0)
    fast = (0.8, 1.5, 3.0, 6.0, 12.0)
    stage = evaluate([replace(base, slow_rate=a, decay_rate=b) for a in slow for b in slow])
    top = max(stage, key=lambda f: f.score.cv).model
    stage += evaluate([replace(top, fast_rate=a, fast_decay=b) for a in fast for b in fast])
    top = max(stage, key=lambda f: f.score.cv).model
    around = lambda v: np.geomspace(v / 1.6, v * 1.6, 5)  # noqa: E731
    stage += evaluate([replace(top, slow_rate=a, decay_rate=b)
                       for a in around(top.slow_rate) for b in around(top.decay_rate)])
    top = max(stage, key=lambda f: f.score.cv).model
    final = evaluate([top], kinds=("linear", "sqrt", "power"))
    return max(stage + final, key=lambda f: f.score.cv)


def fixed_fit(fit: Fit, image: wf.Image, roles: wf.Roles, env: Envelope) -> Score:
    """The dynamics and the soft factor carried over; only the output stage is refitted, out of sample."""
    level = level_of(fit.model, image, roles, env.rows)
    return score(level, env.velocity, soft_state(image, env.rows), fit.score.kind, fit.score.soft)


def transferred(fit: Fit, source: tuple[wf.Image, Envelope], image: wf.Image, roles: wf.Roles,
                env: Envelope) -> dict:
    """Everything carried over, the output stage included: R² on the raw scale and a scale-free r."""
    src_image, src_env = source
    src_soft = soft_state(src_image, src_env.rows)
    src_level = level_of(fit.model, src_image, roles, src_env.rows)
    shape = ef._fit_output(src_level, src_env.velocity / (1 - fit.score.soft * src_soft), fit.score.kind)
    soft = soft_state(image, env.rows)
    predicted = shape(level_of(fit.model, image, roles, env.rows)) * (1 - fit.score.soft * soft)
    total = float(np.sum((env.velocity - env.velocity.mean()) ** 2))
    r = float(np.corrcoef(predicted, env.velocity)[0, 1]) if np.ptp(predicted) > 1e-9 else 0.0
    return {"r2_raw": float(1 - np.sum((env.velocity - predicted) ** 2) / total), "r": r}


def describe(fit: Fit) -> dict:
    m = fit.model
    return {"cv": round(fit.score.cv, 4), "r2": round(fit.score.r2, 4), "map": fit.score.kind,
            "soft": round(fit.score.soft, 3), "slow": round(m.slow_rate, 3), "decay": round(m.decay_rate, 3),
            "fast": round(m.fast_rate, 3), "fast_decay": round(m.fast_decay, 3)}


# ------------------------------------------------------------ comparisons


def pairwise(env: Envelope, held: dict[str, np.ndarray], pairs, threshold: float = 1.0) -> list[dict]:
    """Where two codings predict differently, which one the emulation follows."""
    out = []
    for x, y in pairs:
        where = np.abs(held[x] - held[y]) > threshold
        if where.sum() == 0:
            out.append({"pair": f"{x}-{y}", "rows": 0})
            continue
        ex = np.abs(env.velocity[where] - held[x][where])
        ey = np.abs(env.velocity[where] - held[y][where])
        out.append({"pair": f"{x}-{y}", "rows": int(where.sum()),
                    "sse_x": round(float(np.sum(ex ** 2)), 1), "sse_y": round(float(np.sum(ey ** 2)), 1),
                    "x_closer": int(np.sum(ex < ey)), "y_closer": int(np.sum(ey < ex)),
                    "mm_span": [round(float(env.mm[where].min())), round(float(env.mm[where].max()))]})
    return out


def edit_places() -> list[tuple[str, float, str]]:
    symbols = {s["id"]: s for v in V["versions"] for e in v["edits"] for s in e["insert"]}
    places = []
    for v in V["versions"]:
        if v["siglum"] not in ("A1", "B", "B1", "C", "D1"):
            continue
        for e in v["edits"]:
            touched = e["insert"] + [symbols[i] for i in e["delete"] if i in symbols]
            places += [(v["siglum"], s["from"], s.get("expressionType") or "note") for s in touched
                       if s["type"] == "expression" and not s["expressionType"].startswith("Sustain")]
    return places


def residual_regions(env: Envelope, held: np.ndarray, width: int = 6, factor: float = 2.5) -> list[dict]:
    residual = env.velocity - held
    local = np.convolve(residual, np.ones(width) / width, mode="same")
    mad = np.median(np.abs(local - np.median(local))) * 1.4826
    flagged = np.abs(local) > factor * mad
    regions, start = [], None
    for i, f in enumerate(list(flagged) + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            regions.append((start, i - 1)); start = None
    places = edit_places()
    out = []
    for a, b in regions:
        lo, hi = float(env.mm[a]), float(env.mm[b])
        near = sorted(((min(abs(p - lo), abs(p - hi)) if not lo <= p <= hi else 0.0), sig, p, kind)
                      for sig, p, kind in places)
        out.append({"mm": [round(lo), round(hi)], "rows": b - a + 1,
                    "mean_residual": round(float(residual[a:b + 1].mean()), 2),
                    "nearest_edit": {"version": near[0][1], "at": round(near[0][2]), "type": near[0][3],
                                     "distance": round(near[0][0])} if near else None})
    return out


def coverage(env: Envelope, radius: float) -> float:
    places = np.array([p for _, p, _ in edit_places()])
    grid = np.arange(env.mm.min(), env.mm.max(), 1.0)
    return float(np.mean(np.min(np.abs(grid[:, None] - places[None, :]), axis=1) <= radius))


# --------------------------------------------------------------------- run


def main() -> None:
    results: dict = {}
    clocks = {name: clock_of(name) for name in ("chaseEmR", "gourlin", "phillipsL")}
    results["clocks"] = {k: c.matched for k, c in clocks.items()}
    print("clocks matched notes:", results["clocks"], flush=True)

    # the fast integrator must equal the study's
    probe = wf.LevelModel(slow_rate=0.3, decay_rate=0.2, fast_rate=3.0, fast_decay=6.0, hook=None,
                          latched_crescendo=True, hooked=False)
    image = image_of("C", clocks["gourlin"])
    rows = envelope_of("gourlin", "bass", clocks["gourlin"]).rows
    assert np.allclose(level_of(probe, image, ROLES["licensee"]["bass"], rows),
                       probe.run(image, ROLES["licensee"]["bass"], rows))

    # C and D1 as the engine would see them
    for side in ("bass", "treble"):
        env = envelope_of("gourlin", side, clocks["gourlin"])
        lc = level_of(probe, image_of("C", clocks["gourlin"]), ROLES["licensee"][side], env.rows)
        ld = level_of(probe, image_of("D1", clocks["gourlin"]), ROLES["licensee"][side], env.rows)
        sc = soft_state(image_of("C", clocks["gourlin"]), env.rows)
        sd = soft_state(image_of("D1", clocks["gourlin"]), env.rows)
        results.setdefault("c_vs_d1_identical", {})[side] = bool(np.allclose(lc, ld) and np.allclose(sc, sd))
    print("C and D1 give identical level and soft state:", results["c_vs_d1_identical"], flush=True)

    codings = [(c, 0.0) for c in CANDIDATES] + [(None, 0.0)]
    controls = [("C", s) for s in SHIFTS]
    label = lambda sig, shift: (sig or "null") + (f"{shift:+g}s" if shift else "")  # noqa: E731

    for name in ("chaseEmR", "gourlin", "phillipsL"):
        clock = clocks[name]
        results[name] = {}
        for side in ("bass", "treble"):
            roles = ROLES["licensee"][side]
            env = envelope_of(name, side, clock)
            entry = {"rows": len(env.rows), "free": {}, "fixed": {}, "transferred": {}}
            held_fixed, held_free = {}, {}
            wanted = codings + (controls if name != "chaseEmR" else [("C", -4.0), ("C", 4.0)])
            if name == "phillipsL":
                wanted = codings + [("C", -4.0), ("C", 4.0)]
            for sig, shift in wanted:
                img = image_of(sig, clock, shift)
                fit = free_fit(img, roles, env)
                entry["free"][label(sig, shift)] = describe(fit)
                held_free[label(sig, shift)] = fit.score.held
                if name == "chaseEmR" and sig == "D1" and not shift:
                    results.setdefault("reference_fit", {})[side] = fit
                print(f"{name:9s} {side:6s} free  {label(sig, shift):8s} {describe(fit)}", flush=True)
            if name != "chaseEmR":
                reference = results["reference_fit"][side]
                source = (image_of("D1", clocks["chaseEmR"]), envelope_of("chaseEmR", side, clocks["chaseEmR"]))
                for sig, shift in wanted:
                    img = image_of(sig, clock, shift)
                    s = fixed_fit(reference, img, roles, env)
                    entry["fixed"][label(sig, shift)] = {"cv": round(s.cv, 4), "r2": round(s.r2, 4)}
                    held_fixed[label(sig, shift)] = s.held
                    entry["transferred"][label(sig, shift)] = {k: round(v, 4) for k, v in
                                                               transferred(reference, source, img, roles, env).items()}
                    print(f"{name:9s} {side:6s} fixed {label(sig, shift):8s} {entry['fixed'][label(sig, shift)]} "
                          f"transferred {entry['transferred'][label(sig, shift)]}", flush=True)
            pairs = [("A", "B"), ("B", "C"), ("A", "C"), ("A", "A1"), ("B", "B1"), ("C", "D1")]
            entry["pairwise_free"] = pairwise(env, held_free, pairs)
            if held_fixed:
                entry["pairwise_fixed"] = pairwise(env, held_fixed, pairs)
            best = max((k for k in entry["free"] if k in CANDIDATES), key=lambda k: entry["free"][k]["cv"])
            entry["best_candidate"] = best
            entry["residual_regions"] = residual_regions(env, held_free[best])
            entry["edit_coverage_150mm"] = round(coverage(env, 150.0), 3)
            results[name][side] = entry
    results["reference_parameters"] = {side: describe(fit) for side, fit in results.pop("reference_fit").items()}
    (HERE / "results.json").write_text(json.dumps(results, indent=1))
    print("wrote results.json")


if __name__ == "__main__":
    main()
