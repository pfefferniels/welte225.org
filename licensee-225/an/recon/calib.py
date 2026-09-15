"""Power-calibrated presence of each edit: the observed log-likelihood ratio over the one expected if present."""
import json, collections
import numpy as np
from recon import *
from summarize import group

bars = json.load(open("../bars/bars.json"))
bar_of = lambda x: ([b["label"] for b in bars if b["from_mm"] <= x] or ["up"])[-1]


def evidence(reg, with_syms, without_syms, sigma):
    rw, ro = reg.residuals(with_syms), reg.residuals(without_syms)
    delta = ro - rw                      # prediction difference at the next note
    E = float(np.sum(delta ** 2) / (2 * sigma ** 2))
    L = float(np.sum(ro ** 2 - rw ** 2) / (2 * sigma ** 2))
    return L, E


def run(name):
    ctx = TRUTH.get(name, "C")
    clock, regs = study(name, [s for s in expression(ctx) if s["expressionType"].startswith("SoftPedal")])
    sig_v = {sc: sigma_of(r, ctx) for sc, r in regs.items()}
    rows = []
    for sig, e in edits_to_test():
        syms = [s for s in e["insert"]] + [SYM[d] for d in e["delete"] if d in SYM]
        ex = [s for s in syms if s["type"] == "expression"]
        if any(s["expressionType"].startswith("SoftPedal") for s in ex): continue
        scopes = sorted({s["scope"] for s in ex})
        L = E = 0.0; Lb = Eb = 0.0
        for scope in scopes:
            l, en = evidence(regs[scope], expression(sig), undone(sig, e), sig_v[scope]); L += l; E += en
            if sig == "C" and e["insert"] and not e["delete"]:
                ins = [s for s in e["insert"] if s["type"] == "expression"]
                l, en = evidence(regs[scope], expression("B") + ins, expression("B"), sig_v[scope]); Lb += l; Eb += en
        rows.append({"group": group(kind_of(sig, e)), "at": min(s["from"] for s in ex), "L": L, "E": E, "Lb": Lb, "Eb": Eb, "edit": e["@id"] if "@id" in e else None,
                     "types": [(s["expressionType"], s["scope"], round(s["from"], 1), "".join(s.get("witnesses", []))) for s in ex]})
    return rows


results = {name: run(name) for name in ("chaseEmR", "phillipsR", "gourlin", "phillipsL")}
json.dump(results, open("calib.json", "w"), indent=1)

def agg(rows, key_L="L", key_E="E", minE=0.5):
    use = [r for r in rows if r[key_E] >= minE]
    if not use: return (0, float("nan"), float("nan"), float("nan"))
    L = np.array([r[key_L] for r in use]); E = np.array([r[key_E] for r in use])
    z = L / E
    return (len(use), float(L.sum() / E.sum()), float(np.sqrt(2 / E.sum())), float(np.median(z)))

print("group | control chaseEmR z (n, pooled, se, median) | phillipsR | gourlin | phillipsL   [z ≈ +1 present, −1 absent; only edits whose expected evidence E ≥ 0.5]")
names = ("chaseEmR", "phillipsR", "gourlin", "phillipsL")
groups = sorted({r["group"] for r in results["gourlin"]})
for g in groups:
    cells = []
    for n in names:
        k, pooled, se, med = agg([r for r in results[n] if r["group"] == g])
        cells.append(f"{k:2d} {pooled:+5.2f}±{se:4.2f} m{med:+5.2f}" if k else "  –")
    print(f"{g:<34} | " + " | ".join(cells))
print("\nC additions in B context (pooled z):")
for g in [x for x in groups if x.startswith("C ") and x != "C removals"]:
    cells = []
    for n in names:
        k, pooled, se, med = agg([r for r in results[n] if r["group"] == g], "Lb", "Eb")
        cells.append(f"{k:2d} {pooled:+5.2f}±{se:4.2f} m{med:+5.2f}" if k else "  –")
    print(f"{g:<34} | " + " | ".join(cells))

# dispersion of z on controls for present edits (C and B groups), to calibrate the standard errors
for n in ("chaseEmR", "phillipsR"):
    z = np.array([r["L"] / r["E"] for r in results[n] if r["E"] >= 2 and r["group"].startswith(("C ", "B "))])
    print(f"{n}: z of B and C edits with E ≥ 2: n {len(z)}, median {np.median(z):+.2f}, IQR {np.percentile(z,25):+.2f}–{np.percentile(z,75):+.2f}, share > 0: {np.mean(z > 0):.2f}")
for n in ("gourlin", "phillipsL"):
    for grp in ("C", "B"):
        z = np.array([r["L"] / r["E"] for r in results[n] if r["E"] >= 2 and r["group"].startswith(grp + " ") and r["group"] != "C removals"])
        if len(z): print(f"{n}: z of {grp} edits with E ≥ 2: n {len(z)}, median {np.median(z):+.2f}, IQR {np.percentile(z,25):+.2f}–{np.percentile(z,75):+.2f}, share > 0: {np.mean(z > 0):.2f}")

print("\nC single commands, in detail (L/E per file):")
for i, r in enumerate(results["gourlin"]):
    if r["group"] != "C single commands": continue
    vals = " ".join(f"{results[n][i]['L']:+7.1f}/{results[n][i]['E']:5.1f}" for n in names)
    print(f"  bar {bar_of(r['at']):>3} {vals}  {r['types']}")
