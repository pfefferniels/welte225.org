"""Robustness of the ML/BIC optimum: refit the top-N trees of the exhaustive run (+ named trees) under perturbed
matrices / model variants. usage: python3 ml_robust.py ml_all_near5m.jsonl N"""
import sys, json, os, collections
from multiprocessing import Pool
import matrix as MX, trees as T, run as R
import fastml as ml
from ml_report import tup

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, NTOP = sys.argv[1], int(sys.argv[2])
rows = sorted((json.loads(l) for l in open(SRC)), key=lambda r: r['bic'])
cands = {r['tree']: tup(r['t']) for r in rows[:NTOP]}
for k, t in R.NAMED.items():
    cands[T.fmt(t)] = t
for r in rows[:5000]:   # make sure every unrooted split class among the first 5000 has its best tree included
    pass
import ml_splits_lib as SL
seen = set()
for r in rows:
    k = SL.splits(tup(r['t']))
    if k not in seen:
        seen.add(k); cands[r['tree']] = tup(r['t'])
    if len(seen) >= 60:
        break
PARS = (None, ((None, ((None, ((None, (('Bo1', ()), ('St2', (('Ch1', ()),)))), ('St1', ()))), ('Ne1', ()))), ('Wi1', ())))
cands[T.fmt(PARS)] = PARS
CANDS = list(cands.values())

VARIANTS = [
    ('base (all, near5m)', dict(bo1='near5m'), 'all'),
    ('classes: notes/expressions', dict(bo1='near5m'), 'type'),
    ('classes: notes/expr/redundant expr', dict(bo1='near5m'), 'type+red'),
    ('Bo1 red expr missing', dict(bo1='missing'), 'all'),
    ('Bo1 library substitution 5mm', dict(bo1='subst5'), 'all'),
    ('Ne1 displaced readings merged 10mm', dict(bo1='near5m', merge=(10, 'Ne1')), 'all'),
    ('all displaced pairs merged 10mm', dict(bo1='near5m', merge=(10, 'all')), 'all'),
    ('Ne1 near-complement -> ? (6.6mm)', dict(bo1='near5m', ne1_drop_near=6.6), 'all'),
    ('redundancy flags flipped 30% (type+red), seed 1', dict(bo1='near5m', red_flip=0.3, seed=1), 'type+red'),
    ('redundancy flags flipped 30% (type+red), seed 2', dict(bo1='near5m', red_flip=0.3, seed=2), 'type+red'),
] + [(f'noise {n:.0%} seed {s}', dict(bo1='near5m', noise=n, seed=s), 'all') for n in (0.01, 0.02, 0.05) for s in (1, 2, 3)]


def job(args):
    vi, ti = args
    title, mopt, cls = VARIANTS[vi]
    D = DATA[vi]
    t = CANDS[ti]
    ll, nodes, th = ml.fit(t, D)
    k = ml.n_params(t, D)
    return vi, T.fmt(t), ml.bic(ll, k, D.n), ll


DATA = [ml.Data(MX.build(**m), classes=c) for _, m, c in VARIANTS]

if __name__ == '__main__':
    tasks = [(vi, ti) for vi in range(len(VARIANTS)) for ti in range(len(CANDS))]
    res = collections.defaultdict(list)
    with Pool(4) as pool:
        for vi, tree, b, ll in pool.imap_unordered(job, tasks, chunksize=4):
            res[vi].append((b, tree, ll))
    ed = T.fmt(R.EDITOR)
    edsplits = SL.splits(R.EDITOR)
    byname = {T.fmt(t): t for t in CANDS}
    out = open(os.path.join(HERE, 'results_ml_robust.txt'), 'w')
    out.write(f'{len(CANDS)} candidate trees refitted per variant\n')
    for vi, (title, _, _) in enumerate(VARIANTS):
        r = sorted(res[vi])
        b = r[0][0]
        bestsplits = SL.splits(byname[r[0][1]])
        other = next(x for x in r if SL.splits(byname[x[1]]) != bestsplits)
        nor3 = next(x for x in r if frozenset(['St1', 'Wi1']) not in SL.splits(byname[x[1]]))
        er = next(i for i, x in enumerate(r) if x[1] == ed)
        line = (f'{title:46s} best {r[0][1]:34s} unrooted=editor:{bestsplits == edsplits!s:5s} '
                f'next other unrooted +{other[0] - b:6.2f} ({other[1]}); best w/o r3-split +{nor3[0] - b:6.2f}; editor tree +{r[er][0] - b:.2f}')
        print(line); out.write(line + '\n')
