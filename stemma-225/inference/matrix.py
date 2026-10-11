"""Build the copy x reading character matrix (states '1', '0', '?') from matrix.json.

Blind input only: symbol identities (the editor's collation) + carriers -> copies,
plus copy coverage, tears, and the Bo1 substitution map (bo1map.json).
Nothing from versions/basedOn/edits is used here.
"""
import json, os, collections, random

HERE = os.path.dirname(os.path.abspath(__file__))
MJ = os.environ.get('MATRIX_JSON', 'matrix.json')
M = json.load(open(os.path.join(HERE, MJ)))
BO1MAP = json.load(open(os.path.join(HERE, 'bo1map.json'))) if MJ == 'matrix.json' else {'5': {}, '10': {}}
BO1NEAR = json.load(open(os.path.join(HERE, MJ.replace('matrix', 'bo1near'))))
COPIES = M['copies']  # ['St1','St2','Wi1','Ch1','Bo1','Ne1']
COV = M['coverage']
SYMS = M['symbols']
SYSTEM = {c: COV[c]['system'] for c in COPIES}

# --- crude function keys for expression redundancy -----------------------------------------
OPS = {  # red / Licensee words (T-100 vocabulary shared by Licensee)
    'SlowCrescendoOn': ('crescendo', 'on', True), 'SlowCrescendoOff': ('crescendo', 'off', True),
    'ForzandoOn': ('sforzando', 'on', True), 'ForzandoOff': ('sforzando', 'off', True),
    'MezzoforteOn': ('mezzoforte', 'on', True), 'MezzoforteOff': ('mezzoforte', 'off', True),
    'SustainPedalOn': ('sustain', 'on', False), 'SustainPedalOff': ('sustain', 'off', False),
    'SoftPedalOn': ('soft', 'on', False), 'SoftPedalOff': ('soft', 'off', False),
}


def fkey(s):
    op = OPS.get(s.get('expressionType'))
    if not op:
        return None
    return op[0] + (' ' + s['scope'] if op[2] else '')


def redundancy_in_copy(copy):
    """Crude predicate: in the text of `copy`, an 'on' while the function already stands, or an 'off'
    while it is already off, is ineffective. Returns set of symbol ids that are redundant in that copy."""
    by = collections.defaultdict(list)
    for s in SYMS:
        if s['type'] != 'expression' or copy not in s['copies']:
            continue
        op = OPS.get(s['expressionType'])
        if not op:
            continue
        at = s['carrierPlaces'][copy][0]['from']
        by[fkey(s)].append((at, op[1], s['id']))
    red = set()
    for k, g in by.items():
        g.sort()
        state = 'off'
        for at, sp, sid in g:
            if sp == state:
                red.add(sid)
            state = sp
    return red


REDUNDANT_IN = {c: redundancy_in_copy(c) for c in COPIES if c != 'Bo1'}


def is_redundant(s, mode='any'):
    hits = [c for c in s['copies'] if c in REDUNDANT_IN and s['id'] in REDUNDANT_IN[c]]
    if mode == 'any':
        return bool(hits)
    if mode == 'all':
        reds = [c for c in s['copies'] if c in REDUNDANT_IN]
        return bool(reds) and len(hits) == len(reds)
    return False


def near_complement(s, d, copy='Ne1'):
    """Is there a same-kind reading within d mm whose `copy` state is the opposite? (shift by imprecision)"""
    return s['id'] in NEAR_CACHE.setdefault((d, copy), _near(d, copy))


def _kind(s):
    return ('n', s['pitch']) if s['type'] == 'note' else ('e', s.get('expressionType'), s.get('scope'))


def _near(d, copy):
    by = collections.defaultdict(list)
    for s in SYMS:
        if s.get('from') is not None:
            by[_kind(s)].append(s)
    out = set()
    for k, g in by.items():
        g.sort(key=lambda s: s['from'])
        for i, a in enumerate(g):
            for b in g[i + 1:]:
                if b['from'] - a['from'] > d:
                    break
                if (copy in a['copies']) != (copy in b['copies']):
                    out.add(a['id']); out.add(b['id'])
    return out


NEAR_CACHE = {}


