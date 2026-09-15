"""Verdicts from the calibrated gains, in both contexts, and the tables for ablation.md."""

import json, collections

D = json.load(open('ablation_both.json'))
P = json.load(open('ablation.json'))
PRIMARY = {"chaseEmR": "C", "phillipsR": "C", "gourlin": "B", "phillipsL": "B"}
ORDER = ("chaseEmR", "phillipsR", "gourlin", "phillipsL")


def verdict(s):
    """lacks-95th is stored as critical_has, has-5th as critical_lacks."""
    if not s or s.get("rows", 0) == 0 or "critical_has" not in s:
        return "–"
    above_lacks = s["gain"] > s["critical_has"]
    below_has = s["gain"] < s["critical_lacks"]
    if above_lacks and not below_has:
        return "has"
    if below_has and not above_lacks:
        return "lacks"
    if above_lacks and below_has:
        return "between"
    return "overlap"


def cell(group, name, ctx):
    rec = D["groups"][group]["files"].get(name, {}).get(ctx, {})
    return {side: verdict(s) for side, s in rec.items()}, rec


def precision(group, name):
    rec = P["groups"][group]["files"].get(name, {}).get(PRIMARY[name], {})
    return {side: s.get("precision_mm") for side, s in rec.items()}


rows = []
for label, g in D["groups"].items():
    entry = {"label": label, "version": g["version"], "kinds": g["kinds"], "n": sum(g["kinds"].values()),
             "motivations": g["motivations"]}
    for name in ORDER:
        for ctx in ("B", "C"):
            v, rec = cell(label, name, ctx)
            entry[f"{name}/{ctx}"] = v
            entry[f"{name}/{ctx}/gain"] = {side: s.get("gain") for side, s in rec.items()}
            entry[f"{name}/{ctx}/power"] = {side: (s.get("power_has"), s.get("power_lacks")) for side, s in rec.items()}
        entry[f"{name}/precision"] = precision(label, name)
    rows.append(entry)


def flat(v):
    vals = [x for x in v.values() if x != "–"]
    return "/".join(vals) if vals else "–"


def summary(entry, name):
    p = entry[f"{name}/{PRIMARY[name]}"]
    o = entry[f"{name}/{'B' if PRIMARY[name] == 'C' else 'C'}"]
    return f"{flat(p)}|{flat(o)}"


for version in ("B", "C", "B1", "A1", "D1"):
    print(f"\n## {version}")
    for e in (r for r in rows if r["version"] == version):
        prec = {k: e[f"{k}/precision"] for k in ("gourlin", "phillipsL")}
        pw = {k: e[f"{k}/{PRIMARY[k]}/power"] for k in ORDER}
        print(f"{e['label']:44s} n={e['n']:2d} {e['kinds']}")
        print("    controls  Chase " + summary(e, "chaseEmR") + "  PhR " + summary(e, "phillipsR")
              + "   pair  G " + summary(e, "gourlin") + "  PhL " + summary(e, "phillipsL"))
        print("    power(has,lacks) " + json.dumps(pw) + "  precision " + json.dumps(prec))

# C's 76 edits: detection by the controls in their primary context, and the pair's verdicts
c = [r for r in rows if r["version"] == "C"]
def detected(e):
    return any(v in ("has", "between") for k in ("chaseEmR", "phillipsR") for v in e[f"{k}/{PRIMARY[k]}"].values())
def pair_robust(e, want):
    return all(want in e[f"{k}/{ctx}"].values() for k in ("gourlin", "phillipsL") for ctx in ("B", "C")
               if any(v != "–" for v in e[f"{k}/{ctx}"].values()))
def pair_any(e, want, ctx=None):
    return any(want in e[f"{k}/{cc}"].values() for k in ("gourlin", "phillipsL") for cc in ((ctx,) if ctx else ("B", "C")))
tally = collections.Counter()
for e in c:
    add = e["kinds"].get("addition", 0)
    rem = e["kinds"].get("redundancy removal", 0)
    tally["additions"] += add; tally["removals"] += rem
    if detected(e):
        tally["additions detected by a control"] += add; tally["removals detected by a control"] += rem
        if pair_any(e, "has"):
            tally["detected additions: pair has (either file, either context)"] += add
        if pair_any(e, "lacks", "B") and pair_any(e, "lacks", "C"):
            tally["detected additions: pair lacks in both contexts"] += add
        elif pair_any(e, "lacks"):
            tally["detected additions: pair lacks in one context"] += add
        else:
            tally["detected additions: pair neither has nor lacks"] += add
    else:
        tally["additions not detected by either control"] += add; tally["removals not detected"] += rem
    scope = e["label"].split(":")[1]
    tally[f"{scope} additions"] += add
    tally[f"{scope} additions detected"] += add if detected(e) else 0
print("\nC tally:", json.dumps(tally, indent=1))
json.dump(rows, open('tables.json', 'w'), indent=1)
