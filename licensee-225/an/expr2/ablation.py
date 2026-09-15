"""Per-group ablation of the edition's expression edits against four emulations.

Each group of edits (one version, one scope, edits within 150 mm of each other) is
toggled in a context coding, with the file's dynamics fixed from a free fit of that
context. The statistic is the held-out log-likelihood gain of the edited coding over
the unedited one, in the rows the group changes, set against the same gain with the
group's commands displaced by one to four seconds. A parametric bootstrap on each
file's own fitted model gives the power to see the group at all, and the profile over
small displacements gives the positional precision in millimetres.

    python3 ablation.py [--smoke]      writes ablation.json
"""

from __future__ import annotations

import collections
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "expr"))
import expr_test as xt  # noqa: E402
import followup as fu  # noqa: E402

V = xt.V
E = xt.E
SNAP = {k: {s["id"]: s for s in v} for k, v in V["snapshots"].items()}
PARENT = {v["siglum"]: v["parent"] for v in V["versions"]}
MOTIVATION = {m["id"]: m.get("note") for v in V["versions"] for m in v["motivations"]}
BARS = json.loads((HERE.parent / "bars" / "bars.json").read_text())

FILES = ("chaseEmR", "phillipsR", "gourlin", "phillipsL")
ENGINE = {"chaseEmR": "Trachtman", "gourlin": "Trachtman", "phillipsR": "Phillips", "phillipsL": "Phillips"}
PRIMARY = {"chaseEmR": "C", "phillipsR": "C", "gourlin": "B", "phillipsL": "B"}
SHIFTS = (-0.7, -0.4, -0.3, -0.2, -0.1, -0.05, 0.05, 0.1, 0.2, 0.3, 0.4, 0.7)
SOFT_GRID = (0.0, 0.04, 0.08, 1 / 9, 0.15, 0.2, 0.25)
FAMILIES = ("SlowCrescendo", "Mezzoforte", "SoftPedal", "SustainPedal", "Forzando")
SIMULATIONS = 60


def bar_at(mm: float) -> str:
    return ([b["label"] for b in BARS if b["from_mm"] <= mm] or ["upbeat"])[-1]


# ------------------------------------------------------------ the edits


def family_of(symbol: dict) -> tuple[str | None, bool]:
    kind = symbol["expressionType"]
    return next((f for f in FAMILIES if kind.startswith(f)), None), kind.endswith("On")


def effective_ids(symbols) -> set[str]:
    """Commands that change a latch: an On while it is off, an Off while it is on."""
    runs = collections.defaultdict(list)
    for s in symbols:
        if s["type"] != "expression":
            continue
        fam, on = family_of(s)
        if fam is not None:
            runs[(fam, s["scope"])].append((s["from"], on, s["id"]))
    out = set()
    for seq in runs.values():
        state = False
        for _, on, ident in sorted(seq, key=lambda x: (x[0], x[1])):
            if on != state:
                out.add(ident)
                state = on
    return out


def scope_of(symbol: dict) -> str:
    if symbol["type"] == "note":
        return "note"
    fam, _ = family_of(symbol)
    return {"SoftPedal": "soft", "SustainPedal": "sustain"}.get(fam, symbol["scope"])


@dataclass
class Edit:
    version: str
    ident: str
    motivation: str | None
    inserts: list[dict]
    deletes: list[dict]
    dangling: int
    kind: str = ""

    @property
    def at(self) -> float:
        return min(s["from"] for s in self.inserts + self.deletes)

    @property
    def scope(self) -> str:
        return scope_of((self.inserts + self.deletes)[0])


