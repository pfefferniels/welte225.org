"""B against C on the better placement, with a timing-noise control and a model-free event test.

    python3 followup.py      writes followup.json
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import expr_test as xt

HERE = Path(__file__).resolve().parent
DP = json.loads((HERE.parent / "placed_dp.json").read_text())
BARS = json.loads((HERE.parent / "bars" / "bars.json").read_text())
NAMES = ("chaseEmR", "gourlin", "phillipsL")


def bar_at(mm: float) -> str:
    label = BARS[0]["label"]
    for bar in BARS:
        if bar["from_mm"] <= mm:
            label = bar["label"]
    return label


def dp_clock(name: str) -> xt.Clock:
    """Every note's pitch-sequence placement, made monotone, extended at both ends by the end slopes."""
    tps = xt.ticks_per_second(name)
    points = sorted((n["x_on"], n["on"] / tps) for n in DP[name]["notes"])
    mm = np.array([p[0] for p in points])
    s = np.maximum.accumulate(np.array([p[1] for p in points]))
    keep = np.concatenate([[True], np.diff(mm) > 1e-6])
    mm, s = mm[keep], s[keep]
    head = (s[20] - s[0]) / (mm[20] - mm[0])
    tail = (s[-1] - s[-21]) / (mm[-1] - mm[-21])
    grid_mm = np.concatenate([[mm[0] - 1500], mm, [mm[-1] + 1500]])
    grid_s = np.concatenate([[s[0] - 1500 * head], s, [s[-1] + 1500 * tail]])
    return xt.Clock(grid_mm, grid_s, len(DP[name]["notes"]))


# ------------------------------------------------------------- the fits


def fits_on(name: str, clock: xt.Clock, codings) -> dict:
    out = {}
    for side in ("bass", "treble"):
        roles = xt.ROLES["licensee"][side]
        env = xt.envelope_of(name, side, clock)
        out[side] = {"rows": len(env.rows), "free": {}, "_fits": {}, "_env": env}
        for sig, shift in codings:
            label = (sig or "null") + (f"{shift:+g}s" if shift else "")
            fit = xt.free_fit(xt.image_of(sig, clock, shift), roles, env)
            out[side]["free"][label] = xt.describe(fit)
            out[side]["_fits"][label] = fit
    return out


def transfer(reference: dict, name: str, clock: xt.Clock, chase_clock: xt.Clock, codings) -> dict:
    out = {}
    for side in ("bass", "treble"):
        roles = xt.ROLES["licensee"][side]
        env = xt.envelope_of(name, side, clock)
        ref = reference[side]["_fits"]["D1"]
        source = (xt.image_of("D1", chase_clock), reference[side]["_env"])
        out[side] = {(sig or "null") + (f"{shift:+g}s" if shift else ""):
                     {k: round(v, 4) for k, v in xt.transferred(ref, source, xt.image_of(sig, clock, shift), roles, env).items()}
                     for sig, shift in codings}
    return out


# ------------------------------------------------------- timing noise


def jittered_image(siglum: str, clock: xt.Clock, sigma: float, mode: str, seed: int):
    rng = np.random.default_rng(seed)
    if mode == "smooth":
        periods = np.array([7.0, 13.0, 23.0, 37.0])
        phases = rng.uniform(0, 2 * np.pi, len(periods))
        amps = rng.normal(0, 1, len(periods))
        probe = np.linspace(0, 250, 5000)
        wave = lambda t: np.sum(amps[:, None] * np.sin(2 * np.pi * np.atleast_1d(t)[None, :] / periods[:, None] + phases[:, None]), axis=0)  # noqa: E731
        norm = sigma / np.sqrt(np.mean(wave(probe) ** 2))
        displace = lambda t, _i: float(wave(t)[0] * norm)  # noqa: E731
    else:
        offsets = rng.normal(0, sigma, 4000)
        displace = lambda _t, i: float(offsets[i])  # noqa: E731
    spans = []
    for i, symbol in enumerate(xt.control_symbols(siglum)):
        kind = symbol["expressionType"]
        track = (xt.SOFT_ON if kind == "SoftPedalOn" else xt.SOFT_OFF if kind == "SoftPedalOff"
                 else xt.TRACK.get((kind, symbol["scope"])))
        if track is None:
            continue
        start = float(clock.seconds(symbol["from"]))
        end = max(float(clock.seconds(symbol["to"])), start + 0.005)
        d = displace(start, i)
        spans.append((track, start + d, end + d))
    return xt.wf._image(siglum, xt.NOTES, spans)


