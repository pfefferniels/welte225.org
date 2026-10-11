"""Robustness of the domain-rule combinations (B): noise, redundancy-flag perturbations, Ne1 near-readings, Bo1 coding.
Candidate set = union of the 400 best trees under each rule config on the unperturbed matrix (+ editor tree)."""
import os, sys, collections
import numpy as np
import matrix as MX, rules as RU, trees as T
import ml_splits_lib as SL

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIGS = {
    'k.5 cdev2 lam8': dict(kappa=0.5, cdev=2.0, lam=8),
    'k.5 cdev2 lam4': dict(kappa=0.5, cdev=2.0, lam=4),
    'k.25 cdev1 lam4': dict(kappa=0.25, cdev=1.0, lam=4),
    'k.5 only (lam0)': dict(kappa=0.5),
}
base_chars = MX.build(bo1='near5m')
cand = {}
for name, kw in CONFIGS.items():
    sc = RU.Scorer2(RU.prepare(base_chars), **kw)
    sc_all = sorted(RU.ADM, key=lambda t: (sc.score(t), T.n_hidden(t)))
    for t in sc_all[:400]:
        cand[T.canon(t)] = t
cand[RU.EDC] = RU.EDITOR
CANDS = list(cand.values())
R3 = frozenset(['St1', 'Wi1'])


def classify(t):
    tags = []
    if T.canon(t) == RU.EDC:
        return 'EDITOR'
    s = SL.splits(t)
    tags.append('r3' if R3 in s else 'no-r3')
    st1 = next(n for n in _nodes(t) if n[0] == 'St1')
    tags.append('St1-anc' if st1[1] else 'St1-leaf')
    return '+'.join(tags)


def _nodes(t):
    yield t
    for c in t[1]:
        yield from _nodes(c)


out = open(os.path.join(HERE, os.environ.get('OUTNAME', 'results_rules_robust.txt')), 'w')


def P(s):
    print(s, flush=True); out.write(s + '\n'); out.flush()


P(f'{len(CANDS)} candidate trees')
exps = [('base', dict(bo1='near5m'), 1), ('Bo1 red expr missing', dict(bo1='missing'), 1),
        ('Bo1 library subst', dict(bo1='subst5'), 1), ('redundancy=none', dict(bo1='near5m', redundancy='none'), 1),
        ('redundancy=all carriers', dict(bo1='near5m', redundancy='all'), 1),
        ('Ne1 near-compl -> ? 6.6mm', dict(bo1='near5m', ne1_drop_near=6.6), 1),
        ('Ne1 displaced merged 10mm', dict(bo1='near5m', merge=(10, 'Ne1')), 1)]
exps += [(f'noise {n:.0%}', dict(bo1='near5m', noise=n), 20) for n in (0.01, 0.02, 0.05)]
exps += [(f'redundancy flags flipped {f:.0%}', dict(bo1='near5m', red_flip=f), 20) for f in (0.1, 0.3)]
for name, kw in CONFIGS.items():
    P(f'\n== rule config {name}')
    for title, mopt, reps in exps:
        cnt = collections.Counter()
        margins = []
        for seed in range(reps):
            chars = MX.build(seed=seed, **mopt)
            sc = RU.Scorer2(RU.prepare(chars), **kw)
            res = sorted(((sc.score(t), T.n_hidden(t), t) for t in CANDS), key=lambda r: (r[0], r[1]))
            cnt[classify(res[0][2])] += 1
            if T.canon(res[0][2]) == RU.EDC:
                margins.append(res[1][0] - res[0][0])
        mtxt = f'; margin to runner-up when editor: median {np.median(margins):.2f} min {min(margins):.2f}' if margins else ''
        P(f'  {title:30s} x{reps:2d}: {dict(cnt)}{mtxt}')