def edits_of(siglum: str) -> list[Edit]:
    version = next(v for v in V["versions"] if v["siglum"] == siglum)
    parent = SNAP[PARENT[siglum]] if PARENT[siglum] else {}
    own = SNAP[siglum]
    effective_after = effective_ids(own.values())
    effective_before = effective_ids(parent.values())
    out = []
    for e in version["edits"]:
        deletes = [parent[i] for i in e["delete"] if i in parent]
        edit = Edit(siglum, e["id"], e.get("motivation"), list(e["insert"]), deletes,
                    len(e["delete"]) - len(deletes))
        if not edit.inserts and not edit.deletes:
            edit.kind = "no-op (dangling deletion)"
        elif edit.inserts and edit.deletes:
            same = {s["expressionType"] if s["type"] == "expression" else "note" for s in edit.inserts} & \
                   {s["expressionType"] if s["type"] == "expression" else "note" for s in edit.deletes}
            edit.kind = "shift" if same else "replacement"
        elif edit.inserts:
            edit.kind = "addition" if any(s["id"] in effective_after for s in edit.inserts
                                         if s["type"] == "expression") else "redundant insertion"
        else:
            edit.kind = ("withdrawal" if any(s["id"] in effective_before for s in edit.deletes)
                         else "redundancy removal")
        out.append(edit)
    # A withdrawal and an addition of the same command within 60 mm are one shift made in two edits.
    for w in (x for x in out if x.kind == "withdrawal"):
        for a in (x for x in out if x.kind == "addition"):
            if a.scope == w.scope and abs(a.at - w.at) <= 60 and \
                    {s["expressionType"] for s in a.inserts} & {s["expressionType"] for s in w.deletes}:
                w.kind = a.kind = "shift (two edits)"
    return out


@dataclass
class Group:
    version: str
    scope: str
    edits: list[Edit]
    label: str = ""

    @property
    def inserts(self):
        return [s for e in self.edits for s in e.inserts if s["type"] == "expression"]

    @property
    def deletes(self):
        return [s for e in self.edits for s in e.deletes if s["type"] == "expression"]

    @property
    def span(self):
        places = [s["from"] for s in self.inserts + self.deletes]
        return min(places), max(places)

    @property
    def kinds(self):
        return dict(collections.Counter(e.kind for e in self.edits))

    @property
    def motivations(self):
        return sorted({MOTIVATION.get(e.motivation, e.motivation) or "–" for e in self.edits})


def groups_of(siglum: str, gap: float = 150.0) -> list[Group]:
    edits = [e for e in edits_of(siglum) if not e.kind.startswith("no-op") and e.scope not in ("note", "sustain")]
    out = []
    for scope in sorted({e.scope for e in edits}):
        chain = sorted((e for e in edits if e.scope == scope), key=lambda e: e.at)
        current: list[Edit] = []
        for e in chain:
            if current and e.at - max(x.at for x in current) > gap:
                out.append(Group(siglum, scope, current))
                current = []
            current.append(e)
        if current:
            out.append(Group(siglum, scope, current))
    for g in out:
        lo, hi = g.span
        g.label = f"{g.version}:{g.scope}:{lo:.0f}-{hi:.0f} (bar {bar_at(lo)}–{bar_at(hi)})"
    return out


# -------------------------------------------------------------- codings


def track_of(symbol: dict):
    kind = symbol["expressionType"]
    if kind == "SoftPedalOn":
        return xt.SOFT_ON
    if kind == "SoftPedalOff":
        return xt.SOFT_OFF
    return xt.TRACK.get((kind, symbol["scope"]))


def image_of(symbols, clock: xt.Clock, moved=frozenset(), delta: float = 0.0):
    spans = []
    for s in symbols:
        if s["type"] != "expression" or track_of(s) is None:
            continue
        d = delta if s["id"] in moved else 0.0
        start = float(clock.seconds(s["from"])) + d
        spans.append((track_of(s), start, max(float(clock.seconds(s["to"])) + d, start + 0.005)))
    return xt.wf._image("coding", xt.NOTES, spans)


def with_group(context: dict, group: Group) -> dict:
    out = {k: v for k, v in context.items() if k not in {s["id"] for s in group.deletes}}
    out.update({s["id"]: s for s in group.inserts})
    return out


def without_group(context: dict, group: Group) -> dict:
    out = {k: v for k, v in context.items() if k not in {s["id"] for s in group.inserts}}
    out.update({s["id"]: s for s in group.deletes})
    return out


