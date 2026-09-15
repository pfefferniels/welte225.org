import json, numpy as np
from collate import ref_notes, ref_pedal, pair_greedy, seconds_of, E
TOL = 8.0
placed = json.load(open('placed.json'))

def chord_order(items, key, gap=6.0):
    """Onset order with each cluster of near-simultaneous notes sorted by pitch, so chord spreading cannot reorder a sequence."""
    items = sorted(items, key=key); groups = []
    for it in items:
        if groups and key(it) - key(groups[-1][-1]) <= gap: groups[-1].append(it)
        else: groups.append([it])
    return [x for g in groups for x in sorted(g, key=lambda n: n['pitch'])]

def needleman_wunsch(a, b, match, prior):
    """Global alignment of two note sequences; returns index pairs of matched notes."""
    n, m = len(a), len(b); gap = -1.0
    S = np.zeros((n + 1, m + 1)); T = np.zeros((n + 1, m + 1), np.int8)
    S[:, 0] = gap * np.arange(n + 1); S[0, :] = gap * np.arange(m + 1); T[1:, 0] = 1; T[0, 1:] = 2
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d = S[i - 1, j - 1] + (3.0 if match(a[i - 1], b[j - 1]) and prior(a[i - 1], b[j - 1]) else -2.0)
            u, l = S[i - 1, j] + gap, S[i, j - 1] + gap
            S[i, j], T[i, j] = max((d, 0), (u, 1), (l, 2))
    pairs, i, j = [], n, m
    while i > 0 or j > 0:
        t = T[i, j]
        if t == 0:
            if match(a[i - 1], b[j - 1]) and prior(a[i - 1], b[j - 1]): pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif t == 1: i -= 1
        else: j -= 1
    return pairs[::-1]

def running_median(v, half):
    return np.array([np.median(v[max(0, k - half):k + half + 1]) for k in range(len(v))])

def local_map(name, half=6):
    ev = E[name]; ref = ref_notes('C')
    u_of = (lambda t: t) if name in ('gourlin', 'chaseEmR') else seconds_of(ev)
    coef = np.array(placed[name]['coef'])
    xg = lambda t: float(np.polyval(coef, u_of(t)))
    a = chord_order([{**n, 'xg': xg(n['on'])} for n in ev['notes']], key=lambda n: n['xg'])
    b = chord_order(ref, key=lambda r: r['from'])
    pairs = needleman_wunsch(a, b, lambda p, q: p['pitch'] == q['pitch'], lambda p, q: abs(p['xg'] - q['from']) < 150)
    u = np.array([u_of(a[i]['on']) for i, _ in pairs]); resid = np.array([b[j]['from'] - a[i]['xg'] for i, j in pairs])
    order = np.argsort(u); u, resid = u[order], resid[order]
    smooth = running_median(resid, half)
    to_x = lambda t: xg(t) + float(np.interp(u_of(t), u, smooth))
    return {'to_x': to_x, 'pairs': len(pairs), 'u': u, 'resid': resid, 'smooth': smooth,
            'ref_at': np.array([b[j]['from'] for _, j in pairs])[order]}

def place(name, m):
    ev = E[name]
    notes = [{**n, 'x_on': m['to_x'](n['on']), 'x_off': m['to_x'](n['off'])} for n in ev['notes']]
    pedal = [{'at': m['to_x'](p['t']), 'kind': 'on' if p['value'] >= 64 else 'off'} for p in ev['pedal']]
    return notes, pedal

def collate(notes, pedal, ref, refp):
    pairs = pair_greedy(notes, ref, TOL, lambda n: n['x_on'], lambda r: r['from'], lambda n, r: n['pitch'] == r['pitch'])
    dur = [(notes[i], ref[j]) for i, j in pairs if abs(notes[i]['x_off'] - ref[j]['to']) > TOL]
    mi = {i for i, _ in pairs}; mj = {j for _, j in pairs}
    ppairs = pair_greedy(pedal, refp, TOL, lambda p: p['at'], lambda r: r['at'], lambda p, r: p['kind'] == r['kind'])
    pi = {i for i, _ in ppairs}; pj = {j for _, j in ppairs}
    return {'same': len(pairs) - len(dur), 'dur': dur,
            'added': [notes[i] for i in range(len(notes)) if i not in mi], 'missing': [ref[j] for j in range(len(ref)) if j not in mj],
            'pedal_same': len(ppairs), 'pedal_added': [pedal[i] for i in range(len(pedal)) if i not in pi],
            'pedal_missing': [refp[j] for j in range(len(refp)) if j not in pj]}

def as_ref(notes, pedal, label):
    return ([{'from': n['x_on'], 'to': n['x_off'], 'pitch': n['pitch'], 'wit': label} for n in notes],
            [{'at': p['at'], 'kind': p['kind'], 'wit': label} for p in pedal])

if __name__ == '__main__':
    maps, placed_now = {}, {}
    for name in ('gourlin', 'phillipsL', 'chaseEmR', 'phillipsR'):
        m = local_map(name); maps[name] = m; placed_now[name] = place(name, m)
        dev = m['resid'] - m['smooth']
        print(f"{name}: {m['pairs']} notes aligned by sequence; local rms {np.sqrt(np.mean(dev[np.abs(dev) < 5] ** 2)):.2f} mm; "
              f"displacement against the global map ranges {m['smooth'].min():+.1f} to {m['smooth'].max():+.1f} mm")
    print('\nDisplacement profile (edition mm: median displacement over the next 15 aligned notes)')
    for name in ('gourlin', 'phillipsL', 'chaseEmR'):
        m = maps[name]; k = np.arange(0, len(m['u']), 15)
        print(f" {name:9}", ' '.join(f"{m['ref_at'][i]:.0f}:{np.median(m['resid'][i:i + 15]):+.0f}" for i in k))
    json.dump({k: {'notes': v[0], 'pedal': v[1]} for k, v in placed_now.items()}, open('placed_dp.json', 'w'))
    for name in ('gourlin', 'phillipsL', 'chaseEmR', 'phillipsR'):
        notes, pedal = placed_now[name]
        print(f"\n######## {name}")
        for siglum in ('A', 'A1', 'B', 'B1', 'C', 'D1', 'D2'):
            r = collate(notes, pedal, ref_notes(siglum), ref_pedal(siglum))
            print(f"  vs {siglum:2}: notes same {r['same']}, duration differs {len(r['dur'])}, added {len(r['added'])}, missing {len(r['missing'])}; "
                  f"pedal same {r['pedal_same']}, added {len(r['pedal_added'])}, missing {len(r['pedal_missing'])}")
