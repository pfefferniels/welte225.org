"""Which added perforations the Licensee e-roll shares at the same place, and how often that happens by chance."""
import json, collections
import numpy as np

BASE = '/private/tmp/claude-501/-Users-nielspfeffer-Projects-measuring-early-records/b3fcaa9b-5098-45c5-9d78-739ba6a01268/scratchpad/'
HOLES = [p for p in json.load(open(BASE + 'eroll/placed.json')) if p['type'] == 'expression']
V = json.load(open(BASE + 'eroll/versions.json'))
TOL = 8.0
PREFERRED = ['S2', 'S1', 'W', 'L']
kind = lambda s: (s['expressionType'], s['scope'])

def place_of(symbol):
    by_copy = {c['copy']: c['from'] for c in symbol['carriers']}
    return next((by_copy[c] for c in PREFERRED if c in by_copy), symbol['from'])

motivation_note = {m['id']: m['note'] for v in V['versions'] for m in v['motivations']}
symbols, edit_of = {}, {}
for v in V['versions']:
    if v['siglum'] == 'D2': continue
    for e in v['edits']:
        for s in e['insert']:
            if s['type'] == 'expression':
                symbols[s['id']] = {**s, 'at': place_of(s)}
                edit_of[s['id']] = (v['siglum'], e['id'], motivation_note.get(e.get('motivation'), e.get('motivation')))
deleted_by = collections.defaultdict(list)
for v in V['versions']:
    if v['siglum'] == 'D2': continue
    for e in v['edits']:
        for d in e['delete']: deleted_by[d].append(v['siglum'])

def greedy(holes, pool, offset=0.0):
    cands = sorted((abs(h['from'] - offset - s['at']), i, sid) for i, h in enumerate(holes) for sid, s in pool.items()
                   if kind(h) == kind(s) and abs(h['from'] - offset - s['at']) <= TOL)
    used_h, used_s, out = set(), set(), {}
    for d, i, sid in cands:
        if i in used_h or sid in used_s: continue
        used_h.add(i); used_s.add(sid); out[sid] = (i, holes[i]['from'] - symbols[sid]['at'])
    return out

match = greedy(HOLES, symbols)
music = lambda s: 1438 < s['at'] < 9780
arch = np.array([match[k][1] for k, s in symbols.items() if s['home'] == 'A' and not deleted_by[k] and k in match and music(s)])
m = float(np.median(arch))
q = lambda xs: ' '.join(f'p{p} {np.percentile(np.abs(np.asarray(xs) - m), p):.2f}' for p in (50, 90, 95))
print(f'archetype (A, never deleted), n={len(arch)}: offset {m:+.2f} mm; |d - offset| {q(arch)}')
b_add = [match[k][1] for k, s in symbols.items() if s['home'] == 'B' and not deleted_by[k] and k in match]
print(f'B additions matched, n={len(b_add)}: |d - offset| {q(b_add)}')
EXACT = float(np.percentile(np.abs(np.concatenate([arch, b_add]) - m), 95))
print(f'"same place" taken as |d - offset| <= {EXACT:.2f} mm (p95 of archetype and B)')

def status(k):
    s = symbols[k]
    if k in match:
        r = match[k][1] - m
        return ('SAME' if abs(r) <= EXACT else 'near') + f' {r:+.1f}'
    ds = [h['from'] - m - s['at'] for h in HOLES if kind(h) == kind(s)]
    return f"absent (nearest {min(ds, key=abs):+.1f})" if ds else 'absent'

for home in ('B1', 'C', 'D1'):
    print(f'\n== {home} additions by edit')
    edits = collections.defaultdict(list)
    for k, s in symbols.items():
        if s['home'] == home: edits[edit_of[k][1:]].append(k)
    for (eid, note), ks in sorted(edits.items(), key=lambda kv: min(symbols[k]['at'] for k in kv[1])):
        st = [status(k) for k in sorted(ks, key=lambda k: symbols[k]['at'])]
        same = sum(x.startswith('SAME') for x in st)
        print(f"  [{same}/{len(ks)} same] {note!s:.70}")
        if same or home != 'C':
            for k, x in zip(sorted(ks, key=lambda k: symbols[k]['at']), st):
                s = symbols[k]; print(f"      {s['at']:8.1f} {s['expressionType']:>17}:{s['scope']:<6} wit {''.join(sorted(set(c['copy'] for c in s['carriers']))):<6} del {','.join(deleted_by[k]) or '-'}  {x}")

print('\n== B additions (not deleted) not at the same place')
for k, s in sorted(symbols.items(), key=lambda kv: kv[1]['at']):
    if s['home'] == 'B' and not deleted_by[k] and not status(k).startswith('SAME'):
        print(f"  {s['at']:8.1f} {s['expressionType']:>17}:{s['scope']:<6} {status(k):<24} {edit_of[k][2]!s:.60}")

print('\n== leader, 1370–1500 mm: e-roll holes and symbols')
print('  e-roll:', [(round(h['from'] - m, 1), h['expressionType'], h['scope']) for h in HOLES if 1370 < h['from'] < 1500])
print('  symbols:', [(round(s['at'], 1), s['expressionType'], s['scope'], s['home'], ''.join(sorted(set(c['copy'] for c in s['carriers']))), ','.join(deleted_by[k])) for k, s in sorted(symbols.items(), key=lambda kv: kv[1]['at']) if 1300 < s['at'] < 1500])

# chance: displace C's additions and count same-place hits among holes that A, B and B1 do not explain
explained = {match[k][0] for k, s in symbols.items() if s['home'] in ('A', 'B', 'B1') and k in match}
free = [h for i, h in enumerate(HOLES) if i not in explained]
c_add = {k: s for k, s in symbols.items() if s['home'] == 'C'}
def hits(pool):
    got = greedy(free, pool, m)
    return sum(abs(d) <= EXACT for _, d in got.values())
observed = hits(c_add)
rng = np.random.default_rng(3)
null = []
for _ in range(2000):
    shift = rng.uniform(25, 150, len(c_add)) * rng.choice([-1, 1], len(c_add))
    moved = {k: {**s, 'at': s['at'] + d} for (k, s), d in zip(c_add.items(), shift)}
    symbols.update(moved); null.append(hits(moved)); symbols.update(c_add)
null = np.array(null)
print(f'\nchance: C additions at the same place among free holes: observed {observed}; displaced mean {null.mean():.2f}, p99 {np.percentile(null, 99):.0f}, max {null.max()}, P(null >= observed) = {(null >= observed).mean():.4f}')
