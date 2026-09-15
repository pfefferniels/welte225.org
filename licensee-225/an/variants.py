import json
V = json.load(open('versions.json')); P = json.load(open('placed_dp.json')); bars = json.load(open('bars/bars.json'))
bar_of = lambda x: ([b['label'] for b in bars if b['from_mm'] <= x] or ['upbeat'])[-1]
TOL = 8.0
MEASURED = {'S1', 'S2', 'W', 'L', 'G'}

symbols = {}
for v in V['versions']:
    for e in v['edits']:
        for s in e['insert']:
            symbols.setdefault(s['id'], s)
snap_ids = {k: {s['id'] for s in snap} for k, snap in V['snapshots'].items()}

def in_pair(s):
    """Whether both Licensee copies carry the symbol's reading within tolerance."""
    def has(name):
        if s['type'] == 'note':
            return any(n['pitch'] == s['pitch'] and abs(n['x_on'] - s['from']) <= TOL and abs(n['x_off'] - s['to']) <= TOL for n in P[name]['notes'])
        if s['expressionType'].startswith('SustainPedal'):
            kind = 'on' if s['expressionType'].endswith('On') else 'off'
            return any(p['kind'] == kind and abs(p['at'] - s['from']) <= TOL for p in P[name]['pedal'])
        return None
    return has('gourlin'), has('phillipsL')

# Dangling deletions: a version deleting a symbol that is not in its own lineage.
lineage_syms = {}
for v in V['versions']:
    parent = v['parent']
    lineage_syms[v['siglum']] = snap_ids[parent] if parent else set()
dangling = [(v['siglum'], d) for v in V['versions'] for e in v['edits'] for d in e['delete'] if d not in lineage_syms[v['siglum']]]
print('dangling deletions:', len(dangling), [(sig, symbols[d]['home'] if d in symbols else '?', symbols.get(d, {}).get('expressionType') or symbols.get(d, {}).get('pitch'), round(symbols.get(d, {}).get('from', 0), 1)) for sig, d in dangling][:20])

# Every note or sustain-pedal symbol the edition holds whose measured witnesses are not all the copies that could carry it.
rows = []
for s in symbols.values():
    if s['type'] == 'expression' and not s['expressionType'].startswith('SustainPedal'): continue
    if s['type'] == 'expression' and s['home'] == 'D2': continue
    able = MEASURED if s['type'] == 'note' else MEASURED - {'G'}
    wit = set(s['witnesses'])
    if wit >= able: continue
    if s['from'] > 10000: continue
    g, p = in_pair(s)
    versions_with = [k for k in ('A', 'A1', 'B', 'B1', 'C', 'D1', 'D2') if s['id'] in snap_ids[k]]
    rows.append((s['from'], bar_of(s['from']), s['type'] == 'note' and f"note {s['pitch']}" or s['expressionType'], round(s['from'], 1), round(s['to'], 1), ''.join(sorted(wit)), s['home'], ','.join(versions_with), g, p))
rows.sort()
print(f"\n{len(rows)} note/pedal symbols not carried by every able copy")
print('bar   reading              from    to      witnesses  home  in versions        Gourlin Phillips')
for r in rows:
    print(f"{r[1]:>4}  {r[2]:<20} {r[3]:7} {r[4]:7}  {r[5]:<9}  {r[6]:<4}  {r[7]:<18} {str(r[8]):<7} {r[9]}")
