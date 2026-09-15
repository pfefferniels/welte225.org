import json, collections
import numpy as np
from recon import *

bars = json.load(open("../bars/bars.json"))
bar_of = lambda x: ([b["label"] for b in bars if b["from_mm"] <= x] or ["up"])[-1]
soft_of = lambda sig: [s for s in expression(sig) if s["expressionType"].startswith("SoftPedal")]
no_soft = lambda syms: [s for s in syms if not s["expressionType"].startswith("SoftPedal")]
dyn = lambda syms: [s for s in syms if s["type"] == "expression" and s["expressionType"].startswith(("SlowCrescendo", "Forzando"))]


def sigma_safe(reg, syms):
    r = reg.residuals(syms)
    mad = 1.4826 * np.median(np.abs(r - np.median(r)))
    return float(max(mad, 0.5 * np.std(r), 0.25))


def z_of(L, E): return L / E if E > 0 else float("nan")


class Context:
    def __init__(self, name, ctx_sig, soft_sig):
        self.name = name
        self.clock, self.regs = study(name, soft_of(soft_sig))
        self.base = no_soft(expression(ctx_sig)) + soft_of(soft_sig)
        self.ids = {s["id"] for s in self.base}
        self.sigma = {sc: sigma_safe(r, self.base) for sc, r in self.regs.items()}

    def test(self, with_syms, without_syms, scopes):
        L = E = 0.0
        for sc in scopes:
            rw, ro = self.regs[sc].residuals(with_syms), self.regs[sc].residuals(without_syms)
            L += float(np.sum(ro ** 2 - rw ** 2) / (2 * self.sigma[sc] ** 2)); E += float(np.sum((ro - rw) ** 2) / (2 * self.sigma[sc] ** 2))
        return L, E

    def presence(self, syms):
        """Evidence that the context should carry these symbols: with them against without, whichever the context has."""
        ids = {s["id"] for s in syms}
        without = [s for s in self.base if s["id"] not in ids]
        return self.test(without + syms, without, sorted({s["scope"] for s in syms}))


def c_units():
    """C's additions as musical units: a pair edit stays whole; single On/Off halves are joined with their partner."""
    units = []
    singles = []
    for e in VERSIONS["C"]["edits"]:
        ins = dyn(e["insert"])
        if not ins or e["delete"]: continue
        if len(ins) >= 2: units.append((("forzando pair" if "Forzando" in ins[0]["expressionType"] else f"{ins[0]['scope']} pair" + (" Mittelstimmen" if (e.get("motivation") or "").startswith("426a") else "")), ins))
        else: singles.append(ins[0])
    singles.sort(key=lambda s: (s["scope"], s["from"]))
    used = set()
    for i, s in enumerate(singles):
        if i in used: continue
        partner = next((j for j in range(i + 1, len(singles)) if j not in used and singles[j]["scope"] == s["scope"] and singles[j]["from"] - s["from"] < 60), None)
        if partner is not None:
            used |= {i, partner}; units.append((f"{s['scope']} joined halves", [s, singles[partner]]))
        else:
            used.add(i); units.append((f"{s['scope']} lone single", [s]))
    return units


def b_edits():
    out = []
    for e in VERSIONS["B"]["edits"]:
        ins = dyn(e["insert"])
        if not ins: continue
        restored = [SYM[d] for d in e["delete"] if d in SYM and d in SNAP_IDS["A"] and SYM[d]["type"] == "expression" and SYM[d]["expressionType"].startswith(("SlowCrescendo", "Forzando"))]
        out.append((e, ins, restored))
    return out


def removal(ctx, ins, restored):
    """Evidence for a B edit already in the context: context against context with the edit reversed."""
    ids = {s["id"] for s in ins}
    if not ids <= ctx.ids: return float("nan"), 0.0
    without = [s for s in ctx.base if s["id"] not in ids] + restored
    return ctx.test(ctx.base, without, sorted({s["scope"] for s in ins + restored}))


contexts = {
    "chaseEmR@B": Context("chaseEmR", "B", "C"), "phillipsR@B": Context("phillipsR", "B", "C"),
    "chaseEmR@C": Context("chaseEmR", "C", "C"), "phillipsR@C": Context("phillipsR", "C", "C"),
    "gourlin@B/softA": Context("gourlin", "B", "A1"), "phillipsL@B/softA": Context("phillipsL", "B", "A1"),
}
names_c = ["chaseEmR@B", "phillipsR@B", "gourlin@B/softA", "phillipsL@B/softA"]

def pool(vals):
    use = [(l, e) for l, e in vals if e >= 0.5 and np.isfinite(l)]
    if not use: return "  –"
    L = sum(l for l, _ in use); E = sum(e for _, e in use)
    return f"{len(use):2d} {L / E:+5.2f}±{np.sqrt(2 / E):4.2f} m{np.median([l / e for l, e in use]):+5.2f}"

print("[A] C additions as units, tested by adding them to B (controls should be ≈ +1)")
units = c_units()
res_c = {n: [contexts[n].presence(syms) for _, syms in units] for n in names_c}
for g in sorted({g for g, _ in units}):
    idx = [i for i, (gg, _) in enumerate(units) if gg == g]
    print(f"  {g:<26} | " + " | ".join(f"{n}: {pool([res_c[n][i] for i in idx])}" for n in names_c))
