"""Whose una corda pattern the velocities follow in bars 8′–15: B's, the Widuch copy's (A1), or the data's A.

The crescendo coding is held at the file's context (B for Gourlin, C for the controls);
only the soft-pedal commands are exchanged. Each coding gets its own soft factor from a
grid, and the dynamics are refitted freely. A parametric bootstrap on each file's model,
with the Trachtman engine's attenuation from Chase's file where a file's own fit gives
none, states how well the design could tell the patterns apart at all.

    python3 soft_test.py      writes soft_test.json
"""

from __future__ import annotations

import json

import numpy as np

import ablation as ab

WINDOW = (5300.0, 6750.0)
FILES = {"chaseEmR": "C", "phillipsR": "C", "gourlin": "B"}


def soft_symbols(siglum: str) -> dict:
    return {k: s for k, s in ab.SNAP[siglum].items()
            if s["type"] == "expression" and s["expressionType"].startswith("SoftPedal")}


def coding(context: str, soft_from: str | None) -> dict:
    keep = {k: s for k, s in ab.SNAP[context].items()
            if not (s["type"] == "expression" and s["expressionType"].startswith("SoftPedal"))}
    if soft_from:
        keep.update(soft_symbols(soft_from))
    return keep


def describe_patterns() -> dict:
    return {sig: [(s["expressionType"].replace("SoftPedal", ""), round(s["from"], 1), ab.bar_at(s["from"]))
                  for s in sorted(soft_symbols(sig).values(), key=lambda s: s["from"])] for sig in ("A", "A1", "B", "C")}


def main() -> None:
    rng = np.random.default_rng(11)
    out = {"patterns": describe_patterns(), "files": {}}
    chase_soft = None
    for name, context in FILES.items():
        entry = out["files"][name] = {}
        levels = {}
        for side in ("bass", "treble"):
            clock = ab.fu.dp_clock(name)
            env = ab.xt.envelope_of(name, side, clock)
            roles = ab.xt.ROLES["licensee"][side]
            window = (env.mm >= WINDOW[0]) & (env.mm <= WINDOW[1])
            fits = {}
            for label, soft_from in (("B pattern", "B"), ("Widuch pattern (A1)", "A1"), ("data A", "A"), ("no soft pedal", None)):
                image = ab.image_of(coding(context, soft_from).values(), clock)
                fit = ab.xt.free_fit(image, roles, env)
                level = ab.xt.level_of(fit.model, image, roles, env.rows)
                soft = ab.xt.soft_state(image, env.rows)
                best = min(((s, ab.xt.score(level, env.velocity, soft, "linear", s)) for s in ab.SOFT_GRID),
                           key=lambda p: -p[1].cv)
                held = best[1].held
                fits[label] = {"cv_whole": round(best[1].cv, 4), "soft_factor": round(best[0], 3),
                               "sse_window": round(float(np.sum((env.velocity[window] - held[window]) ** 2)), 2),
                               "rows_window": int(window.sum()), "soft_rows_on": int(soft[window].sum())}
                levels[(side, label)] = (fit, level, soft, env, window)
            base = fits["B pattern"]["sse_window"]
            sigma2 = float(np.mean((env.velocity - ab.xt.score(levels[(side, "B pattern")][1], env.velocity,
                                                                levels[(side, "B pattern")][2], "linear",
                                                                fits["B pattern"]["soft_factor"]).held) ** 2))
            for label in fits:
                fits[label]["gain_over_B_window"] = round((base - fits[label]["sse_window"]) / (2 * sigma2), 3)
            entry[side] = fits
            print(name, side, json.dumps(fits), flush=True)
        if name == "chaseEmR":
            chase_soft = max(entry[s]["B pattern"]["soft_factor"] for s in ("bass", "treble"))
        # the design's power to tell B's pattern from the Widuch pattern on this file's own model
        power = {}
        for side in ("bass", "treble"):
            fitB, levelB, softB, env, window = levels[(side, "B pattern")]
            _, levelW, softW, _, _ = levels[(side, "Widuch pattern (A1)")]
            s_true = entry[side]["B pattern"]["soft_factor"] or chase_soft or 1 / 9
            residual = env.velocity - ab.xt.score(levelB, env.velocity, softB, "linear", s_true).held
            output = ab.xt.ef._fit_output(levelB, env.velocity / (1 - s_true * softB), "linear")
            n = len(env.rows)
            sigma2 = float(np.mean(residual ** 2))

            def window_gain(velocity):
                sse = lambda lv, sf: min(float(np.sum((velocity[window] - ab.xt.score(lv, velocity, sf, "linear", s).held[window]) ** 2))
                                         for s in ab.SOFT_GRID)  # noqa: E731
                return (sse(levelB, softB) - sse(levelW, softW)) / (2 * sigma2)

            sims = {}
            for truth, (lv, sf) in (("B", (levelB, softB)), ("Widuch", (levelW, softW))):
                vals = []
                for _ in range(40):
                    noise = np.concatenate([residual[i:i + 8] for i in rng.integers(0, n - 8, n // 8 + 1)])[:n]
                    vals.append(window_gain(output(lv) * (1 - s_true * sf) + noise))
                sims[truth] = np.array(vals)
            critical = float(np.percentile(sims["B"], 95))
            power[side] = {"assumed_soft_factor": round(s_true, 3), "critical_gain_for_Widuch": round(critical, 3),
                           "power_if_Widuch": round(float(np.mean(sims["Widuch"] > critical)), 2),
                           "gain_if_B_median": round(float(np.median(sims["B"])), 3),
                           "gain_if_Widuch_median": round(float(np.median(sims["Widuch"])), 3),
                           "observed_gain_Widuch_over_B": entry[side]["Widuch pattern (A1)"]["gain_over_B_window"]}
        entry["design_power"] = power
        print(name, "power", json.dumps(power), flush=True)
    (ab.HERE / "soft_test.json").write_text(json.dumps(out, indent=1, default=float))
    print(json.dumps(out["patterns"], indent=0))


if __name__ == "__main__":
    main()