def noise_control(clock: xt.Clock) -> list[dict]:
    rows = []
    for side in ("bass", "treble"):
        roles = xt.ROLES["licensee"][side]
        env = xt.envelope_of("chaseEmR", side, clock)
        for mode in ("smooth", "independent"):
            for sigma in (0.1, 0.25, 0.5):
                b_cv, c_cv = [], []
                for seed in range(5):
                    b_cv.append(xt.free_fit(jittered_image("B", clock, sigma, mode, seed), roles, env).score.cv)
                    c_cv.append(xt.free_fit(jittered_image("C", clock, sigma, mode, seed), roles, env).score.cv)
                rows.append({"side": side, "mode": mode, "sigma_s": sigma,
                             "B_cv_mean": round(float(np.mean(b_cv)), 4), "C_cv_mean": round(float(np.mean(c_cv)), 4),
                             "C_minus_B": [round(c - b, 3) for b, c in zip(b_cv, c_cv)]})
                print("noise", rows[-1], flush=True)
    return rows


# ------------------------------------------------------- event test


def crescendo_events(side: str):
    ids = {sig: {s["id"] for s in V["snapshots"][sig]} for sig in ("A", "B", "C")}
    symbols = {s["id"]: s for sig in ("A", "B", "C") for s in V["snapshots"][sig]}

    def off_after(siglum: str, symbol: dict):
        offs = sorted((s["from"] for s in V["snapshots"][siglum]
                       if s["type"] == "expression" and s["expressionType"] == "SlowCrescendoOff"
                       and s["scope"] == side and s["from"] > symbol["from"]))
        return offs[0] if offs else None

    ons = [s for s in symbols.values()
           if s["type"] == "expression" and s["expressionType"] == "SlowCrescendoOn" and s["scope"] == side]
    categories = {
        "C only (added by C)": [(s, off_after("C", s)) for s in ons if s["id"] in ids["C"] and s["id"] not in ids["B"]],
        "B and C (shared)": [(s, off_after("C", s)) for s in ons if s["id"] in ids["C"] and s["id"] in ids["B"]],
        "B only (struck by C)": [(s, off_after("B", s)) for s in ons if s["id"] in ids["B"] and s["id"] not in ids["C"]],
    }
    return categories


V = xt.V


def rise(env: xt.Envelope, t_on: float, t_off: float) -> float | None:
    before = env.velocity[(env.rows >= t_on - 1.5) & (env.rows < t_on)]
    after = env.velocity[(env.rows >= t_off) & (env.rows <= t_off + 1.0)]
    if len(before) == 0 or len(after) == 0:
        return None
    return float(np.median(after) - np.median(before))


def event_test(clocks: dict) -> dict:
    out = {}
    for side in ("bass", "treble"):
        cats = crescendo_events(side)
        out[side] = {}
        for label, events in cats.items():
            entry = {"events": len(events)}
            for name in NAMES:
                env = xt.envelope_of(name, side, clocks[name])
                values = [rise(env, float(clocks[name].seconds(s["from"])), float(clocks[name].seconds(off)))
                          for s, off in events if off is not None]
                values = [v for v in values if v is not None]
                entry[name] = {"n": len(values), "mean": round(float(np.mean(values)), 2) if values else None,
                               "se": round(float(np.std(values) / np.sqrt(len(values))), 2) if len(values) > 1 else None,
                               "positive": int(sum(v > 0 for v in values))}
            out[side][label] = entry
            if label.startswith("C only"):
                entry["places"] = [f"{s['from']:.0f} mm, bar {bar_at(s['from'])}" for s, _ in events]
    return out


