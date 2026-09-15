"""Reconstruct the dynamics coding between consecutive notes from velocities and collate it edit by edit.

Each note's velocity is inverted to a level through the engine's output line; each version's coding is then
run from that observed level to the next note of the register. An edit is carried by a file when running
with the edit predicts the next velocity better than running without it (log-likelihood ratio in units of
the file's own interval noise). Power comes from controls with a known coding; chance from displaced edits.
"""
import json, collections
from dataclasses import replace
import numpy as np
from numba import njit
from model import *

SPLITS = {"chaseEmR": (60, 66), "phillipsR": (60, 67), "gourlin": (60, 68), "phillipsL": (60, 68)}
TRUTH = {"chaseEmR": "D1", "phillipsR": "C"}
SPLIT_FITS = json.load(open("split.json"))
SYM = {s["id"]: s for v in V["versions"] for e in v["edits"] for s in e["insert"]}
VERSIONS = {v["siglum"]: v for v in V["versions"]}
SNAP_IDS = {k: {s["id"] for s in ss} for k, ss in V["snapshots"].items()}


def engine_of(name, scope, sig):
    lo, hi = SPLITS[name]
    cv, eng, coef = SPLIT_FITS[f"{name}/{sig}"][scope][str(lo if scope == "bass" else hi)]
    return Engine(**eng), coef, cv


def notes_of(name, clock, scope, gap=0.03):
    lo, hi = SPLITS[name]
    keep = (lambda p: p < lo) if scope == "bass" else (lambda p: p >= hi)
    tps = ticks_per_second(name)
    notes = sorted((n["on"] / tps, n["vel"]) for n in E[name]["notes"] if keep(n["pitch"]))
    groups = []
    for note in notes:
        if groups and note[0] - groups[-1][-1][0] <= gap: groups[-1].append(note)
        else: groups.append([note])
    t = np.array([np.mean([a for a, _ in g]) for g in groups]); v = np.array([float(np.median([b for _, b in g])) for g in groups])
    return t, v


@njit(cache=True)
def run_intervals(drive, idx, L0):
    out = np.empty(len(idx) - 1)
    for k in range(len(idx) - 1):
        v = L0[k]
        for i in range(idx[k], idx[k + 1]):
            v += drive[i]
            if v < 0.0: v = 0.0
            elif v > 1.0: v = 1.0
        out[k] = v
    return out


class Register:
    """One file's register: observed notes, inverted levels and the machinery to test codings."""

    def __init__(self, name, scope, engine, coef, clock, soft_symbols):
        self.name, self.scope, self.engine, self.clock = name, scope, engine, clock
        self.a, self.b = float(coef[0]), float(coef[1])
        self.t, self.v = notes_of(name, clock, scope)
        self.n = int(clock.s.max() / STEP) + 300
        self.idx = np.clip((self.t / STEP).astype(np.int64), 0, self.n - 1)
        self.set_soft(soft_symbols)

    def set_soft(self, soft_symbols):
        soft = latched(coding(soft_symbols, self.clock), "SoftPedal", "both", self.n).astype(float)
        self.att = 1.0 - self.engine.soft * soft[self.idx]
        self.L = np.clip((self.v / self.att - self.a) / self.b, 0.0, 1.0)

    def drive(self, symbols):
        return drive_of(coding(symbols, self.clock), self.scope, self.engine, self.n)

    def residuals(self, symbols):
        L_next = run_intervals(self.drive(symbols), self.idx, self.L[:-1])
        return self.v[1:] - (self.a + self.b * L_next) * self.att[1:]


def expression(sig):
    return [s for s in V["snapshots"][sig] if s["type"] == "expression"]


def undone(sig, edit):
    """The version's coding with one edit reversed: its insertions removed, its effective deletions restored."""
    parent = VERSIONS[sig]["parent"]
    inserted = {s["id"] for s in edit["insert"]}
    restored = [SYM[d] for d in edit["delete"] if d in SYM and parent and d in SNAP_IDS[parent]]
    return [s for s in expression(sig) if s["id"] not in inserted] + [s for s in restored if s["type"] == "expression"]


def displaced(sig, edit, seconds, clock):
    """The edit moved by a number of seconds in the file's own time, as a chance baseline."""
    base = undone(sig, edit)
    moved = []
    for s in edit["insert"]:
        if s["type"] != "expression": continue
        t0, t1 = float(clock.seconds(s["from"])), float(clock.seconds(s["to"]))
        moved.append({**s, "from": float(clock.millimetres(t0 + seconds)), "to": float(clock.millimetres(t1 + seconds)), "id": s["id"] + f"@{seconds}"})
    return base + moved


