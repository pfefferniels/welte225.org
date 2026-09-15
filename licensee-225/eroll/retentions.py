"""Where B moves or strikes a punch of A, does Phillips's reading show A's punch or B's, and how often would chance put a punch there."""
import json, collections
import numpy as np

BASE = '/private/tmp/claude-501/-Users-nielspfeffer-Projects-measuring-early-records/b3fcaa9b-5098-45c5-9d78-739ba6a01268/scratchpad/eroll/'
P = [p for p in json.load(open(BASE + 'placed.json')) if p['type'] == 'expression']
V = json.load(open(BASE + 'versions.json'))
OFF = 1.0
SAME = 3.3
kind = lambda s: (s['expressionType'], s['scope'])
place = lambda s: next((c['from'] for c in s['carriers'] if c['copy'] in ('S2', 'S1', 'W')), s['from'])
ver = {v['siglum']: v for v in V['versions']}
inserted = {s['id']: s for v in V['versions'] if v['siglum'] != 'D2' for e in v['edits'] for s in e['insert'] if s['type'] == 'expression'}
edit_of_deletion = {d: e for e in ver['B']['edits'] for d in e['delete']}
b_text = {s['id']: s for s in V['snapshots']['B'] if s['type'] == 'expression'}
holes = [(p['from'] - OFF, kind(p)) for p in P]
near = lambda x, k: [h for h in holes if h[1] == k and abs(h[0] - x) <= SAME]

rows = []
for d, e in edit_of_deletion.items():
    s = inserted.get(d)
    if not s or s['home'] != 'A': continue
    keeps_a = bool(near(place(s), kind(s)))
    follows_b = any(near(place(x), kind(x)) for x in e['insert'] if x['type'] == 'expression' and kind(x) == kind(s))
    rows.append((place(s), s, e, keeps_a, follows_b))
rows.sort(key=lambda r: r[0])
states = collections.Counter('both' if a and b else 'A' if a else 'B' if b else 'neither' for _, _, _, a, b in rows)
print(f'{len(rows)} punches of A that B moves or strikes; the reading shows: {dict(states)}')
for at, s, e, a, b in rows:
    if a:
        print(f"  A's punch kept at {at:7.1f} {s['expressionType']}:{s['scope']} (witnesses {''.join(s['witnesses'])}); "
              f"B's edit {e.get('motivation')} inserts {[(x['expressionType'], round(place(x), 1)) for x in e['insert'] if x['type'] == 'expression']}, "
              f"B's punch on the reading too: {b}")

explained = set()
for s in b_text.values():
    explained.update([i for i, h in enumerate(holes) if h[1] == kind(s) and abs(h[0] - place(s)) <= SAME][:1])
free = [h for i, h in enumerate(holes) if i not in explained]
targets = [(place(r[1]), kind(r[1])) for r in rows]
hits = lambda shift: sum(1 for x, k in targets if any(h[1] == k and abs(h[0] + shift - x) <= SAME for h in free))
rng = np.random.default_rng(7)
null = [hits(rng.choice([-1, 1]) * rng.uniform(25, 150)) for _ in range(1000)]
print(f'chance: {len(free)} punches of the reading that B\'s text does not explain, displaced by 25 to 150 mm, '
      f'hit these places {np.mean(null):.2f} times on average, p99 {np.percentile(null, 99):.0f}, max {max(null)}; observed {hits(0.0)}')
