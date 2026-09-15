import json, numpy as np
from collate import ref_notes, ref_pedal, E, V
from align_dp import local_map, place, collate, as_ref

maps = {n: local_map(n) for n in ('gourlin', 'phillipsL')}
P = {n: place(n, maps[n]) for n in maps}

def nearest(items, at, key, kind=None):
    pool = [it for it in items if kind is None or it['kind'] == kind]
    return min(pool, key=lambda it: abs(key(it) - at)) if pool else None

def show(title, notes, pedal, ref, refp):
    r = collate(notes, pedal, ref, refp)
    print(f"\n== {title}: same {r['same']}, duration {len(r['dur'])}, added {len(r['added'])}, missing {len(r['missing'])}; pedal same {r['pedal_same']}, added {len(r['pedal_added'])}, missing {len(r['pedal_missing'])}")
    for n, q in sorted(r['dur'], key=lambda p: p[1]['from']):
        print(f"   dur   p{n['pitch']:<3} ref {q['from']:7.1f}-{q['to']:7.1f} [{q['wit']}]  here {n['x_on']:7.1f}-{n['x_off']:7.1f}  Δon {n['x_on'] - q['from']:+5.1f}  Δoff {n['x_off'] - q['to']:+6.1f}")
    for n in sorted(r['added'], key=lambda n: n['x_on']):
        q = nearest([x for x in ref if x['pitch'] == n['pitch']], n['x_on'], lambda x: x['from'])
        print(f"   add   p{n['pitch']:<3} here {n['x_on']:7.1f}-{n['x_off']:7.1f}   nearest same pitch in ref {q['from']:.1f}-{q['to']:.1f} [{q['wit']}]")
    for q in sorted(r['missing'], key=lambda q: q['from']):
        n = nearest([x for x in notes if x['pitch'] == q['pitch']], q['from'], lambda x: x['x_on'])
        print(f"   miss  p{q['pitch']:<3} ref {q['from']:7.1f}-{q['to']:7.1f} [{q['wit']}]   nearest here {n['x_on']:.1f}-{n['x_off']:.1f}")
    events = [('+', p['kind'], p['at'], nearest(refp, p['at'], lambda x: x['at'], p['kind'])['at']) for p in r['pedal_added']] + \
             [('-', q['kind'], q['at'], nearest(pedal, q['at'], lambda x: x['at'], q['kind'])['at']) for q in r['pedal_missing']]
    for sign, kind, at, other in sorted(events, key=lambda e: e[2]):
        print(f"   pedal {sign}{kind:3} {at:7.1f}   nearest same kind on the other side {other:7.1f} ({other - at:+.1f})")

for name in ('gourlin', 'phillipsL'):
    show(f"{name} against C", *P[name], ref_notes('C'), ref_pedal('C'))
show("gourlin against phillipsL", *P['gourlin'], *as_ref(*P['phillipsL'], 'P'))

print("\n== Stretches: places where the displacement jumps between neighbouring aligned notes")
for name in ('gourlin', 'phillipsL'):
    m = maps[name]
    order = np.argsort(m['ref_at']); at, res = m['ref_at'][order], m['resid'][order]
    lvl = np.array([np.median(res[max(0, k - 4):k + 1]) for k in range(len(res))])
    after = np.array([np.median(res[k + 1:k + 6]) if k + 1 < len(res) else np.nan for k in range(len(res))])
    jumps = [(at[k], at[k + 1], after[k] - lvl[k]) for k in range(len(res) - 1) if abs(after[k] - lvl[k]) > 6]
    merged = []
    for a, b, d in jumps:
        if merged and a - merged[-1][1] < 30: merged[-1] = (merged[-1][0], b, d if abs(d) > abs(merged[-1][2]) else merged[-1][2])
        else: merged.append((a, b, d))
    print(f"  {name}:", '; '.join(f"between {a:.0f} and {b:.0f} mm the copy has {-d:+.0f} mm more paper" for a, b, d in merged))

print("\n== Diagnostic readings, measured inside each source")
def carriers(sym):
    return {c['copy']: c for c in sym['carriers']}
snapC = V['snapshots']['C']; snapB = V['snapshots']['B']
def slope(name, tick):
    ev = E[name]; coef = json.load(open('placed.json'))[name]['coef']
    if name in ('gourlin', 'chaseEmR'): return coef[0]
    tps = ev['tpq'] / (ev['tempos'][0][1] / 1e6); t = tick / tps
    return (2 * coef[0] * t + coef[1]) / tps

