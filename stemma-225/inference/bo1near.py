"""Nearest-match mapping of Bo1's green held commands onto red/Licensee on/off readings (version-independent).
Each green held run (chain gap 3 mm) claims the NEAREST red 'on' of the same function within tol of its start
and the NEAREST red 'off' within tol of its end -> Bo1 state '1'. Other red on/off readings of that function within
tol of a run end -> '?' (ambiguous alternatives); red readings with no green run of that function near -> '0'.
Redundant readings (no latched interval) -> '?'."""
import json, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
MJ = os.environ.get('MATRIX_JSON', 'matrix.json')
M = json.load(open(os.path.join(HERE, MJ)))
S = M['symbols']
GREEN = {'Crescendo': ('crescendo', True), 'SforzandoForte': ('sforzando', True), 'SforzandoPiano': ('sforzando', True),
         'SustainPedal': ('sustain', False), 'SoftPedal': ('soft', False), 'Mezzoforte': ('mezzoforte', True)}
RED = {'SlowCrescendo': 'crescendo', 'Forzando': 'sforzando', 'SustainPedal': 'sustain', 'SoftPedal': 'soft', 'Mezzoforte': 'mezzoforte'}
SIDED = {'crescendo': True, 'sforzando': True, 'mezzoforte': True, 'sustain': False, 'soft': False}
def redkey(s):
    t = s['expressionType']
    for p, f in RED.items():
        if t == p + 'On': return f + (' ' + s['scope'] if SIDED[f] else ''), 'on'
        if t == p + 'Off': return f + (' ' + s['scope'] if SIDED[f] else ''), 'off'
    return None, None
def build(tol=5.0, gap=3.0, piano=True, margin=3.0):
    g = collections.defaultdict(list)
    for s in S:
        if s['type'] == 'expression' and 'Bo1' in s['copies'] and s['expressionType'] in GREEN:
            if not piano and s['expressionType'] == 'SforzandoPiano': continue
            f, sided = GREEN[s['expressionType']]
            g[f + (' ' + s['scope'] if sided else '')].append((s['from'], s['to']))
    runs = collections.defaultdict(list)
    for k, lst in g.items():
        lst.sort()
        for a, b in lst:
            if runs[k] and a - runs[k][-1][1] <= gap: runs[k][-1][1] = max(runs[k][-1][1], b)
            else: runs[k].append([a, b])
    reds = collections.defaultdict(lambda: {'on': [], 'off': []})
    for s in S:
        if s['type'] == 'expression' and 'Bo1' not in s['copies']:
            k, sp = redkey(s)
            if k: reds[k][sp].append(s)
    state = {}
    for k, d in reds.items():
        for sp, lst in d.items():
            ends = [r[0] if sp == 'on' else r[1] for r in runs.get(k, [])]
            chosen, near = set(), set()
            for e in ends:
                cand = [(abs(s['from'] - e), s['id']) for s in lst if abs(s['from'] - e) <= tol]
                if cand:
                    cand.sort()
                    if len(cand) > 1 and cand[1][0] - cand[0][0] < margin:
                        near |= {c[1] for c in cand}   # two alternative red readings: ambiguous
                    else:
                        chosen.add(cand[0][1]); near |= {c[1] for c in cand[1:]}
            for s in lst:
                if s['id'] in chosen: state[s['id']] = '1'
                elif s['id'] in near: state[s['id']] = '?'
                else:
                    # Bo1 holds that function across this place? then this red on/off is not answered -> '?' (inside a run)
                    inside = any(r[0] - tol <= s['from'] <= r[1] + tol for r in runs.get(k, []))
                    state[s['id']] = '?' if inside else '0'
    return state
if __name__ == '__main__':
    out = {}
    for tol in (3, 5, 8):
        for piano in (True, False):
            for mg in (0.0, 3.0):
                st = build(tol=tol, piano=piano, margin=mg)
                out[f'{tol}{"" if piano else "np"}{"m" if mg else ""}'] = st
                print(tol, piano, mg, collections.Counter(st.values()))
    json.dump(out, open(os.path.join(HERE, MJ.replace('matrix', 'bo1near')), 'w'))
