"""Two focused questions the per-group ablation cannot answer alone.

1. The six treble crescendo commands C removed: which of B's additions made them
   redundant, and does each file carry those additions (A's state there) or not?
2. H5′: where the Licensee pair departs from B, do the departures sit on C's loci
   (C's edits present, or re-coded there) or on the pair's own editorial loci?

    python3 loci.py      writes loci.json
"""

from __future__ import annotations

import json

import numpy as np

import ablation as ab

FILES = ("chaseEmR", "phillipsR", "gourlin", "phillipsL")

#: The pair's own note and pedal edits, from the collation (an/findings.md), in edition mm.
PAIR_OWN = (1751, 2076, 2073, 2244, 2588, 2659, 2666, 2680, 2842, 2865, 3110, 3286, 3329, 3340, 3474,
            3588, 3661, 3682, 4205, 4604, 4625, 5542, 5593, 5756, 5923, 6077, 6521, 6611, 6737, 6795,
            7111, 7133, 7142, 7526, 7549, 8087, 8123, 8562, 8588, 8767, 8922, 9089, 9421, 9524, 9675, 9987)


# ------------------------------------------------ the thinned treble crescendo


def latch_history(snapshot: dict, family: str, scope: str):
    seq = sorted((s["from"], s["expressionType"].endswith("On"), s["id"]) for s in snapshot.values()
                 if s["type"] == "expression" and s["expressionType"].startswith(family) and s["scope"] == scope)
    state, setter, out = False, None, {}
    for at, on, ident in seq:
        out[ident] = {"effective": on != state, "state_before": state, "set_by": setter}
        if on != state:
            state, setter = on, ident
    return out


def thinned_locus() -> dict:
    c_edits = ab.edits_of("C")
    thinning = next(e for e in c_edits if len(e.deletes) == 6)
    history = {sig: latch_history(ab.SNAP[sig], "SlowCrescendo", "treble") for sig in ("A", "B", "A1", "B1")}
    inserted_in_b = {s["id"]: e for e in ab.edits_of("B") for s in e.inserts}
    rows, causes = [], {}
    for s in sorted(thinning.deletes, key=lambda s: s["from"]):
        entry = {"at": round(s["from"], 1), "bar": ab.bar_at(s["from"]), "type": s["expressionType"],
                 "witnesses": s["witnesses"], "home": s["home"]}
        for sig in ("A", "B", "A1"):
            h = history[sig].get(s["id"])
            entry[f"effective_in_{sig}"] = None if h is None else h["effective"]
        hb = history["B"].get(s["id"])
        if hb and not hb["effective"] and hb["set_by"] in inserted_in_b:
            cause = inserted_in_b[hb["set_by"]]
            causes[cause.ident] = cause
            setter = ab.SNAP["B"][hb["set_by"]]
            entry["made_redundant_by"] = {"B_edit": cause.ident, "kind": cause.kind,
                                          "command": setter["expressionType"], "at": round(setter["from"], 1),
                                          "witnesses": setter["witnesses"]}
        rows.append(entry)
    return {"commands": rows, "causes": list(causes.values()), "thinning": thinning}


def focused(name: str, rng, locus: dict) -> dict:
    out = {}
    causes = ab.Group("B", "treble", locus["causes"], label="B additions that make C's thinned commands redundant")
    thinning = ab.Group("C", "treble", [locus["thinning"]], label="C's removal of the six commands")
    for context_sig in ("B", "C"):
        side = ab.fit_side(name, "treble", ab.SNAP[context_sig])
        res = {}
        if causes.edits:
            prepared = ab.prepare(side, ab.SNAP[context_sig], causes)
            real = ab.gain(side, prepared, side.env.velocity)
            cal = ab.calibrate(side, prepared, rng)
            res["B_causes"] = {"rows": int(prepared["rows"].sum()), "gain": round(real, 3), **cal,
                               "verdict": ab.verdict(real, cal), "precision_mm": ab.precision_mm(side, causes, prepared)}
            # with B's causes reverted the six commands act again; does C's removal then matter?
            local_a = ab.without_group(ab.SNAP[context_sig], causes)
            local_a.update({s["id"]: s for s in locus["thinning"].deletes})
            prepared = ab.prepare(side, local_a, thinning)
            real = ab.gain(side, prepared, side.env.velocity)
            cal = ab.calibrate(side, prepared, rng)
            res["C_removal_in_A_state"] = {"rows": int(prepared["rows"].sum()), "gain": round(real, 3), **cal,
                                           "verdict": ab.verdict(real, cal)}
        out[context_sig] = res
    return out


