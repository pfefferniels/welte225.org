"""Grid over the domain rules (B i, ii, iv) and lambda; exhaustive over the 22,472 admissible trees.
usage: python3 rules_run.py [out] ; env MATRIX_JSON selects the matrix, BO1 the Bo1 treatment."""
import sys, os, json, itertools, pickle
import numpy as np
import matrix as MX, rules as RU, trees as T
import ml_splits_lib as SL

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else 'results_rules.txt'
BO1 = os.environ.get('BO1', 'near5m')
chars = MX.build(bo1=BO1)
preps = {'readings': RU.prepare(chars), 'units': RU.prepare(chars, units=True),
         'units+orphan': RU.prepare(chars, units=True, orphan=True)}
H = np.array([T.n_hidden(t) for t in RU.ADM])
CAN = [T.canon(t) for t in RU.ADM]
SPL = [SL.splits(t) for t in RU.ADM]
EDI = CAN.index(RU.EDC)
FMT = [T.fmt(t) for t in RU.ADM]
out = open(os.path.join(HERE, OUT), 'w')


def P(s):
    print(s, flush=True); out.write(s + '\n'); out.flush()


P(f'matrix={MX.MJ} bo1={BO1}; columns: lambda | best tree | =editor? | editor rank, delta | best non-editor tree delta | '
  f'best tree without r3 split delta')
table = {}
for (pname, prep), kappa, cdev in itertools.product(preps.items(), [1.0, 0.5, 0.25], [None, 2.0, 1.0]):
    w = 0.25 if pname == 'units+orphan' else None
    sc = RU.Scorer2(prep, G=10, eps=0.25, kappa=kappa, w=w, cdev=cdev)
    base = np.array([sc.score(t) for t in RU.ADM])
    table[(pname, kappa, cdev)] = base
    for lam in [0, 1, 2, 4, 8]:
        s = base + lam * H
        order = np.lexsort((H, s))
        b = order[0]
        ed_rank = int(np.sum((s < s[EDI] - 1e-9) | ((np.abs(s - s[EDI]) < 1e-9) & (H < H[EDI])))) + 1
        non_ed = next(i for i in order if i != EDI)
        nor3 = next(i for i in order if frozenset(['St1', 'Wi1']) not in SPL[i])
        tag = 'EDITOR' if b == EDI else ('ed-unrooted' if SPL[b] == SPL[EDI] else '')
        P(f'{pname:12s} kappa={kappa:<4} cdev={str(cdev):4s} lam={lam:<2} best {FMT[b]:42s} {tag:11s} '
          f'editor rank {ed_rank:5d} (+{s[EDI] - s[b]:6.2f}); '
          f'{"runner-up" if b == EDI else "best"} {FMT[non_ed] if b == EDI else FMT[b]:40s} '
          f'{"+%.2f" % (s[non_ed] - s[b]) if b == EDI else ""}; no-r3 +{s[nor3] - s[b]:.2f}')
pickle.dump(table, open(os.path.join(HERE, OUT.replace('.txt', '.pkl')), 'wb'))
