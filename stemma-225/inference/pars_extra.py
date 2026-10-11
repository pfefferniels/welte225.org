"""Parsimony extras: node-penalty (lambda) sweep, root-free symmetric parsimony (rooting test),
and robustness of the parsimony optimum (noise, Ne1 near-readings dropped, redundancy variants)."""
import os, collections, random
import numpy as np
import matrix as MX, trees as T, run as R

HERE = os.path.dirname(os.path.abspath(__file__))
out = open(os.path.join(HERE, 'results_pars_extra.txt'), 'w')


def P(*a):
    s = ' '.join(str(x) for x in a)
    print(s); out.write(s + '\n')


ADM = [t for t in R.ALL if T.ok_systems(t, MX.SYSTEM)]


def scores(chars, G=10, eps=0.25, rootfree=False):
    sc = T.Scorer(chars, MX.COPIES, G=G, eps=eps)
    res = []
    for t in ADM:
        if rootfree:
            c0, c1 = sc.node_costs(t)
            s = float(np.dot(sc.w, np.minimum(c0, c1)))
        else:
            s = sc.score(t) - sc.baseline()
        res.append((s, T.n_hidden(t), T.fmt(t), t))
    return res


def best(res, lam=0.0):
    r = sorted(res, key=lambda x: (x[0] + lam * x[1], x[1], x[2]))
    return r


# 1. lambda sweep (cost per hypothetical node) -------------------------------------------------
for title, opts in [('near5m', dict(bo1='near5m')), ('near5m + Ne1 merge 10mm', dict(bo1='near5m', merge=(10, 'Ne1')))]:
    res = scores(MX.build(**opts))
    P(f'\n== lambda sweep ({title}); cost = losses (+G per extra gain) + lambda * #hidden nodes')
    for lam in [0, 0.5, 1, 2, 3, 4, 6, 10, 20]:
        r = best(res, lam)
        b = r[0][0] + lam * r[0][1]
        second = next(x for x in r[1:] if True)
        P(f'  lambda={lam:4}: {r[0][2]:45s} cost {b:7.2f} hidden {r[0][1]}  runner-up {second[2]} +{second[0] + lam * second[1] - b:.2f}')

# 2. root-free symmetric parsimony: rooting not identifiable ------------------------------------
res = scores(MX.build(bo1='near5m'), G=1, eps=1.0, rootfree=True)
r = best(res)
b = r[0][0]
opt = [x for x in r if abs(x[0] - b) < 1e-9]
P(f'\n== symmetric Wagner parsimony, root state free (no outgroup): optimum {b:.1f}, {len(opt)} trees tie; e.g.')
for x in opt[:12]:
    P('   ', x[2], 'hidden', x[1])
roots = collections.Counter((x[3][0] or '*') + ':' + ','.join(sorted(T.fmt(c) if not c[1] else ('{' + ','.join(sorted(T.descendants_labels(c))) + '}') for c in x[3][1])) for x in opt)
P('   root splits among tied optima:', roots.most_common(10))

# 3. robustness (parsimony, G=10, eps=.25) -----------------------------------------------------
P('\n== robustness of the parsimony optimum (lambda=0, ties -> fewer hidden nodes)')
base = best(scores(MX.build(bo1='near5m')))[0][2]
P('  base optimum:', base)
exps = [('Ne1 near-complement readings -> ? (6.6 mm)', dict(bo1='near5m', ne1_drop_near=6.6)),
        ('Ne1 near-complement readings -> ? (10 mm)', dict(bo1='near5m', ne1_drop_near=10)),
        ('redundancy = all carriers', dict(bo1='near5m', redundancy='all')),
        ('redundancy = none', dict(bo1='near5m', redundancy='none'))]
for title, opts in exps:
    r = best(scores(MX.build(**opts)))
    P(f'  {title}: {r[0][2]}  (margin to next {r[1][0] - r[0][0]:.2f}) editor-like rank:', next(i for i, x in enumerate(r) if x[2] == T.fmt(R.EDITOR)) + 1)
for noise in [0.01, 0.02, 0.05]:
    cnt = collections.Counter()
    for seed in range(20):
        r = best(scores(MX.build(bo1='near5m', noise=noise, seed=seed)))
        cnt[r[0][2]] += 1
    P(f'  noise {noise:.0%} x20 seeds: {cnt.most_common(5)}')
for flip in [0.1, 0.3]:
    cnt = collections.Counter()
    for seed in range(20):
        r = best(scores(MX.build(bo1='near5m', red_flip=flip, seed=seed)))
        cnt[r[0][2]] += 1
    P(f'  redundancy flags flipped at random ({flip:.0%}) x20: {cnt.most_common(5)}')
