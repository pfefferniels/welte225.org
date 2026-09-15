import json, collections
import numpy as np
from recon import *
import softdecode as sd

bars = json.load(open("../bars/bars.json"))
bar_of = lambda x: ([b["label"] for b in bars if b["from_mm"] <= x] or ["up"])[-1]
soft_of = lambda sig: [s for s in expression(sig) if s["expressionType"].startswith("SoftPedal")]
no_soft = lambda syms: [s for s in syms if not s["expressionType"].startswith("SoftPedal")]


def pooled(pairs):
    use = [(l, e) for l, e in pairs if e >= 0.5]
    if not use: return "  –"
    L = sum(l for l, _ in use); E = sum(e for _, e in use)
    z = [l / e for l, e in use]
    return f"{len(use):2d} {L / E:+5.2f}±{np.sqrt(2 / E):4.2f} m{np.median(z):+5.2f}"


def evidence(reg, with_syms, without_syms, sigma):
    rw, ro = reg.residuals(with_syms), reg.residuals(without_syms)
    return float(np.sum(ro ** 2 - rw ** 2) / (2 * sigma ** 2)), float(np.sum((ro - rw) ** 2) / (2 * sigma ** 2))


def edit_symbols(e):
    return [s for s in e["insert"] if s["type"] == "expression" and not s["expressionType"].startswith("SoftPedal")]


def group_tests(name, context_sig, soft_sig):
    clock, regs = study(name, soft_of(soft_sig))
    base = no_soft(expression(context_sig)) + soft_of(soft_sig)
    sig_v = {sc: sigma_of(r, context_sig) for sc, r in regs.items()}
    out = collections.defaultdict(list)
    for sig in ("A1", "B1", "C"):
        for e in VERSIONS[sig]["edits"]:
            ins = edit_symbols(e)
            if not ins or e["delete"]: continue
            ids = {s["id"] for s in ins}
            if all(i in {s["id"] for s in base} for i in ids):
                with_s, without_s = base, [s for s in base if s["id"] not in ids]     # context already has it
            else:
                with_s, without_s = base + ins, base
            L = E = 0.0
            for scope in sorted({s["scope"] for s in ins}):
                l, en = evidence(regs[scope], with_s, without_s, sig_v[scope]); L += l; E += en
            label = f"{sig} additions" if sig != "C" else ("C bass pairs" if all(s["scope"] == "bass" for s in ins) and len(ins) == 2 and "Crescendo" in ins[0]["expressionType"]
                                                         else "C treble pairs" if len(ins) == 2 and "Crescendo" in ins[0]["expressionType"]
                                                         else "C forzando pairs" if len(ins) == 2 else "C singles")
            out[label].append((L, E))
    # B's own groups in this context: remove the edit from the context
    for e in VERSIONS["B"]["edits"]:
        ins = edit_symbols(e)
        if not ins: continue
        parent_ids = SNAP_IDS["A"]
        restored = [SYM[d] for d in e["delete"] if d in SYM and d in parent_ids and SYM[d]["type"] == "expression" and not SYM[d]["expressionType"].startswith("SoftPedal")]
        ids = {s["id"] for s in ins}
        if not all(i in {s["id"] for s in base} for i in ids): continue
        without_s = [s for s in base if s["id"] not in ids] + restored
        L = E = 0.0
        for scope in sorted({s["scope"] for s in ins + restored}):
            l, en = evidence(regs[scope], base, without_s, sig_v[scope]); L += l; E += en
        out["B " + ("shifts" if e["delete"] else "additions") + (" bass" if all(s["scope"] == "bass" for s in ins) else " treble")].append((L, E))
    return out


print("[1–2] pooled z of readings added to or removed from a fixed context (≈ +1 present, ≈ −1 absent); n, pooled ± se, median")
configs = [("chaseEmR", "C", "C"), ("phillipsR", "C", "C"), ("gourlin", "B", "C"), ("gourlin", "B", "A1"), ("phillipsL", "B", "C"), ("phillipsL", "B", "A1")]
tables = {}
for name, ctx, soft in configs:
    tables[(name, ctx, soft)] = group_tests(name, ctx, soft)
labels = sorted({k for t in tables.values() for k in t})
print(f"{'group':<22} | " + " | ".join(f"{n}/{c}/soft {s}" for n, c, s in configs))
for g in labels:
    print(f"{g:<22} | " + " | ".join(pooled(tables[c].get(g, [])) for c in configs))

print("\n[3] soft-pedal timelines scored on the global forward model (negative log-likelihood, lower is better)")
for name, coding_sig in (("chaseEmR", "D1"), ("gourlin", "B"), ("phillipsL", "B")):
    clock = clock_of(name)
    rows = sd.per_note(name, coding_sig, clock)
    def score_timeline(changes):
        state_at = lambda mm: next((s for m, s in reversed(changes) if mm >= m), 1)
        total = 0.0
        for t, v, pon, poff, sigma in rows:
            mm = float(clock.millimetres(t))
            p = pon if state_at(mm) else poff
            total += (v - p) ** 2 / (2 * sigma ** 2)
        return round(total, 1)
    tl = {
        "B/C": [(0, 1), (5315.6, 0), (5770.6, 1), (6185.7, 0), (6715.5, 1)],
        "A1 (Widuch)": [(0, 1), (5507.0, 0), (5534.9, 1), (5549.4, 0), (5563.9, 1), (5583.5, 0), (5666.8, 1), (6185.7, 0), (6250.4, 1), (6338.5, 0), (6715.5, 1)],
        "decoded Gourlin": [(0, 1), (5574, 0), (5636, 1), (6394, 0), (6745, 1)],
        "always on": [(0, 1)],
    }
    print(f"  {name}: " + ", ".join(f"{k} {score_timeline(v)}" for k, v in tl.items()))

print("\n[4] neighbourhood of the C single commands the pair seems to carry")
for lo, hi, scope in ((5180, 5320, "treble"), (6420, 6560, "bass"), (9080, 9240, "bass"), (9080, 9240, "treble")):
    for sig in ("A", "B", "C"):
        seq = sorted([(round(s["from"], 1), s["expressionType"].replace("SlowCrescendo", "Cresc").replace("Forzando", "Fz"), "".join(s["witnesses"])) for s in expression(sig)
                      if s.get("scope") == scope and lo <= s["from"] <= hi and not s["expressionType"].startswith(("Sustain", "SoftPedal"))])
        print(f"  {scope:6} {lo}-{hi} bar {bar_of(lo)}–{bar_of(hi)} {sig}: {seq}")
