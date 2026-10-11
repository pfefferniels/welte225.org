"""Exhaustive blind stemma search. Usage: python3 run.py [quick]
Writes results_*.txt next to this file."""
import sys, os, json, time, collections
import numpy as np
import matrix as MX
import trees as T

HERE = os.path.dirname(os.path.abspath(__file__))
COPIES = MX.COPIES
SYSTEM = MX.SYSTEM
DATE_RANK = {'St1': 1909, 'Wi1': 1910, 'St2': 1914, 'Ch1': 1916, 'Ne1': 1916, 'Bo1': 1924}

ALL = T.all_trees(COPIES)


def L(x):
    return (x, ())


EDITOR = (None, (L('Wi1'), ('St1', ((None, (('St2', (L('Ch1'), L('Bo1'))), L('Ne1'))),))))
NAMED = {
    'editor': EDITOR,
    'St1 sibling leaf': (None, (L('Wi1'), (None, (L('St1'), (None, (('St2', (L('Ch1'), L('Bo1'))), L('Ne1'))))))),
    'no r3 (Ne1 child of St1)': (None, (L('Wi1'), ('St1', (('St2', (L('Ch1'), L('Bo1'))), L('Ne1'))))),
    'Wi1 = root (no r1)': ('Wi1', (('St1', ((None, (('St2', (L('Ch1'), L('Bo1'))), L('Ne1'))),)),)),
    'St1 = root': ('St1', (L('Wi1'), (None, (('St2', (L('Ch1'), L('Bo1'))), L('Ne1'))))),
    'Ch1,Bo1 sisters under St2 via hidden': (None, (L('Wi1'), ('St1', ((None, (('St2', ((None, (L('Ch1'), L('Bo1'))),)), L('Ne1'))),)))),
    'Bo1 at r3': (None, (L('Wi1'), ('St1', ((None, (('St2', (L('Ch1'),)), L('Ne1'), L('Bo1'))),)))),
    'Ch1 at r3': (None, (L('Wi1'), ('St1', ((None, (('St2', (L('Bo1'),)), L('Ne1'), L('Ch1'))),)))),
    'Ch1+Ne1 Licensee clade': (None, (L('Wi1'), ('St1', ((None, (('St2', (L('Bo1'),)), (None, (L('Ch1'), L('Ne1'))))),)))),
    'Ne1 under St2': (None, (L('Wi1'), ('St1', (('St2', (L('Ch1'), L('Bo1'), L('Ne1'))),)))),
}


def analyze(chars, G=10.0, eps=0.25, lam=0.0, constraints=('systems',), topk=12, trees=None):
    sc = T.Scorer(chars, COPIES, G=G, eps=eps)
    base = sc.baseline()
    res = []
    for t in (trees or ALL):
        if 'systems' in constraints and not T.ok_systems(t, SYSTEM):
            continue
        if 'dates' in constraints and not T.ok_dates(t, DATE_RANK):
            continue
        s = sc.score(t) - base + lam * T.n_hidden(t)
        res.append((round(s, 6), T.n_hidden(t), T.fmt(t), t))
    # tie-break: cost, then fewer hidden nodes (prefer sampled ancestors)
    res.sort(key=lambda r: (r[0], r[1], r[2]))
    named = {}
    for k, t in NAMED.items():
        s = sc.score(t) - base + lam * T.n_hidden(t)
        rank = 1 + sum(1 for r in res if (r[0], r[1]) < (round(s, 6), T.n_hidden(t)))
        named[k] = (round(s, 3), rank)
    return res, named, sc


def report(title, res, named, topk=10, out=None):
    lines = [f'\n=== {title}  ({len(res)} admissible trees)']
    best = res[0][0]
    nbest = sum(1 for r in res if r[0] == best)
    nbest_h = sum(1 for r in res if r[0] == best and r[1] == res[0][1])
    lines.append(f'optimum cost {best:.3f}; trees at optimum cost: {nbest} (with same #hidden: {nbest_h})')
    for i, r in enumerate(res[:topk]):
        lines.append(f'  {i + 1:2d}. {r[0]:9.3f} (+{r[0] - best:6.3f}) hidden={r[1]}  {r[2]}')
    for k, (s, rank) in named.items():
        lines.append(f'  [{k}] cost {s:.3f} (+{s - best:.3f}) rank {rank}')
    txt = '\n'.join(lines)
    print(txt)
    if out:
        out.write(txt + '\n')
    return txt


if __name__ == '__main__':
    t0 = time.time()
    out = open(os.path.join(HERE, 'results_main.txt'), 'w')
    configs = [
        ('A. Bo1 near5m, Dollo G=10, eps=0.25, systems', dict(bo1='near5m'), dict(G=10, eps=0.25)),
        ('A2. as A + Ne1 displaced readings merged (10 mm)', dict(bo1='near5m', merge=(10, 'Ne1')), dict(G=10, eps=0.25)),
        ('A3. as A + all displaced pairs merged (10 mm)', dict(bo1='near5m', merge=(10, 'all')), dict(G=10, eps=0.25)),
        ('B. Bo1 missing for red expr', dict(bo1='missing'), dict(G=10, eps=0.25)),
        ('B2. Bo1 library substitutionsBetween (5 mm)', dict(bo1='subst5'), dict(G=10, eps=0.25)),
        ('C. Bo1 literal (absent)', dict(bo1='literal'), dict(G=10, eps=0.25)),
        ('D. no redundancy discount (eps=1)', dict(bo1='near5m'), dict(G=10, eps=1.0)),
        ('E. redundant losses free (eps=0)', dict(bo1='near5m'), dict(G=10, eps=0.0)),
        ('F. soft Dollo G=2', dict(bo1='near5m'), dict(G=2, eps=0.25)),
        ('G. symmetric Wagner G=1 eps=1', dict(bo1='near5m'), dict(G=1, eps=1.0)),
        ('H. + dates constraint on sampled ancestors', dict(bo1='near5m'), dict(G=10, eps=0.25, constraints=('systems', 'dates'))),
        ('I. NO system constraint', dict(bo1='near5m'), dict(G=10, eps=0.25, constraints=())),
    ]
    if len(sys.argv) > 1 and sys.argv[1] == 'quick':
        configs = configs[:1]
    summary = []
    for title, mopt, aopt in configs:
        chars = MX.build(**mopt)
        res, named, sc = analyze(chars, **aopt)
        report(title, res, named, out=out)
        summary.append((title, res[0][2], res[0][0], res[1][0] - res[0][0]))
    out.write('\nSUMMARY\n' + '\n'.join(f'{a}: {b}  cost {c:.2f} margin {d:.2f}' for a, b, c, d in summary))
    print('time', time.time() - t0)
