"""Step 4: derive per-version edit lists from a stemma (Sankoff/Dollo reconstruction: insertion at the MRCA of the
carriers, deletion at maximal lacking subtrees), then compare with the editor's edits (truth.json, comparison only).
usage: python3 derive.py"""
import json, os, collections, sys
import numpy as np
import matrix as MX

HERE = os.path.dirname(os.path.abspath(__file__))
INF = 1e9

# editor's topology with sigla as node names (hidden nodes named r1, r3)
def N(name, label, *children):
    return dict(name=name, label=label, children=list(children))

EDITOR_TREE = N('r1', None,
                N('R1.1', 'Wi1'),
                N('R2', 'St1',
                  N('r3', None,
                    N('R4', 'St2', N('L2', 'Ch1'), N('G1', 'Bo1')),
                    N('L1', 'Ne1'))))


def reconstruct(tree, st, G=10.0, loss=1.0, prefer='present'):
    """Sankoff with gain G (incl. presence at root) and loss cost; returns {node name: 0/1}."""
    def up(n):
        lab = n['label']
        c = [0.0, 0.0]
        if lab:
            if st[lab] == '1': c[0] = INF
            if st[lab] == '0': c[1] = INF
        n['_kids'] = [up(k) for k in n['children']]
        for k0, k1 in n['_kids']:
            c[0] += min(k0, k1 + G)
            c[1] += min(k1, k0 + loss)
        n['_c'] = c
        return c
    up(tree)
    out = {}

    def down(n, parent_state):
        c0, c1 = n['_c']
        if parent_state is None:
            a0, a1 = c0, c1 + G
        elif parent_state == 0:
            a0, a1 = c0, c1 + G
        else:
            a0, a1 = c0 + loss, c1
        s = 1 if (a1 < a0 or (a1 == a0 and prefer == 'present')) else 0
        out[n['name']] = s
        for k in n['children']:
            down(k, s)
    down(tree, None)
    return out


def edits(tree, chars, G=10.0, eps=0.25, prefer='present'):
    ins, dele = collections.defaultdict(list), collections.defaultdict(list)
    parent = {}

    def walk(n, p):
        parent[n['name']] = p
        for k in n['children']:
            walk(k, n['name'])
    walk(tree, None)
    for c in chars:
        s = reconstruct(tree, c['states'], G, eps if c['redundant'] else 1.0, prefer)
        for name, v in s.items():
            pv = s[parent[name]] if parent[name] else 0
            if v == 1 and pv == 0: ins[name].append(c['id'])
            if v == 0 and pv == 1: dele[name].append(c['id'])
    return ins, dele


def compare(ins, dele, title, out):
    tr = json.load(open(os.path.join(HERE, 'truth.json')))
    tv = {v['siglum']: v for v in tr['versions']}
    lines = [f'\n== {title}', f'{"version":8s} {"ins(mine)":>9s} {"ins(ed)":>8s} {"same":>5s}   {"del(mine)":>9s} {"del(ed)":>8s} {"same":>5s}']
    for sg in ['r1', 'R1.1', 'R2', 'r3', 'R4', 'L2', 'G1', 'L1', 'r5']:
        mi, md = set(ins.get(sg, [])), set(dele.get(sg, []))
        ei, ed = set(tv[sg]['ins']), set(tv[sg]['del'])
        lines.append(f'{sg:8s} {len(mi):9d} {len(ei):8d} {len(mi & ei):5d}   {len(md):9d} {len(ed):8d} {len(md & ed):5d}')
    # per-symbol agreement on the inserting version
    ed_ins = tr['insertedIn']
    my_ins = {i: v for v, l in ins.items() for i in l}
    agree = sum(1 for i, v in ed_ins.items() if my_ins.get(i) == v)
    conf = collections.Counter((ed_ins[i], my_ins.get(i, '-')) for i in ed_ins if my_ins.get(i) != ed_ins[i])
    lines.append(f'symbols whose inserting version agrees: {agree}/{len(ed_ins)}; disagreements (editor -> mine): {conf.most_common(12)}')
    txt = '\n'.join(lines)
    print(txt)
    out.write(txt + '\n')
    return conf