def soft_edges(clocks: dict) -> dict:
    edges = sorted((s["from"], s["expressionType"]) for s in V["snapshots"]["C"]
                   if s["type"] == "expression" and s["expressionType"].startswith("SoftPedal"))
    out = {}
    for name in NAMES:
        tps = xt.ticks_per_second(name)
        onsets = np.array([n["on"] / tps for n in xt.E[name]["notes"]])
        vel = np.array([n["vel"] for n in xt.E[name]["notes"]], dtype=float)
        rows = []
        for mm, kind in edges:
            t = float(clocks[name].seconds(mm))
            before = vel[(onsets >= t - 2.0) & (onsets < t)]
            after = vel[(onsets >= t + 0.35) & (onsets < t + 2.35)]
            if len(before) and len(after):
                rows.append({"mm": round(mm), "bar": bar_at(mm), "kind": kind,
                             "ratio": round(float(np.median(after) / np.median(before)), 3)})
        out[name] = rows
    return out


def divergence_by_bar(side_fits: dict, threshold: float = 1.0) -> list[dict]:
    env = side_fits["_env"]
    hb, hc = side_fits["_fits"]["B"].score.held, side_fits["_fits"]["C"].score.held
    where = np.abs(hb - hc) > threshold
    rows = []
    for i in np.flatnonzero(where):
        rows.append({"mm": round(float(env.mm[i])), "bar": bar_at(float(env.mm[i])),
                     "velocity": env.velocity[i], "B": round(float(hb[i]), 1), "C": round(float(hc[i]), 1),
                     "closer": "B" if abs(env.velocity[i] - hb[i]) < abs(env.velocity[i] - hc[i]) else "C"})
    return rows


def main() -> None:
    clocks = {name: dp_clock(name) for name in NAMES}
    old = xt.clock_of("gourlin")
    places = np.array([s["from"] for s in V["snapshots"]["C"] if s["type"] == "expression"])
    shift_old_new = old.seconds(places) - clocks["gourlin"].seconds(places)
    results = {"gourlin_clock_change_s": {"rms": round(float(np.sqrt(np.mean(shift_old_new ** 2))), 3),
                                          "max": round(float(np.max(np.abs(shift_old_new))), 3)}}
    print(results, flush=True)

    codings = [(c, 0.0) for c in xt.CANDIDATES] + [(None, 0.0)] + [("C", s) for s in (-4.0, -2.0, -1.0, 1.0, 2.0, 4.0)]
    fits = {name: fits_on(name, clocks[name], codings) for name in NAMES}
    for name in NAMES:
        for side in ("bass", "treble"):
            print(name, side, {k: v["cv"] for k, v in fits[name][side]["free"].items()}, flush=True)
    results["free"] = {name: {side: {"rows": fits[name][side]["rows"], "free": fits[name][side]["free"]}
                              for side in ("bass", "treble")} for name in NAMES}
    results["transferred"] = {name: transfer(fits["chaseEmR"], name, clocks[name], clocks["chaseEmR"], codings)
                              for name in ("gourlin", "phillipsL")}
    results["divergence_B_C"] = {name: {side: divergence_by_bar(fits[name][side]) for side in ("bass", "treble")}
                                 for name in NAMES}
    results["events"] = event_test(clocks)
    print(json.dumps(results["events"], indent=1), flush=True)
    results["soft_edges"] = soft_edges(clocks)
    print(json.dumps(results["soft_edges"]), flush=True)
    results["noise_control_chase"] = noise_control(clocks["chaseEmR"])
    (HERE / "followup.json").write_text(json.dumps(results, indent=1, default=float))
    print("wrote followup.json")


if __name__ == "__main__":
    main()