def within(name, pitch, lo, hi):
    return [n for n in E[name]['notes'] if n['pitch'] == pitch and lo <= next(x for x in P[name][0] if x is not None and x['on'] == n['on'] and x['pitch'] == n['pitch'])['x_on'] <= hi]

def local_notes(name, lo, hi, pitches=None):
    return [n for n in P[name][0] if lo <= n['x_on'] <= hi and (pitches is None or n['pitch'] in pitches)]

# 1. c' at 2248: B ends 2365.2 (S1 W), C ends 2356.9 (G L S2). Measure the end against the onset of the next attack in the same source.
cB = next(s for s in V['versions'] if s['siglum'] == 'C')
sym_c = next(s for s in snapC if s['type'] == 'note' and s['pitch'] == 60 and abs(s['from'] - 2247.9) < 2)
sym_b = next(s for e in cB['edits'] for s in [] ) if False else None
allsyms = {s['id']: s for v in V['versions'] for e in v['edits'] for s in e['insert']}
old = next(s for s in allsyms.values() if s['type'] == 'note' and s['pitch'] == 60 and abs(s['from'] - 2247.8) < 2 and s['to'] > 2362)
nxt = sorted([s for s in snapC if s['type'] == 'note' and 2330 <= s['from'] <= 2420], key=lambda s: s['from'])
print("  c' (2248): next attacks in C:", [(s['pitch'], round(s['from'], 1), ''.join(s['witnesses'])) for s in nxt])
anchor = nxt[0]
for copy in ('S1', 'W', 'S2', 'L', 'G'):
    c = carriers(sym_c).get(copy) or carriers(old).get(copy); a = carriers(anchor).get(copy)
    if c and a: print(f"    {copy}: c' ends {c['to'] - a['from']:+.1f} mm from the onset of p{anchor['pitch']}")
for name in ('gourlin', 'phillipsL'):
    ev = E[name]['notes']
    c = min((n for n in P[name][0] if n['pitch'] == 60), key=lambda n: abs(n['x_on'] - 2248))
    a = min((n for n in P[name][0] if n['pitch'] == anchor['pitch']), key=lambda n: abs(n['x_on'] - anchor['from']))
    print(f"    {name}: c' ends {(c['off'] - a['on']) * slope(name, a['on']):+.1f} mm from the onset of p{anchor['pitch']} (raw units times local slope)")

# 2. D1's own readings and the green copy's, as they stand in each source
windows = [("D1 c' restrike", [60], 5180, 5320), ("D1 retimed c", [48], 8840, 9130), ("D2 g longer", [55], 6440, 6530), ("D2 stray f''", [77], 1930, 1970)]
for label, pitches, lo, hi in windows:
    print(f"  {label} ({lo}-{hi} mm):")
    for sig in ('C', 'D1', 'D2'):
        print(f"    {sig:9}", [(round(s['from'], 1), round(s['to'], 1), ''.join(s['witnesses'])) for s in V['snapshots'][sig] if s['type'] == 'note' and s['pitch'] in pitches and lo <= s['from'] <= hi])
    for name in ('gourlin', 'phillipsL'):
        print(f"    {name:9}", [(round(n['x_on'], 1), round(n['x_off'], 1)) for n in local_notes(name, lo, hi, pitches)])

# 3. Pedal at 5371 (A1) and bar 15 (6700-6900)
for lo, hi in ((5340, 5400), (6690, 6900)):
    print(f"  pedal {lo}-{hi} mm:")
    for sig in ('C', 'A1'):
        print(f"    {sig:9}", [(s['expressionType'].replace('SustainPedal', ''), round(s['from'], 1), ''.join(s['witnesses'])) for s in V['snapshots'][sig] if s['type'] == 'expression' and s['expressionType'].startswith('SustainPedal') and lo <= s['from'] <= hi])
    print(f"    {'D2':9}", [(round(s['from'], 1), round(s['to'], 1)) for s in V['snapshots']['D2'] if s['type'] == 'expression' and s['expressionType'] == 'SustainPedal' and s['to'] >= lo and s['from'] <= hi])
    for name in ('gourlin', 'phillipsL'):
        print(f"    {name:9}", [(p['kind'], round(p['at'], 1)) for p in P[name][1] if lo <= p['at'] <= hi])
