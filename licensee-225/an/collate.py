import json, numpy as np
V = json.load(open('versions.json')); E = json.load(open('midi_events.json'))
TOL = 8.0

def ref_notes(siglum):
    return sorted(({'from': s['from'], 'to': s['to'], 'pitch': s['pitch'], 'id': s['id'], 'wit': ''.join(s['witnesses']), 'home': s['home']}
                   for s in V['snapshots'][siglum] if s['type'] == 'note'), key=lambda n: (n['from'], n['pitch']))

def ref_pedal(siglum):
    return sorted(({'at': s['from'], 'kind': 'on' if s['expressionType'].endswith('On') else 'off', 'id': s['id'], 'wit': ''.join(s['witnesses'])}
                   for s in V['snapshots'][siglum] if s['type'] == 'expression' and s['expressionType'].startswith('SustainPedal')), key=lambda p: p['at'])

def seconds_of(events):
    tps = events['tpq'] / (events['tempos'][0][1] / 1e6)
    return lambda tick: tick / tps

def pair_greedy(xs, ys, window, key_x, key_y, same):
    """One-to-one pairs of nearest same-kind items within the window, closest first."""
    cands = [(abs(key_x(a) - key_y(b)), i, j) for i, a in enumerate(xs) for j, b in enumerate(ys)
             if same(a, b) and abs(key_x(a) - key_y(b)) <= window]
    cands.sort(); used_i, used_j, pairs = set(), set(), []
    for d, i, j in cands:
        if i in used_i or j in used_j: continue
        used_i.add(i); used_j.add(j); pairs.append((i, j))
    return pairs

def fit(u, x, degree):
    """Least squares trimmed at three robust deviations, repeated until stable."""
    u, x = np.asarray(u), np.asarray(x); keep = np.ones(len(u), bool)
    for _ in range(10):
        coef = np.polyfit(u[keep], x[keep], degree)
        res = x - np.polyval(coef, u)
        mad = np.median(np.abs(res[keep] - np.median(res[keep]))) * 1.4826
        new = np.abs(res) <= max(3 * mad, 1.0)
        if (new == keep).all(): break
        keep = new
    return coef, res, keep

def align(name, degree, ref):
    ev = E[name]; notes = ev['notes']
    u_of = (lambda t: t) if degree == 1 else seconds_of(ev)
    u_on = np.array([u_of(n['on']) for n in notes])
    coef = np.polyfit([u_on[0], u_on[-1]], [ref[0]['from'], ref[-1]['from']], 1)
    if degree == 2: coef = np.concatenate([[0.0], coef])
    for window in (200, 80, 30, 12):
        x_on = np.polyval(coef, u_on)
        pairs = pair_greedy(list(range(len(notes))), ref, window, lambda i: x_on[i], lambda r: r['from'], lambda i, r: notes[i]['pitch'] == r['pitch'])
        coef, res, keep = fit([u_on[i] for i, _ in pairs], [ref[j]['from'] for _, j in pairs], degree)
    return coef, u_of, pairs, res, keep

def place(name, coef, u_of):
    ev = E[name]
    notes = [{**n, 'x_on': float(np.polyval(coef, u_of(n['on']))), 'x_off': float(np.polyval(coef, u_of(n['off'])))} for n in ev['notes']]
    pedal = [{'at': float(np.polyval(coef, u_of(p['t']))), 'kind': 'on' if p['value'] >= 64 else 'off', 't': p['t']} for p in ev['pedal']]
    return notes, pedal

out = {}
ref = ref_notes('C')
for name, degree in (('gourlin', 1), ('phillipsL', 2), ('phillipsR', 2), ('chaseEmR', 1)):
    coef, u_of, pairs, res, keep = align(name, degree, ref)
    notes, pedal = place(name, coef, u_of)
    r = res[keep]
    print(f'{name}: degree {degree}, coef {np.round(coef, 6).tolist()}, matched {len(pairs)}, kept {keep.sum()}, rms {np.sqrt((r**2).mean()):.2f} mm, max kept {np.abs(r).max():.2f}, outliers {(~keep).sum()}')
    # residual profile along the roll: median residual in blocks of 30 matched notes, to expose local re-timing
    order = np.argsort([ref[j]['from'] for _, j in pairs])
    blocks = [order[k:k + 30] for k in range(0, len(order), 30)]
    print('   profile (from mm: median residual):', ' '.join(f"{ref[pairs[b[0]][1]]['from']:.0f}:{np.median(res[b]):+.1f}" for b in blocks))
    out[name] = {'coef': coef.tolist(), 'notes': notes, 'pedal': pedal}
json.dump(out, open('placed.json', 'w'))