print("  C units the pair seems to carry (z > +0.5 with E ≥ 1.5 in both copies):")
for i, (g, syms) in enumerate(units):
    zg = z_of(*res_c["gourlin@B/softA"][i]); zp = z_of(*res_c["phillipsL@B/softA"][i])
    if res_c["gourlin@B/softA"][i][1] >= 1.5 and res_c["phillipsL@B/softA"][i][1] >= 1.5 and zg > 0.5 and zp > 0.5:
        print(f"    bar {bar_of(syms[0]['from']):>3} {g:<22} {[(s['expressionType'], round(s['from'], 1)) for s in syms]} z G {zg:+.2f} (E {res_c['gourlin@B/softA'][i][1]:.1f}) P {zp:+.2f} (E {res_c['phillipsL@B/softA'][i][1]:.1f}); controls z {z_of(*res_c['chaseEmR@B'][i]):+.2f} {z_of(*res_c['phillipsR@B'][i]):+.2f}")
print("  C units the pair lacks with power (z < −0.5, E ≥ 1.5 in at least one copy, not > +0.5 in the other):")
lack = 0
for i, (g, syms) in enumerate(units):
    rg, rp = res_c["gourlin@B/softA"][i], res_c["phillipsL@B/softA"][i]
    if (rg[1] >= 1.5 and z_of(*rg) < -0.5 and not (rp[1] >= 1.5 and z_of(*rp) > 0.5)) or (rp[1] >= 1.5 and z_of(*rp) < -0.5 and not (rg[1] >= 1.5 and z_of(*rg) > 0.5)):
        lack += 1
print(f"    {lack} of {len(units)} units")

print("\n[B] A1 and B1 readings added to the context (controls in C should be ≈ −1)")
for sig in ("A1", "B1"):
    syms_list = [dyn(e["insert"]) for e in VERSIONS[sig]["edits"] if dyn(e["insert"]) and not e["delete"]]
    cells = []
    for n in ("chaseEmR@C", "phillipsR@C", "gourlin@B/softA", "phillipsL@B/softA"):
        cells.append(f"{n}: {pool([contexts[n].presence(s) for s in syms_list])}")
    print(f"  {sig} readings ({len(syms_list)}) | " + " | ".join(cells))

print("\n[C] B's edits, tested by reversing them in the context (controls in C should be ≈ +1)")
bed = b_edits()
res_b = {n: [removal(contexts[n], ins, rest) for _, ins, rest in bed] for n in ("chaseEmR@C", "phillipsR@C", "gourlin@B/softA", "phillipsL@B/softA")}
for label, pick in (("additions bass", lambda e, ins: not e["delete"] and all(s["scope"] == "bass" for s in ins)), ("additions treble", lambda e, ins: not e["delete"] and any(s["scope"] == "treble" for s in ins)),
                    ("shifts bass", lambda e, ins: e["delete"] and all(s["scope"] == "bass" for s in ins)), ("shifts treble", lambda e, ins: e["delete"] and any(s["scope"] == "treble" for s in ins))):
    idx = [i for i, (e, ins, _) in enumerate(bed) if pick(e, ins)]
    print(f"  B {label:<16} | " + " | ".join(f"{n}: {pool([res_b[n][i] for i in idx])}" for n in res_b))
print("  B edits the pair seems to lack (z < −0.5 with E ≥ 1.5 in both copies):")
for i, (e, ins, rest) in enumerate(bed):
    rg, rp = res_b["gourlin@B/softA"][i], res_b["phillipsL@B/softA"][i]
    if rg[1] >= 1.5 and rp[1] >= 1.5 and z_of(*rg) < -0.5 and z_of(*rp) < -0.5:
        print(f"    bar {bar_of(ins[0]['from']):>3} {e.get('motivation')} {[(s['expressionType'], s['scope'], round(s['from'], 1)) for s in ins]} restored {[(s['expressionType'], round(s['from'], 1)) for s in rest]} z G {z_of(*rg):+.2f} P {z_of(*rp):+.2f}; controls {z_of(*res_b['chaseEmR@C'][i]):+.2f} {z_of(*res_b['phillipsR@C'][i]):+.2f}")
print("  B edits with power in at least one copy, share with z > 0:", {n: f"{np.mean([z_of(*r) > 0 for r in res_b[n] if r[1] >= 1.5]):.2f} of {sum(1 for r in res_b[n] if r[1] >= 1.5)}" for n in res_b})

print("\n[D] C's thinned treble commands and the B edits that made them redundant")
thin = next(e for e in VERSIONS["C"]["edits"] if e.get("motivation") == "treble-crescendo-thinned")
deleted = [SYM[d] for d in thin["delete"] if d in SYM]
def state_before(syms, at, exclude):
    cmds = sorted([(s["from"], s["expressionType"]) for s in syms if s.get("scope") == "treble" and s["expressionType"].startswith("SlowCrescendo") and s["id"] != exclude and s["from"] < at])
    return cmds[-1][1] if cmds else None
for d in deleted:
    inA = state_before(expression("A"), d["from"], d["id"]) != d["expressionType"]
    inB = state_before(expression("B"), d["from"], d["id"]) != d["expressionType"]
    makers = []
    for i, (e, ins, rest) in enumerate(bed):
        if not any(s["scope"] == "treble" for s in ins + rest): continue
        ids = {s["id"] for s in ins}
        undone_b = [s for s in expression("B") if s["id"] not in ids] + rest
        if not inB and state_before(undone_b, d["from"], d["id"]) != d["expressionType"]:
            makers.append((round(ins[0]["from"], 1), e.get("motivation"), round(z_of(*res_b["gourlin@B/softA"][i]), 2), round(res_b["gourlin@B/softA"][i][1], 1), round(z_of(*res_b["phillipsL@B/softA"][i]), 2), round(res_b["phillipsL@B/softA"][i][1], 1)))
    print(f"  {d['expressionType']:<16} {d['from']:7.1f} bar {bar_of(d['from']):>3}: effective in A {inA}, in B {inB}; B edits whose reversal makes it effective (at, motivation, z G, E G, z P, E P): {makers}")
