import json, numpy as np
from collate import ref_notes, ref_pedal, pair_greedy, seconds_of, E, V
TOL = 8.0
placed = json.load(open('placed.json'))

def hat_basis(u, knots):
    """Linear B-spline basis: a piecewise-linear map through one value per knot."""
    u = np.clip(np.asarray(u, float), knots[0], knots[-1])
    B = np.zeros((len(u), len(knots)))
    i = np.clip(np.searchsorted(knots, u, side='right') - 1, 0, len(knots) - 2)
    w = (u - knots[i]) / (knots[i + 1] - knots[i])
    B[np.arange(len(u)), i] = 1 - w; B[np.arange(len(u)), i + 1] = w
    return B

def local_map(name, knot_mm=500.0):
    ev = E[name]; notes = ev['notes']; ref = ref_notes('C')
    u_of = (lambda t: t) if name in ('gourlin', 'chaseEmR') else seconds_of(ev)
    coef = np.array(placed[name]['coef'])
    u_on = np.array([u_of(n['on']) for n in notes])
    x_on = np.polyval(coef, u_on)
    span = x_on[-1] - x_on[0]; k = max(2, int(round(span / knot_mm)))
    knots = np.linspace(u_on.min() - 1e-6, u_on.max() + 1e-6, k + 1)
    for window in (25, 15, 10):
        pairs = pair_greedy(list(range(len(notes))), ref, window, lambda i: x_on[i], lambda r: r['from'], lambda i, r: notes[i]['pitch'] == r['pitch'])
        u = np.array([u_on[i] for i, _ in pairs]); x = np.array([ref[j]['from'] for _, j in pairs])
        keep = np.ones(len(u), bool)
        for _ in range(8):
            c, *_ = np.linalg.lstsq(hat_basis(u[keep], knots), x[keep], rcond=None)
            res = x - hat_basis(u, knots) @ c
            mad = 1.4826 * np.median(np.abs(res[keep] - np.median(res[keep])))
            new = np.abs(res) <= max(3 * mad, 1.5)
            if (new == keep).all(): break
            keep = new
        x_on = hat_basis(u_on, knots) @ c
    f = lambda t: hat_basis([u_of(t)], knots)[0] @ c
    r = res[keep]
    slopes = np.diff(c) / np.diff(knots)
    print(f"{name}: local map, {k} segments of ~{span / k:.0f} mm, matched {len(pairs)}, kept {keep.sum()}, rms {np.sqrt((r ** 2).mean()):.2f} mm")
    print("   segment slope (edition mm per unit) relative to median:", ' '.join(f"{x:.3f}" for x in slopes / np.median(slopes)))
    return f

maps = {n: local_map(n) for n in ('gourlin', 'phillipsL', 'chaseEmR', 'phillipsR')}

def placed_events(name):
    f = maps[name]; ev = E[name]
    notes = [{**n, 'x_on': float(f(n['on'])), 'x_off': float(f(n['off']))} for n in ev['notes']]
    pedal = [{'at': float(f(p['t'])), 'kind': 'on' if p['value'] >= 64 else 'off'} for p in ev['pedal']]
    return notes, pedal

def collate(notes, pedal, siglum):
    ref = ref_notes(siglum); refp = ref_pedal(siglum)
    pairs = pair_greedy(notes, ref, TOL, lambda n: n['x_on'], lambda r: r['from'], lambda n, r: n['pitch'] == r['pitch'])
    same = [(i, j) for i, j in pairs if abs(notes[i]['x_off'] - ref[j]['to']) <= TOL]
    longer = [(i, j) for i, j in pairs if abs(notes[i]['x_off'] - ref[j]['to']) > TOL]
    mi = {i for i, _ in pairs}; mj = {j for _, j in pairs}
    added = [notes[i] for i in range(len(notes)) if i not in mi]
    missing = [ref[j] for j in range(len(ref)) if j not in mj]
    ppairs = pair_greedy(pedal, refp, TOL, lambda p: p['at'], lambda r: r['at'], lambda p, r: p['kind'] == r['kind'])
    pi = {i for i, _ in ppairs}; pj = {j for _, j in ppairs}
    return {'same': len(same), 'dur': [(notes[i], ref[j]) for i, j in longer], 'added': added, 'missing': missing,
            'pedal_same': len(ppairs), 'pedal_added': [pedal[i] for i in range(len(pedal)) if i not in pi],
            'pedal_missing': [refp[j] for j in range(len(refp)) if j not in pj]}

results = {}
for name in ('gourlin', 'phillipsL', 'chaseEmR', 'phillipsR'):
    notes, pedal = placed_events(name)
    results[name] = (notes, pedal)
    print(f"\n######## {name}")
    for siglum in ('A', 'A1', 'B', 'B1', 'C', 'D1', 'D2'):
        r = collate(notes, pedal, siglum)
        print(f"  vs {siglum:2}: notes same {r['same']}, duration differs {len(r['dur'])}, added {len(r['added'])}, missing {len(r['missing'])}; pedal same {r['pedal_same']}, added {len(r['pedal_added'])}, missing {len(r['pedal_missing'])}")
    r = collate(notes, pedal, 'C')
    print("  -- against C in detail")
    for n, ref in sorted(r['dur'], key=lambda p: p[1]['from']):
        print(f"     dur  p{n['pitch']:3} ref {ref['from']:.1f}-{ref['to']:.1f} [{ref['wit']}]  here {n['x_on']:.1f}-{n['x_off']:.1f}  Δon {n['x_on'] - ref['from']:+.1f} Δoff {n['x_off'] - ref['to']:+.1f}")
    for n in sorted(r['added'], key=lambda n: n['x_on']):
        print(f"     add  p{n['pitch']:3} {n['x_on']:.1f}-{n['x_off']:.1f}")
    for ref in sorted(r['missing'], key=lambda n: n['from']):
        print(f"     miss p{ref['pitch']:3} {ref['from']:.1f}-{ref['to']:.1f} [{ref['wit']}]")
    for p in r['pedal_added']: print(f"     pedal+ {p['kind']:3} {p['at']:.1f}")
    for p in r['pedal_missing']: print(f"     pedal- {p['kind']:3} {p['at']:.1f} [{p['wit']}]")

json.dump({k: {'notes': v[0], 'pedal': v[1]} for k, v in results.items()}, open('placed_local.json', 'w'))