# ------------------------------------------------------------------ H5′


def concentration(name: str, side_name: str, context_sig: str, windows: dict, rng, draws: int = 1000) -> dict:
    side = ab.fit_side(name, side_name, ab.SNAP[context_sig])
    r2 = side.residual ** 2
    out = {}
    for label, mask in windows.items():
        if mask.sum() == 0:
            out[label] = {"rows": 0}
            continue
        t = float(r2[mask].mean() / r2.mean())
        null = np.array([r2[np.roll(mask, int(k))].mean() / r2.mean() for k in rng.integers(20, len(mask) - 20, draws)])
        out[label] = {"rows": int(mask.sum()), "ratio": round(t, 2), "p": round(float(np.mean(null >= t)), 3)}
    return out


def c_windows(name: str, side_name: str) -> tuple[np.ndarray, np.ndarray, float]:
    """Rows where B plus a C group differs from B, and the correlation of B's residual with C's predicted change."""
    side = ab.fit_side(name, side_name, ab.SNAP["B"])
    mask = np.zeros(len(side.env.rows), bool)
    direction = np.zeros(len(side.env.rows))
    for g in (g for g in ab.groups_of("C") if g.scope == side_name):
        prepared = ab.prepare(side, ab.SNAP["B"], g)
        mask |= prepared["rows"]
        with_c = ab.xt.score(*prepared["variants"][0.0], side.env.velocity, "linear", side.soft).held
        plain = ab.xt.score(*prepared["plain"], side.env.velocity, "linear", side.soft).held
        direction = np.where(prepared["rows"], with_c - plain, direction)
    rho = float(np.corrcoef(side.residual[mask], direction[mask])[0, 1]) if mask.sum() > 3 else float("nan")
    return mask, direction, rho


def own_windows(name: str, side_name: str, radius: float = 60.0) -> np.ndarray:
    env = ab.xt.envelope_of(name, side_name, ab.fu.dp_clock(name))
    return np.any(np.abs(env.mm[:, None] - np.array(PAIR_OWN)[None, :]) <= radius, axis=1)


def b_windows(name: str, side_name: str) -> np.ndarray:
    side = ab.fit_side(name, side_name, ab.SNAP["B"])
    mask = np.zeros(len(side.env.rows), bool)
    for g in (g for g in ab.groups_of("B") if g.scope == side_name):
        mask |= ab.prepare(side, ab.SNAP["B"], g)["rows"]
    return mask


def main() -> None:
    rng = np.random.default_rng(3)
    locus = thinned_locus()
    result = {"thinned_commands": locus["commands"],
              "causes": [{"edit": e.ident, "kind": e.kind, "at": round(e.at, 1), "bar": ab.bar_at(e.at),
                          "inserts": [(s["expressionType"], round(s["from"], 1), s["witnesses"]) for s in e.inserts]}
                         for e in locus["causes"]]}
    print(json.dumps(result, indent=1), flush=True)
    result["focused"] = {name: focused(name, rng, locus) for name in FILES}
    print(json.dumps(result["focused"], indent=1, default=float), flush=True)
    result["h5_prime"] = {}
    for name in FILES:
        for side_name in ("bass", "treble"):
            mask_c, _, rho = c_windows(name, side_name)
            windows = {"C loci": mask_c, "B loci": b_windows(name, side_name),
                       "pair's own note and pedal edits": own_windows(name, side_name),
                       "C loci outside the pair's own edits": mask_c & ~own_windows(name, side_name)}
            entry = {"residual_under_B_vs_C_prediction_rho": round(rho, 3),
                     "under_B": concentration(name, side_name, "B", windows, rng),
                     "under_C": concentration(name, side_name, "C", windows, rng)}
            result["h5_prime"].setdefault(name, {})[side_name] = entry
            print(name, side_name, json.dumps(entry), flush=True)
    (ab.HERE / "loci.json").write_text(json.dumps(result, indent=1, default=float))
    print("wrote loci.json")


if __name__ == "__main__":
    main()