# ----------------------------------------------------------- the model


@dataclass
class Side:
    name: str
    side: str
    clock: xt.Clock
    env: xt.Envelope
    roles: object
    model: object
    soft: float
    sigma2: float
    base_level: np.ndarray
    base_soft: np.ndarray
    residual: np.ndarray
    output: object = None
    cache: dict = field(default_factory=dict)


def fit_side(name: str, side: str, context: dict) -> Side:
    clock = fu.dp_clock(name)
    env = xt.envelope_of(name, side, clock)
    roles = xt.ROLES["licensee"][side]
    image = image_of(context.values(), clock)
    fit = xt.free_fit(image, roles, env)
    level = xt.level_of(fit.model, image, roles, env.rows)
    soft = xt.soft_state(image, env.rows)
    held = xt.score(level, env.velocity, soft, "linear", fit.score.soft).held
    residual = env.velocity - held
    target = env.velocity / (1 - fit.score.soft * soft)
    output = xt.ef._fit_output(level, target, "linear")
    return Side(name, side, clock, env, roles, fit.model, fit.score.soft, float(np.mean(residual ** 2)),
                level, soft, residual, output)


def level_and_soft(side: Side, symbols, moved=frozenset(), delta=0.0):
    image = image_of(symbols, side.clock, moved, delta)
    return xt.level_of(side.model, image, side.roles, side.env.rows), xt.soft_state(image, side.env.rows)


def held_sse(side: Side, level, soft, velocity, rows, softs):
    best = None
    for s in softs:
        held = xt.score(level, velocity, soft, "linear", s).held
        sse = float(np.sum((velocity[rows] - held[rows]) ** 2))
        if best is None or sse < best:
            best = sse
    return best


# ------------------------------------------------------------ statistic


def prepare(side: Side, context: dict, group: Group) -> dict:
    """Levels of the unedited and edited codings and of the edited one with the group displaced."""
    edited = with_group(context, group)
    plain = without_group(context, group)
    adds = frozenset(s["id"] for s in group.inserts)
    variants = {0.0: level_and_soft(side, edited.values())}
    plain_ls = level_and_soft(side, plain.values())
    if adds:
        variants.update({d: level_and_soft(side, edited.values(), adds, d) for d in SHIFTS})
    span = np.ptp(side.base_level) or 1.0
    real_rows = (np.abs(variants[0.0][0] - plain_ls[0]) > 0.01 * span) | (variants[0.0][1] != plain_ls[1])
    union = real_rows.copy()
    for lv, sf in variants.values():
        union |= (np.abs(lv - plain_ls[0]) > 0.01 * span) | (sf != plain_ls[1])
    return {"variants": variants, "plain": plain_ls, "rows": real_rows, "union": union,
            "softs": SOFT_GRID if group.scope == "soft" else (side.soft,)}


def gain(side: Side, prepared: dict, velocity: np.ndarray, which: float = 0.0, rows=None) -> float:
    """Held-out log-likelihood gain of an edited coding over the unedited one, in the given rows."""
    rows = prepared["rows"] if rows is None else rows
    if rows.sum() == 0:
        return 0.0
    plain = held_sse(side, *prepared["plain"], velocity, rows, prepared["softs"])
    edited = held_sse(side, *prepared["variants"][which], velocity, rows, prepared["softs"])
    return (plain - edited) / (2 * side.sigma2)


def precision_mm(side: Side, group: Group, prepared: dict) -> str | float | None:
    """Half-width in mm of the displacements whose gain stays within 2 of the best one near zero."""
    if not group.inserts or prepared["union"].sum() == 0:
        return None
    small = sorted([0.0] + [d for d in SHIFTS if abs(d) <= 0.7])
    gains = np.array([gain(side, prepared, side.env.velocity, d, prepared["union"]) for d in small])
    at = float(side.clock.seconds(np.mean(group.span)))
    mm_per_s = float(side.clock.millimetres(at + 0.5) - side.clock.millimetres(at - 0.5))
    k = int(gains.argmax())
    if abs(small[k]) > 0.3:
        return f"best at {small[k] * mm_per_s:+.0f} mm"
    left = right = k
    while left > 0 and gains[left - 1] >= gains[k] - 2:
        left -= 1
    while right < len(small) - 1 and gains[right + 1] >= gains[k] - 2:
        right += 1
    if left == 0 or right == len(small) - 1:
        return f">= {0.7 * mm_per_s:.0f}"
    return round((small[right] - small[left]) / 2 * mm_per_s, 1)


