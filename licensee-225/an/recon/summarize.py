import json, collections
import numpy as np
R = json.load(open("recon.json"))
bars = json.load(open("../bars/bars.json"))
bar_of = lambda x: ([b["label"] for b in bars if b["from_mm"] <= x] or ["up"])[-1]

def group(kind):
    sig, action, base, paired, scope, mot = kind.split(" ", 5)
    if sig == "C" and action == "addition":
        if base == "Crescendo" and paired == "pair" and scope == "bass": return f"C bass pairs {mot}"
        if base == "Crescendo" and paired == "pair": return "C treble pairs"
        if base == "Forzando": return "C bass forzando pairs"
        return "C single commands"
    if sig == "C": return "C removals"
    if sig == "B" and action == "addition":
        if base == "Forzando": return "B forzando additions"
        return f"B crescendo {paired} {scope}"
    if sig == "B": return f"B shifts {base}"
    if sig == "A1": return f"A1 {base}"
    return f"{sig} {action} {base}"

T = 2.0
print("group | n | controls: chaseEmR present/absent, phillipsR present/absent | gourlin present/absent/ambig | phillipsL present/absent/ambig | null>2 rate G/P | median span mm")
groups = collections.OrderedDict()
for i, row in enumerate(R["gourlin"]["edits"]):
    groups.setdefault(group(row["kind"]), []).append(i)
for g, idx in sorted(groups.items()):
    def cnt(name):
        l = np.array([R[name]["edits"][i]["llr"] for i in idx])
        return int((l > T).sum()), int((l < -T).sum()), int((np.abs(l) <= T).sum())
    def null_rate(name):
        nv = np.concatenate([R[name]["edits"][i]["null"] for i in idx])
        return float((nv > T).mean())
    spans = [R["chaseEmR"]["edits"][i]["span_mm"] for i in idx if R["chaseEmR"]["edits"][i]["span_mm"]]
    c, p, go, pl = cnt("chaseEmR"), cnt("phillipsR"), cnt("gourlin"), cnt("phillipsL")
    print(f"{g:<36} | {len(idx):3} | {c[0]:3}/{c[1]:<3} {p[0]:3}/{p[1]:<3} | {go[0]:3}/{go[1]:3}/{go[2]:3} | {pl[0]:3}/{pl[1]:3}/{pl[2]:3} | {null_rate('gourlin'):.2f}/{null_rate('phillipsL'):.2f} | {np.median(spans) if spans else float('nan'):.0f}")

print("\nC additions, per edit: bar, at mm, LLR chaseEmR, phillipsR, gourlin, phillipsL, effect in velocity units (Gourlin)")
for i, row in enumerate(R["gourlin"]["edits"]):
    if not row["kind"].startswith("C addition"): continue
    vals = [R[n]["edits"][i]["llr"] for n in ("chaseEmR", "phillipsR", "gourlin", "phillipsL")]
    print(f"  {bar_of(row['at_mm']):>4} {row['at_mm']:7.1f} {group(row['kind']):<30} " + " ".join(f"{v:7.1f}" for v in vals) + f"  eff {row['effect_vel']:.1f}")
print("\nB additions and shifts, per edit")
for i, row in enumerate(R["gourlin"]["edits"]):
    if not row["kind"].startswith("B "): continue
    vals = [R[n]["edits"][i]["llr"] for n in ("chaseEmR", "phillipsR", "gourlin", "phillipsL")]
    print(f"  {bar_of(row['at_mm']):>4} {row['at_mm']:7.1f} {group(row['kind']):<30} " + " ".join(f"{v:7.1f}" for v in vals))
