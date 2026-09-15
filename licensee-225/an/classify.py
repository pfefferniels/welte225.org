import json, collections
exec(open('audit.py').read().split('issues = collections.defaultdict')[0])   # reuse loaders: doc, feat, V, snapshot, sym, sym_home, pos, label

def fn_of(s):
    t = s.get('expressionType') or ''
    if t.endswith('On'): return (t[:-2], s.get('scope')), 'On'
    if t.endswith('Off'): return (t[:-3], s.get('scope')), 'Off'
    return None, None

def neighbours(snap, s):
    fn, kind = fn_of(s)
    seq = sorted([x for x in snap.values() if fn_of(x)[0] == fn and x['@id'] != s['@id']], key=pos)
    before = [x for x in seq if pos(x) < pos(s)]
    after = [x for x in seq if pos(x) > pos(s)]
    return (before[-1] if before else None), (after[0] if after else None)

A = by_sig['A']; snapA = snapshot(A)
rows = []
for v in doc['versions']:
    p = parent(v); base = snapshot(p) if p else {}
    for e in v.get('edits', []):
        for d in e.get('delete', []):
            if d in base: continue
            s = sym[d]; fn, kind = fn_of(s)
            prev, nxt = neighbours(snapA, s) if fn else (None, None)
            pk = fn_of(prev)[1] if prev else None; nk = fn_of(nxt)[1] if nxt else None
            if fn is None: verdict = 'not latched'
            elif pk == kind: verdict = 'CREATES redundancy in A'
            elif nk is not None and nk != kind and (pk is None or pk != kind): verdict = 'RESOLVES redundancy in A (rule 3)'
            else: verdict = 'neutral'
            # shift partner: an insertion of the same function and kind in the same edit
            partners = [x for x in e.get('insert', []) if fn_of(x) == (fn, kind)]
            partner = min(partners, key=lambda x: abs(pos(x) - pos(s))) if partners else None
            rows.append(dict(version=v['siglum'], motivation=e.get('motivation'), edit=e['@id'], reading=label(s), verdict=verdict,
                             prev=label(prev) if prev else None, next=label(nxt) if nxt else None,
                             partner=(label(partner), round(pos(partner) - pos(s), 1)) if partner else None))
json.dump(rows, open('dangling_classified.json', 'w'), indent=1)
for verdict in sorted({r['verdict'] for r in rows}):
    group = [r for r in rows if r['verdict'] == verdict]
    print(f"\n## {verdict}: {len(group)}")
    for r in sorted(group, key=lambda r: float(r['reading'].split('@')[1].split()[0])):
        print(f"  {r['version']} [{r['motivation']}] {r['reading']}\n      A before: {r['prev']}\n      A after:  {r['next']}\n      shift partner in same edit: {r['partner']}")

# Every edit that holds a dangling deletion, with what would remain
print('\n## edits holding dangling deletions')
for v in doc['versions']:
    p = parent(v); base = snapshot(p) if p else {}
    for e in v.get('edits', []):
        dang = [d for d in e.get('delete', []) if d not in base]
        if not dang: continue
        valid = [d for d in e.get('delete', []) if d in base]
        print(f"  {v['siglum']} [{e.get('motivation')}] insert {len(e.get('insert', []))}, valid deletes {len(valid)}, dangling {len(dang)}")