if __name__ == '__main__':
    out = open(os.path.join(HERE, 'results_edits.txt'), 'w')
    for bo1 in ['literal', 'near5m']:
        chars = MX.build(bo1=bo1)
        for prefer in ['present', 'absent']:
            ins, dele = edits(EDITOR_TREE, chars, prefer=prefer)
            compare(ins, dele, f'editor topology, Bo1={bo1}, Dollo G=10 eps=.25, ties->{prefer}', out)


def from_tuple(t, names):
    """nested-tuple tree -> dict tree; node name = siglum from `names` (copy -> siglum) or h<i> for hidden."""
    cnt = [0]

    def rec(n):
        lab, ch = n
        if lab:
            name = names.get(lab, lab)
        else:
            name = f'h{cnt[0]}'; cnt[0] += 1
        return N(name, lab, *[rec(c) for c in ch])
    return rec(t)


def root_edge_polarity(ins, dele, chars, tree, d=20.0, refined_only=True):
    """Rule for readings on the root edge (MRCA = the copy on one side of the root, e.g. Wi1-only): Dollo puts them
    as insertions of that side. Alternative rule ('moved/cleaned by the other side'): if the reading is redundant
    (crude predicate) or a same-kind reading lies within d mm that the other side carries and this side lacks,
    treat it as a root (base-text) reading deleted by the other side."""
    root = tree['name']
    kids = tree['children']
    if len(kids) != 2:
        return ins, dele
    byid = {c['id']: c for c in chars}
    bykind = collections.defaultdict(list)
    for c in chars:
        if c['frm'] is not None:
            bykind[c['kind']].append(c)
    def labels(n):
        s = {n['label']} if n['label'] else set()
        for k in n['children']:
            s |= labels(k)
        return s
    ins = {k: list(v) for k, v in ins.items()}; dele = {k: list(v) for k, v in dele.items()}
    # refinement: the side whose copies carry more dynamic (expression) readings on average is the later one;
    # only readings unique to the less refined side are re-assigned to the base text
    def density(n):
        L = [x for x in labels(n) if MX.SYSTEM[x] == 'welte-t100']
        return np.mean([sum(1 for c in chars if c['type'] == 'expression' and c['states'][x] == '1') for x in L]) if L else 0
    pairs = ((kids[0], kids[1]), (kids[1], kids[0]))
    if refined_only:
        pairs = [p for p in pairs if density(p[0]) < density(p[1])]
    for side, other in pairs:
        A, B = labels(side), labels(other)
        moved = []
        for i in ins.get(side['name'], []):
            c = byid[i]
            if c['frm'] is None:
                continue
            near = any(o['id'] != i and abs(o['frm'] - c['frm']) <= d
                       and any(o['states'][x] == '1' for x in B) and not any(o['states'][x] == '1' for x in A)
                       for o in bykind[c['kind']])
            if c['redundant'] or near:
                moved.append(i)
        for i in moved:
            ins[side['name']].remove(i)
            ins.setdefault(root, []).append(i)
            dele.setdefault(other['name'], []).append(i)
    return ins, dele


if __name__ == '__main__':
    for d in [5, 10, 20, 30]:
        chars = MX.build(bo1='literal')
        ins, dele = edits(EDITOR_TREE, chars, prefer='absent')
        ins, dele = root_edge_polarity(ins, dele, chars, EDITOR_TREE, d=d)
        compare(ins, dele, f'editor topology, Bo1=literal, + root-edge rule SYMMETRIC (moved within {d} mm or redundant -> r1, deleted by other side)', out)
    for d in [5, 10, 20, 30, 50]:
        chars = MX.build(bo1='literal')
        ins, dele = edits(EDITOR_TREE, chars, prefer='absent')
        ins, dele = root_edge_polarity(ins, dele, chars, EDITOR_TREE, d=d, refined_only=True)
        compare(ins, dele, f'editor topology, Bo1=literal, + root-edge rule REFINEMENT-directed (Wi1-only moved within {d} mm or redundant -> r1, deleted by R2)', out)