def calibrate(side: Side, prepared: dict, rng) -> dict:
    """The design's own error rates on this file: gains when its fitted model is given the group, and when not."""
    if prepared["rows"].sum() == 0:
        return {"design": "group changes no row of this file's model"}
    n = len(side.env.rows)

    def simulated(level, soft):
        noise = np.concatenate([side.residual[i:i + 8] for i in rng.integers(0, n - 8, n // 8 + 1)])[:n]
        return side.output(level) * (1 - side.soft * soft) + noise

    has = np.array([gain(side, prepared, simulated(*prepared["variants"][0.0])) for _ in range(SIMULATIONS)])
    lacks = np.array([gain(side, prepared, simulated(*prepared["plain"])) for _ in range(SIMULATIONS)])
    high, low = float(np.percentile(lacks, 95)), float(np.percentile(has, 5))
    return {"critical_has": round(high, 3), "critical_lacks": round(low, 3),
            "power_has": round(float(np.mean(has > high)), 2), "power_lacks": round(float(np.mean(lacks < low)), 2)}


def verdict(real: float, cal: dict) -> str:
    if "critical_has" not in cal:
        return "no rows"
    has, lacks = real > cal["critical_has"], real < cal["critical_lacks"]
    if has and not lacks:
        return "has"
    if lacks and not has:
        return "lacks"
    return "undecided"


# ----------------------------------------------------------------- run


def sides_for(group: Group):
    return ("bass", "treble") if group.scope == "soft" else (group.scope,)


def main(smoke: bool = False) -> None:
    rng = np.random.default_rng(7)
    groups = {sig: groups_of(sig) for sig in ("B", "C", "B1", "A1", "D1")}
    kinds = {sig: dict(collections.Counter(e.kind for e in edits_of(sig))) for sig in groups}
    if smoke:
        groups = {sig: gs[:3] for sig, gs in groups.items()}
    results = {"edit_kinds": kinds, "groups": {}}
    for name in (FILES if not smoke else ("chaseEmR", "gourlin")):
        for context_sig in ("B", "C"):
            context = SNAP[context_sig]
            fitted = {side: fit_side(name, side, context) for side in ("bass", "treble")}
            primary = context_sig == PRIMARY[name]
            for sig, gs in groups.items():
                for g in gs:
                    t = time.time()
                    entry = results["groups"].setdefault(g.label, {
                        "version": g.version, "scope": g.scope, "kinds": g.kinds, "motivations": g.motivations,
                        "edits": [e.ident for e in g.edits], "span": g.span, "files": {}})
                    record = entry["files"].setdefault(name, {}).setdefault(context_sig, {})
                    for side in sides_for(g):
                        prepared = prepare(fitted[side], context, g)
                        real = gain(fitted[side], prepared, fitted[side].env.velocity)
                        stat = {"rows": int(prepared["rows"].sum()), "gain": round(real, 3)}
                        if primary:
                            cal = calibrate(fitted[side], prepared, rng)
                            stat.update(cal)
                            stat["verdict"] = verdict(real, cal)
                            stat["precision_mm"] = precision_mm(fitted[side], g, prepared)
                        record[side] = stat
                    print(f"{name:9s} ctx {context_sig} {g.label:48s} {record} {time.time() - t:.1f}s", flush=True)
    out = HERE / ("ablation_smoke.json" if smoke else "ablation.json")
    out.write_text(json.dumps(results, indent=1, default=float))
    print("wrote", out.name)


if __name__ == "__main__":
    main(smoke="--smoke" in sys.argv)
