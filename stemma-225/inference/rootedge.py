"""Follow-up C: sensitivity of the edit assignment to the root-edge window d, and the base rate of coincidental
same-kind neighbours (random-shift null)."""
import json, os, io, collections, random
import numpy as np
import matrix as MX, derive as DV

HERE = os.path.dirname(os.path.abspath(__file__))
tr = json.load(open(os.path.join(HERE, 'truth.json')))
tv = {v['siglum']: v for v in tr['versions']}
chars = MX.build(bo1='literal')
byid = {c['id']: c for c in chars}
ins0, del0 = DV.edits(DV.EDITOR_TREE, chars, prefer='absent')
# Wi1-side candidates: Dollo puts them into R1.1; the rule may move them to r1 (+ R2 deletion)
cand = [byid[i] for i in ins0['R1.1']]
cand_nr = [c for c in cand if not c['redundant']]
ed_r1 = set(tv['r1']['ins'])
other = [c for c in chars if c['frm'] is not None and any(c['states'][x] == '1' for x in ('St1', 'St2', 'Ch1', 'Ne1', 'Bo1'))
         and c['states']['Wi1'] != '1']
by = collections.defaultdict(list)
for c in other:
    by[c['kind']].append(c['frm'])
for k in by:
    by[k] = np.sort(np.array(by[k]))
lo, hi = min(c['frm'] for c in chars if c['frm']), max(c['frm'] for c in chars if c['frm'])


def has_nb(kind, at, d):
    a = by.get(kind)
    if a is None or not len(a):
        return False
    i = np.searchsorted(a, at)
    return any(0 <= j < len(a) and abs(a[j] - at) <= d for j in (i - 1, i))


rng = random.Random(0)
shifts = [rng.choice([-1, 1]) * rng.uniform(100, 1500) for _ in range(300)]
out = open(os.path.join(HERE, 'results_rootedge.txt'), 'w')


def P(s):
    print(s); out.write(s + '\n')


P(f'{len(cand)} readings Dollo assigns to R1.1 (Wi1-side), {len(cand) - len(cand_nr)} of them redundant (moved by the '
  f'redundancy clause at any d); editor: {sum(1 for c in cand if c["id"] in ed_r1)} of them in r1.')
P(f'{"d mm":>5s} | ins agree /1428 | del agree /655 | R1.1 ins | R2 del | rule hits (non-red.) | of which editor r1 | '
  f'null: expected coincidental hits (rate)')
for d in [5, 20, 30, 42, 50, 60, 100]:
    ins, dele = DV.root_edge_polarity(ins0, del0, chars, DV.EDITOR_TREE, d=d, refined_only=True)
    my_ins = {i: v for v, l in ins.items() for i in l}
    agree = sum(1 for i, v in tr['insertedIn'].items() if my_ins.get(i) == v)
    dagree = sum(len(set(dele.get(s, [])) & set(tv[s]['del'])) for s in tv)
    hits = [c for c in cand_nr if has_nb(c['kind'], c['frm'], d)]
    hit_ed = sum(1 for c in hits if c['id'] in ed_r1)
    rates = []
    for sh in shifts:
        n = 0
        for c in cand_nr:
            at = c['frm'] + sh
            if at < lo: at += hi - lo
            if at > hi: at -= hi - lo
            n += has_nb(c['kind'], at, d)
        rates.append(n / len(cand_nr))
    r = float(np.mean(rates))
    P(f'{d:5d} | {agree:15d} | {dagree:14d} | {len(ins.get("R1.1", [])):8d} | {len(dele.get("R2", [])):6d} | '
      f'{len(hits):20d} | {hit_ed:18d} | {r * len(cand_nr):6.1f} of {len(cand_nr)} ({r:.0%})')
