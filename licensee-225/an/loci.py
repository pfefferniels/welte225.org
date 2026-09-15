import json, collections
exec(open('audit.py').read().split('issues = collections.defaultdict')[0])
bars = json.load(open('bars/bars.json'))
bar_of = lambda x: ([b['label'] for b in bars if b['from_mm'] <= x] or ['upbeat'])[-1]
wit = lambda s: ''.join(sorted({feat_copy.get(c['@id'], '?') for c in s.get('carriers', [])}))
def fn_of(s):
    t = s.get('expressionType') or ''
    if t.endswith('On'): return (t[:-2], s.get('scope')), 'On'
    if t.endswith('Off'): return (t[:-3], s.get('scope')), 'Off'
    return (t, s.get('scope')), None
A, B = by_sig['A'], by_sig['B']
snapA = snapshot(A)
base_B = snapshot(A)
dangling = [(e, d) for e in B.get('edits', []) for d in e.get('delete', []) if d not in base_B]
w_only = [sym[d] for _, d in dangling]
edit_of = {d: e for e, d in dangling}
b_ins = [(e, s) for e in B.get('edits', []) for s in e.get('insert', [])]
clusters = collections.defaultdict(list)
for s in sorted(w_only, key=pos):
    fn = fn_of(s)[0]
    if clusters[fn] and pos(s) - pos(clusters[fn][-1][-1]) < 90: clusters[fn][-1].append(s)
    else: clusters[fn].append([s])
def redundancies(seq):
    n, state = 0, None
    for s in sorted(seq, key=pos):
        k = fn_of(s)[1]
        if k and k == state: n += 1
        state = k
    return n
rows = []
for fn, groups in clusters.items():
    for g in groups:
        lo, hi = pos(g[0]), pos(g[-1])
        seqA = [x for x in snapA.values() if fn_of(x)[0] == fn]
        before = [x for x in seqA if pos(x) < lo]; after = [x for x in seqA if pos(x) > hi]
        ctx = ([sorted(before, key=pos)[-1]] if before else []) + ([sorted(after, key=pos)[0]] if after else [])
        partners = sorted([s for e, s in b_ins if fn_of(s)[0] == fn and lo - 60 <= pos(s) <= hi + 60 and 'W' not in wit(s)], key=pos)
        r_without = redundancies(ctx); r_with = redundancies(ctx + g)
        kinds_w = [fn_of(s)[1] for s in g]; kinds_b = [fn_of(s)[1] for s in partners]
        one_to_one = len(g) == len(partners) and kinds_w == kinds_b
        if fn[0] == 'SoftPedal': verdict = 'decided (soft pedal)'
        elif fn_of(g[0])[1] is None: verdict = 'not latched'
        elif one_to_one: verdict = 'SHIFT: B moved each reading'
        elif r_with < r_without: verdict = 'RULE 3: resolves a redundancy of A'
        elif partners: verdict = 'PARTIAL: B has other commands here'
        else: verdict = 'ADDITION in A1 (no counterpart in B)'
        mots = sorted({str(edit_of[s['@id']].get('motivation')) for s in g})
        rows.append((lo, bar_of(lo), fn, [f"{fn_of(s)[1]} {pos(s):.1f}" for s in g], [f"{fn_of(s)[1]} {pos(s):.1f}" for s in partners], f"A context {[f'{fn_of(x)[1]} {pos(x):.1f}' for x in ctx]}, redundancies {r_without} → {r_with} with W's", verdict, mots))
rows.sort()
for r in rows:
    print(f"bar {r[1]:>4} {r[2][0]}:{r[2][1]:<7} W {r[3]}\n            B {r[4]}\n            {r[5]}\n            → {r[6]}   motivations {r[7]}")
print(collections.Counter(r[6] for r in rows))
print('readings per verdict:', {v: sum(len(r[3]) for r in rows if r[6] == v) for v in {r[6] for r in rows}})
