"""Which version's additions the Licensee e-roll carries, hole by hole."""
import json, collections
import numpy as np
BASE = '/private/tmp/claude-501/-Users-nielspfeffer-Projects-measuring-early-records/b3fcaa9b-5098-45c5-9d78-739ba6a01268/scratchpad/'
P = [p for p in json.load(open(BASE + 'eroll/placed.json')) if p['type'] == 'expression']
V = json.load(open(BASE + 'eroll/versions.json'))
TOL = 8.0
kind = lambda s: (s['expressionType'], s['scope'])
symbols = list({s['id']: s for k in ['A', 'A1', 'B', 'B1', 'C', 'C1', 'D1'] for s in V['snapshots'][k] if s['type'] == 'expression'}.values())
# every symbol ever inserted, with its home (including those later deleted)
inserted = {s['id']: s for v in V['versions'] for e in v['edits'] for s in e['insert'] if s['type'] == 'expression'}
deleted_by = collections.defaultdict(list)
for v in V['versions']:
    if v['siglum'] == 'D2': continue
    for e in v['edits']:
        for d in e['delete']: deleted_by[d].append(v['siglum'])
all_symbols = [s for s in inserted.values() if s['home'] != 'D2']
def nearest(s, pool):
    c = [(abs(p['from'] - s['from']), p) for p in pool if kind(p) == kind(s)]
    return min(c, key=lambda x: x[0]) if c else (None, None)
# precision: A's symbols kept by B and C (archetype), matched greedily
cands = sorted((abs(p['from'] - s['from']), i, s['id']) for i, p in enumerate(P) for s in all_symbols if kind(p) == kind(s) and abs(p['from'] - s['from']) <= TOL)
used_h, used_s, match = set(), set(), {}
for d, i, sid in cands:
    if i in used_h or sid in used_s: continue
    used_h.add(i); used_s.add(sid); match[sid] = (i, P[i]['from'] - inserted[sid]['from'])
arch = [match[s['id']][1] for s in all_symbols if s['home'] == 'A' and s['id'] in match and not deleted_by[s['id']]]
print('archetypal symbols never deleted, matched', len(arch), 'signed offset median %.2f, |d| median %.2f, p90 %.2f' % (np.median(arch), np.median(np.abs(arch)), np.percentile(np.abs(arch), 90)))
by_home = collections.defaultdict(list)
for s in all_symbols: by_home[s['home']].append(s)
for home in ['A', 'A1', 'B', 'B1', 'C', 'C1', 'D1']:
    xs = by_home[home]
    got = [s for s in xs if s['id'] in match]
    print(f'\n== home {home}: {len(xs)} inserted, {len(got)} matched within {TOL} mm (greedy over all symbols)')
    if home in ('A1', 'B1', 'C', 'C1', 'D1') or home == 'B':
        for s in sorted(xs, key=lambda s: s['from']):
            d, p = nearest(s, P)
            m = match.get(s['id'])
            flag = f"MATCH {m[1]:+.1f}" if m else (f"nearest {p['from'] - s['from']:+.1f}" if p else 'none')
            if home in ('B', 'C') and not m and (d is None or d > 25): continue  # long list: show only matched or near
            print(f"  {s['from']:8.1f} {s['expressionType']:>17}:{s['scope']:<6} wit {''.join(s['witnesses']):<8} del {','.join(deleted_by[s['id']]) or '-':<6} {flag}")
unexplained = [p for i, p in enumerate(P) if i not in used_h]
print('\n== e-roll holes matched by no symbol of any version:', len(unexplained))
for p in unexplained:
    d, s = nearest(p, all_symbols)
    print(f"  {p['from']:8.1f} {p['expressionType']:>17}:{p['scope']:<6} nearest symbol {('%+.1f' % (p['from'] - s['from'])) if s else '-'} {s['home'] if s else ''}")
json.dump({'match': match}, open(BASE + 'eroll/match.json', 'w'))