def build(bo1='near5m', margin=3.0, tears=True, ne1_drop_near=None, noise=0.0, seed=0,
          redundancy='any', merge=None, red_flip=0.0):
    """Return list of characters: dict(id, type, states{copy:'1'|'0'|'?'}, redundant(bool))."""
    rng = random.Random(seed)
    chars = []
    st2_tears = COV['St2']['tears']
    for s in SYMS:
        st = {}
        for c in COPIES:
            v = '1' if c in s['copies'] else '0'
            f = s.get('from')
            if v == '0' and f is not None:
                if f < COV[c]['first'] - margin or f > COV[c]['last'] + margin:
                    v = '?'
                if tears and c == 'St2':
                    for t in st2_tears:
                        if t['from'] - margin <= f <= t['to'] + margin:
                            v = '?'
            st[c] = v
        # Bo1 is green: red-vocabulary expressions cannot be carried as such
        if s['type'] == 'expression' and 'Bo1' not in s['copies']:
            if bo1 == 'missing':
                st['Bo1'] = '?'
            elif bo1.startswith('subst'):
                st['Bo1'] = BO1MAP[bo1[5:]].get(s['id'], '?')
            elif bo1.startswith('near'):
                st['Bo1'] = BO1NEAR[bo1[4:]].get(s['id'], '?')
                if st['Bo1'] == '0' and is_redundant(s, 'any'):
                    st['Bo1'] = '?'  # green re-coding cannot carry an ineffective red command
            elif bo1 == 'links':   # the blind collation's green recoding links; else '0' only where no green run is near
                near = BO1NEAR['5m'].get(s['id'], '?')
                st['Bo1'] = '1' if s.get('bo1link') else ('0' if near == '0' and not is_redundant(s, 'any') else '?')
            elif bo1 == 'literal':
                pass
        if ne1_drop_near is not None and near_complement(s, ne1_drop_near):
            st['Ne1'] = '?'
        red = is_redundant(s, redundancy) if redundancy != 'none' else False
        chars.append(dict(id=s['id'], type=s['type'], states=st, redundant=red,
                          frm=s.get('from'), kind=_kind(s)))
    if merge:
        chars = merge_displaced(chars, *merge)
    out = []
    for c in chars:
        st = c['states']
        if noise > 0:
            for x in COPIES:
                if st[x] != '?' and rng.random() < noise:
                    st[x] = '0' if st[x] == '1' else '1'
        if red_flip > 0 and c['type'] == 'expression' and rng.random() < red_flip:
            c['redundant'] = not c['redundant']
        if any(v == '1' for v in st.values()):
            out.append(c)
    return out


def merge_displaced(chars, d, scope='Ne1'):
    """Treat a same-kind reading b lying within d mm of reading a, with disjoint carrying copies, as a displaced
    form of a (one event, e.g. Ne1's imprecise reader or a 'shift'): the copies carrying b are counted as carrying a,
    and b is dropped. scope='Ne1': only b carried by Ne1 alone; 'all': any disjoint pair. Greedy, nearest first."""
    ones = lambda c: {x for x in COPIES if c['states'][x] == '1'}
    by = collections.defaultdict(list)
    for i, c in enumerate(chars):
        if c['frm'] is not None:
            by[c['kind']].append(i)
    pairs = []
    for k, idx in by.items():
        idx.sort(key=lambda i: chars[i]['frm'])
        for x, i in enumerate(idx):
            for j in idx[x + 1:]:
                dd = chars[j]['frm'] - chars[i]['frm']
                if dd > d:
                    break
                a, b = chars[i], chars[j]
                A, B = ones(a), ones(b)
                if A & B:
                    continue
                for (p, q, P, Q) in ((i, j, A, B), (j, i, B, A)):
                    # q is the displaced reading merged into p
                    if scope == 'Ne1' and Q != {'Ne1'}:
                        continue
                    # the copies of q must lack p (not unknown) to be a complementary pair
                    if any(chars[p]['states'][x] != '0' for x in Q):
                        continue
                    if len(Q) > len(P) and scope != 'Ne1':
                        continue  # merge the minority form into the majority one
                    pairs.append((dd, p, q))
    pairs.sort()
    used, dropped = set(), set()
    for dd, p, q in pairs:
        if p in used or q in used:
            continue
        used |= {p, q}
        for x in COPIES:
            if chars[q]['states'][x] == '1':
                chars[p]['states'][x] = '1'
        dropped.add(q)
    return [c for i, c in enumerate(chars) if i not in dropped]


def pattern(st):
    return ''.join(st[c] if st[c] != '0' else '.' for c in COPIES)


if __name__ == '__main__':
    for bo1 in ['missing', 'subst5', 'near5', 'literal']:
        ch = build(bo1=bo1)
        cnt = collections.Counter((pattern(c['states']), c['type']) for c in ch)
        tot = collections.Counter(pattern(c['states']) for c in ch)
        print(f'\n== bo1={bo1}: {len(ch)} characters; order {COPIES}')
        for p, n in tot.most_common():
            print(f'  {p}  {n:4d}  note {cnt[(p, "note")]:4d}  expr {cnt[(p, "expression")]:4d}  redundant {sum(1 for c in ch if pattern(c["states"]) == p and c["redundant"])}')
    print('redundant per copy', {c: len(v) for c, v in REDUNDANT_IN.items()})
