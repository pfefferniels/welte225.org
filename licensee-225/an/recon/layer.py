import json, collections
import numpy as np
from recon import *

bars = json.load(open("../bars/bars.json"))
bar_of = lambda x: ([b["label"] for b in bars if b["from_mm"] <= x] or ["up"])[-1]
placed = json.load(open("../placed_dp.json"))
out = {}

def soft_variant(base_sig, pattern):
    """base coding with its soft pedal replaced by another version's soft pedal, or none."""
    rest = [s for s in expression(base_sig) if not s["expressionType"].startswith("SoftPedal")]
    if pattern is None: return rest
    return rest + [s for s in expression(pattern) if s["expressionType"].startswith("SoftPedal")]

for name in ("chaseEmR", "phillipsR", "gourlin", "phillipsL"):
    ctx = TRUTH.get(name, "C")
    res = {}
    # 1. C's additions tested in B's context: B plus the edit against B
    clock, regs = study(name, soft_variant(ctx, ctx) and [s for s in expression(ctx) if s["expressionType"].startswith("SoftPedal")])
    sig_v = {sc: sigma_of(r, ctx) for sc, r in regs.items()}
    rows = []
    for e in VERSIONS["C"]["edits"]:
        if not e["insert"] or e["delete"]: continue
        ins = [s for s in e["insert"] if s["type"] == "expression"]
        if not ins: continue
        scope = ins[0]["scope"]
        val, eff, span = llr(regs[scope], expression("B") + ins, expression("B"), sig_v[scope])
        rows.append((round(min(s["from"] for s in ins), 1), scope, round(val, 2)))
    l = np.array([r[2] for r in rows])
    res["C_in_B_context"] = {"n": len(rows), "present": int((l > 2).sum()), "absent": int((l < -2).sum()), "sum": round(float(l.sum()), 1), "rows": rows}
    print(f"{name}: C additions in B context: n {len(rows)}, present {int((l > 2).sum())}, absent {int((l < -2).sum())}, ambiguous {int((np.abs(l) <= 2).sum())}, summed LLR {l.sum():.1f}", flush=True)

    # 2. soft pedal pattern: C's (= B's), A1's (Widuch), none; both registers, whole roll and bars 8'-15
    soft_scores = {}
    for label, pattern in (("C/B soft", "C"), ("A1 soft", "A1"), ("no soft", None)):
        total, local = 0.0, 0.0
        for scope, reg in regs.items():
            reg.set_soft([s for s in expression(pattern)] if pattern else [])
            reg_syms = soft_variant("B" if name in ("gourlin", "phillipsL") else ctx, pattern)
            r = reg.residuals(reg_syms)
            mm = reg.clock.millimetres(reg.t[1:])
            w = (mm > 5200) & (mm < 6750)
            total += float(np.sum(r ** 2) / (2 * sig_v[scope] ** 2)); local += float(np.sum(r[w] ** 2) / (2 * sig_v[scope] ** 2))
        soft_scores[label] = (round(total, 1), round(local, 1))
    for reg in regs.values():
        reg.set_soft([s for s in expression(ctx) if s["expressionType"].startswith("SoftPedal")])
    res["soft"] = soft_scores
    print(f"{name}: soft-pedal pattern, negative log-likelihood whole / bars 8'-15: {soft_scores}", flush=True)

    # 3. Licensee layer: intervals the best-fitting version leaves unexplained
    if name in ("gourlin", "phillipsL"):
        layer = []
        for scope, reg in regs.items():
            for sig in ("B", "C"):
                r = reg.residuals(expression(sig))
                mm0 = reg.clock.millimetres(reg.t[:-1]); mm1 = reg.clock.millimetres(reg.t[1:])
                for k in np.where(np.abs(r) > 3 * sig_v[scope])[0]:
                    layer.append({"scope": scope, "sig": sig, "from": round(float(mm0[k]), 1), "to": round(float(mm1[k]), 1), "resid": round(float(r[k]), 2)})
        res["layer"] = layer
    out[name] = res

# intervals unexplained by both B and C, in both copies, within 30 mm
def unexplained(name):
    L = out[name]["layer"]
    keyed = collections.defaultdict(dict)
    for x in L: keyed[(x["scope"], x["from"], x["to"])][x["sig"]] = x["resid"]
    return [(sc, a, b, d) for (sc, a, b), d in keyed.items() if "B" in d and "C" in d]
G, P = unexplained("gourlin"), unexplained("phillipsL")
both = [(sc, a, b, d) for sc, a, b, d in G if any(sc == sc2 and abs(a - a2) < 30 and abs(b - b2) < 30 and np.sign(list(d.values())[0]) == np.sign(list(d2.values())[0]) for sc2, a2, b2, d2 in P)]
peds = placed["gourlin"]["pedal"]
print(f"\nLicensee layer: intervals unexplained by B and by C (|resid| > 3 sigma): Gourlin {len(G)}, Phillips {len(P)}, shared in both copies {len(both)}")
for sc, a, b, d in sorted(both, key=lambda x: x[1]):
    near_pedal = [f"{p['kind']}@{p['at']:.0f}" for p in peds if a - 30 <= p["at"] <= b + 30]
    print(f"  {sc:6} bar {bar_of(a):>3}–{bar_of(b):<3} {a:7.1f}–{b:7.1f}  resid(B) {d['B']:+.1f} resid(C) {d['C']:+.1f}  pedal nearby {near_pedal}")
json.dump(out, open("layer.json", "w"), indent=1)
