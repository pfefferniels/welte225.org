import json, collections
doc = json.load(open('/Users/nielspfeffer/Projects/welte225.org/edition.jsonld'))
SHORT = {'d229954b': 'S1', '88460599': 'S2', 'a7ff95b7': 'W', '6e1ce072': 'L', '9ae56c3e': 'G'}
def features_of(c):
    """Every feature the copy states, whichever act brought it about."""
    acts = [c.get('production') or {}] + (c.get('modifications') or [])
    return [f for a in acts for f in (a.get('produced') or []) + (a.get('added') or [])]

feat_copy = {f['@id']: SHORT.get(c['@id'][:8], c['@id'][:8]) for c in doc['copies'] for f in features_of(c)}
feat = {f['@id']: f for c in doc['copies'] for f in features_of(c)}
V = {v['@id']: v for v in doc['versions']}
by_sig = {v['siglum']: v for v in doc['versions']}
parent = lambda v: V.get(v['basedOn'][0]['@id']) if v.get('basedOn') else None
WITNESS = {'W': 'A1', 'S1': 'B1', 'S2': 'C', 'L': 'D1', 'G': 'D2'}
def lineage(v):
    out = []
    while v: out.insert(0, v); v = parent(v)
    return out
def snapshot(v):
    struck, kept = set(), {}
    for x in lineage(v):
        for e in x.get('edits', []):
            for d in e.get('delete', []): struck.add(d)
            for s in e.get('insert', []): kept[s['@id']] = s
    return {i: s for i, s in kept.items() if i not in struck}
sym_home = {s['@id']: v['siglum'] for v in doc['versions'] for e in v.get('edits', []) for s in e.get('insert', [])}
sym = {s['@id']: s for v in doc['versions'] for e in v.get('edits', []) for s in e.get('insert', [])}
pos = lambda s: sum(feat[c['@id']]['horizontal']['from'] for c in s.get('carriers', []) if c['@id'] in feat) / max(1, len([c for c in s.get('carriers', []) if c['@id'] in feat]))
label = lambda s: (f"note {s['pitch']}" if s['@type'] == 'note' else f"{s['expressionType']}:{s.get('scope')}") + f" @{pos(s):.1f} [{''.join(sorted({feat_copy.get(c['@id'], '?') for c in s.get('carriers', [])}))}]"
descendants = lambda sig: {x['siglum'] for x in doc['versions'] if sig in [y['siglum'] for y in lineage(x)]}

issues = collections.defaultdict(list)
for v in doc['versions']:
    p = parent(v); base = snapshot(p) if p else {}
    mot_ids = {m['@id'] for m in v.get('motivations', [])}
    used = set()
    seen_ins = set()
    for e in v.get('edits', []):
        if not e.get('insert') and not e.get('delete'): issues['empty edit'].append((v['siglum'], e['@id']))
        if e.get('motivation'):
            used.add(e['motivation'])
            if e['motivation'] not in mot_ids: issues['motivation not defined'].append((v['siglum'], e['motivation']))
        for d in e.get('delete', []):
            if d not in base: issues['dangling deletion'].append((v['siglum'], e.get('motivation'), sym_home.get(d, '?'), label(sym[d]) if d in sym else d))
        for s in e.get('insert', []):
            if s['@id'] in base or s['@id'] in seen_ins: issues['duplicate insertion'].append((v['siglum'], label(s)))
            seen_ins.add(s['@id'])
            wits = {feat_copy.get(c['@id'], '?') for c in s.get('carriers', [])}
            ok = {WITNESS[w] for w in wits if w in WITNESS}
            if wits and not any(sig in descendants(v['siglum']) for sig in ok):
                issues['inserted where no witness descends'].append((v['siglum'], label(s)))
    for m in mot_ids - used: issues['motivation unused'].append((v['siglum'], m))
# redundancies of latched functions per version
for v in doc['versions']:
    snap = sorted(snapshot(v).values(), key=pos)
    state = {}
    for s in snap:
        t = s.get('expressionType') or ''
        if not (t.endswith('On') or t.endswith('Off')): continue
        fn = (t[:-2] if t.endswith('On') else t[:-3], s.get('scope'))
        kind = 'On' if t.endswith('On') else 'Off'
        if state.get(fn) == kind: issues[f'redundancy in {v["siglum"]}'].append(label(s))
        state[fn] = kind
# duplicate simultaneous notes of one pitch in a version
for v in doc['versions']:
    notes = sorted([s for s in snapshot(v).values() if s['@type'] == 'note'], key=pos)
    for a in notes:
        for b in notes:
            if a['@id'] < b['@id'] and a['pitch'] == b['pitch']:
                fa = [feat[c['@id']]['horizontal'] for c in a['carriers'] if c['@id'] in feat]; fb = [feat[c['@id']]['horizontal'] for c in b['carriers'] if c['@id'] in feat]
                if fa and fb and min(x['to'] for x in fa) > max(y['from'] for y in fb) and min(y['to'] for y in fb) > max(x['from'] for x in fa):
                    issues[f'overlapping same-pitch notes in {v["siglum"]}'].append((label(a), label(b)))
for k, rows in issues.items():
    print(f'\n## {k}: {len(rows)}')
    for r in rows[:70]: print('  ', r)
