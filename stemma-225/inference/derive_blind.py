"""Follow-up A: edit derivation on the blind collation (MATRIX_JSON=matrix_blind.json), compared with the edition via
feature ids (each blind cluster -> the edition symbol sharing most features; blind_mapping.json)."""
import os, json, collections, sys
import matrix as MX, derive as DV
HERE = os.path.dirname(os.path.abspath(__file__))
assert MX.MJ == 'matrix_blind.json'
tr = json.load(open(os.path.join(HERE, 'truth.json')))
tv = {v['siglum']: v for v in tr['versions']}
mp = json.load(open(os.path.join(HERE, 'blind_mapping.json')))
ed_ins = tr['insertedIn']
ed_del = collections.defaultdict(set)
for v in tr['versions']:
    for i in v['del']:
        ed_del[i].add(v['siglum'])
chars = MX.build(bo1='literal')
out = open(os.path.join(HERE, 'results_edits_blind.txt'), 'w')
def P(s):
    print(s); out.write(s + '\n')
tree = DV.EDITOR_TREE if len(sys.argv) < 2 else None
for d in [None, 20, 50]:
    ins, dele = DV.edits(DV.EDITOR_TREE, chars, prefer='absent')
    if d:
        ins, dele = DV.root_edge_polarity(ins, dele, chars, DV.EDITOR_TREE, d=d, refined_only=True)
    my_ins = {i: v for v, l in ins.items() for i in l}
    my_del = collections.defaultdict(set)
    for v, l in dele.items():
        for i in l: my_del[i].add(v)
    agree = sum(1 for c in chars if mp[c['id']]['edSymbol'] and my_ins.get(c['id']) == ed_ins.get(mp[c['id']]['edSymbol']))
    dag = sum(1 for c in chars if mp[c['id']]['edSymbol'] and my_del[c['id']] and my_del[c['id']] == ed_del.get(mp[c['id']]['edSymbol'], set()))
    edd = sum(1 for c in chars if mp[c['id']]['edSymbol'] and ed_del.get(mp[c['id']]['edSymbol']))
    conf = collections.Counter((ed_ins.get(mp[c['id']]['edSymbol'], '-'), my_ins.get(c['id'], '-')) for c in chars
                               if my_ins.get(c['id']) != ed_ins.get(mp[c['id']]['edSymbol']))
    P(f'\n== blind matrix, editor topology, Dollo/MRCA' + (f' + refinement root-edge rule d={d}' if d else ''))
    P(f'clusters {len(chars)}; inserting version agrees with mapped edition symbol: {agree}/{len(chars)}; '
      f'deletion sets agree for {dag} of {edd} clusters the editor deletes somewhere')
    P('per version (mine / editor counts): ' + ', '.join(f'{s} {len(ins.get(s, []))}/{len(tv[s]["ins"])} ins {len(dele.get(s, []))}/{len(tv[s]["del"])} del' for s in ['r1','R1.1','R2','r3','R4','L2','G1','L1']))
    P(f'disagreements (editor -> mine): {conf.most_common(10)}')