def kind_of(sig, edit):
    syms = [s for s in edit["insert"]] + [SYM[d] for d in edit["delete"] if d in SYM]
    types = sorted({s.get("expressionType", "note") for s in syms})
    scopes = sorted({s.get("scope") or "-" for s in syms})
    if not edit["insert"]: action = "removal"
    elif edit["delete"]: action = "shift"
    else: action = "addition"
    base = ("Forzando" if any("Forzando" in t for t in types) else "SoftPedal" if any("SoftPedal" in t for t in types)
            else "Crescendo" if any("Crescendo" in t for t in types) else "Mezzoforte" if any("Mezzo" in t for t in types)
            else "Sustain" if any("Sustain" in t for t in types) else "note")
    paired = "pair" if (any(t.endswith("On") for t in types) and any(t.endswith("Off") for t in types)) else "single"
    mot = edit.get("motivation") or "-"
    if mot.startswith("426a0404"): mot = "Mittelstimmen"
    return f"{sig} {action} {base} {paired} {'/'.join(scopes)} [{mot}]"


def llr(reg, with_syms, without_syms, sigma):
    rw, ro = reg.residuals(with_syms), reg.residuals(without_syms)
    pred_diff = np.abs(rw - ro)
    touched = pred_diff > 0.05
    if not touched.any(): return 0.0, 0.0, None
    value = float(np.sum(ro[touched] ** 2 - rw[touched] ** 2) / (2 * sigma ** 2))
    k = np.where(touched)[0]
    span_mm = float(reg.clock.millimetres(reg.t[k[-1] + 1]) - reg.clock.millimetres(reg.t[k[0]]))
    return value, float(pred_diff.max()), span_mm


TESTED = ("A1", "B", "B1", "C", "D1")


def edits_to_test():
    out = []
    for sig in TESTED:
        for e in VERSIONS[sig]["edits"]:
            syms = [s for s in e["insert"]] + [SYM[d] for d in e["delete"] if d in SYM]
            if not any(s["type"] == "expression" and (s["expressionType"].startswith(("SlowCrescendo", "Forzando", "SoftPedal"))) for s in syms):
                continue
            parent = VERSIONS[sig]["parent"]
            if not e["insert"] and all(d not in SNAP_IDS.get(parent, set()) for d in e["delete"]):
                continue  # dangling deletions only
            out.append((sig, e))
    return out


def study(name, context_soft):
    clock = clock_of(name)
    regs = {}
    for scope in ("bass", "treble"):
        fit_sig = TRUTH.get(name, "C")
        eng, coef, cv = engine_of(name, scope, fit_sig)
        regs[scope] = Register(name, scope, eng, coef, clock, context_soft)
    return clock, regs


def sigma_of(reg, sig):
    r = reg.residuals(expression(sig))
    return float(1.4826 * np.median(np.abs(r - np.median(r))))


def main():
    report = {}
    edits = edits_to_test()
    print("edits with an expression effect to test:", collections.Counter(kind_of(s, e) for s, e in edits).most_common(), flush=True)
    for name in ("chaseEmR", "phillipsR", "gourlin", "phillipsL"):
        ctx = TRUTH.get(name, "C")
        clock, regs = study(name, [s for s in expression(ctx) if s["expressionType"].startswith("SoftPedal")])
        sig_v = {scope: sigma_of(reg, ctx) for scope, reg in regs.items()}
        whole = {sig: {scope: round(float(np.sum(reg.residuals(expression(sig)) ** 2) / (2 * sig_v[scope] ** 2)), 1) for scope, reg in regs.items()} for sig in ("A", "A1", "B", "B1", "C", "D1")}
        print(f"\n== {name}: interval noise sigma {sig_v}; negative log-likelihood per version (lower is better) {whole}", flush=True)
        rows = []
        for sig, e in edits:
            syms = [s for s in e["insert"]] + [SYM[d] for d in e["delete"] if d in SYM]
            scopes = {s.get("scope") for s in syms if s["type"] == "expression"}
            soft = any(s["expressionType"].startswith("SoftPedal") for s in syms if s["type"] == "expression")
            targets = ("bass", "treble") if soft else tuple(sc for sc in ("bass", "treble") if sc in scopes)
            total, effect, span = 0.0, 0.0, []
            null = []
            for scope in targets:
                reg = regs[scope]
                val, eff, sp = llr(reg, expression(sig), undone(sig, e), sig_v[scope])
                total += val; effect = max(effect, eff)
                if sp is not None: span.append(sp)
                for sh in (-3.0, -2.0, -1.2, 1.2, 2.0, 3.0):
                    nv, _, _ = llr(reg, displaced(sig, e, sh, clock), undone(sig, e), sig_v[scope])
                    null.append(nv)
            at = min(s["from"] for s in syms if s["type"] == "expression")
            rows.append({"version": sig, "kind": kind_of(sig, e), "at_mm": round(at, 1), "llr": round(total, 2), "effect_vel": round(effect, 2),
                         "span_mm": round(max(span), 1) if span else None, "null": [round(x, 2) for x in null]})
        report[name] = {"sigma": sig_v, "versions": whole, "edits": rows}
    json.dump(report, open("recon.json", "w"), indent=1)


if __name__ == "__main__":
    main()
