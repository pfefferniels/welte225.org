"""Follow-up B (iii): the editor's proportion argument as a deterministic criterion.

Formalisation: every reading is an addition of the MRCA node of its carriers (shared-addition, Dollo); deletions are
not counted as evidence at all. For each node v and each copy X below v, carry(X, v) = share of v's additions that X
carries (unknown cells excluded). Criterion, lexicographic:
  1. no copy may sit below a node whose additions it carries in a share < theta (attach below the nodes whose
     additions you carry in the majority; the editor's '155 of 172');
  2. fewest shared-addition violations (readings needing a second, independent addition = re-gains);
  3. fewest hypothetical nodes;
  4. largest total carried share (sum over (X, v) of carry).
Also reported: the 'largest proportion' variant, where criterion 1 is replaced by maximising the minimum carry."""
import collections, os, sys
import numpy as np
import matrix as MX, rules as RU, trees as T
import ml_splits_lib as SL

HERE = os.path.dirname(os.path.abspath(__file__))
COPIES = MX.COPIES
BIT = RU.BIT


def node_list(t):
    out = []

    def rec(n, par):
        i = len(out)
        out.append([n, par, 0])
        for c in n[1]:
            rec(c, i)
    rec(t, -1)
    for i in reversed(range(len(out))):
        n = out[i][0]
        if n[0]:
            out[i][2] |= BIT[n[0]]
        if out[i][1] >= 0:
            out[out[i][1]][2] |= out[i][2]
    return out  # [node, parent, subtree copy mask]


def evaluate(t, classes, wts):
    nodes = node_list(t)
    n = len(nodes)
    # violations: Sankoff with gain 1, loss ~0 (deletions are free; re-gains counted)
    sc = VIOL.score(t)
    viol = int(round(sc))  # gain cost 1 per extra gain; loss cost 1e-4
    # additions per node: MRCA of the carriers
    add = collections.defaultdict(lambda: np.zeros(len(COPIES)))  # node -> carried counts per copy
    tot = collections.defaultdict(lambda: np.zeros(len(COPIES)))  # node -> known counts per copy
    for (st, red, orph), w in zip(classes, wts):
        ones = sum(BIT[x] for i, x in enumerate(COPIES) if st[i] == '1')
        # deepest node whose subtree contains all carriers
        # pre-order: the last index whose subtree contains all carriers is the MRCA
        m = max(i for i in range(n) if nodes[i][2] & ones == ones)
        sub = nodes[m][2]
        for j, x in enumerate(COPIES):
            if sub & BIT[x] and st[j] != '?':
                tot[m][j] += w
                if st[j] == '1':
                    add[m][j] += w
    carries = []
    for i in range(n):
        if tot[i].sum() == 0:
            continue
        for j, x in enumerate(COPIES):
            if nodes[i][2] & BIT[x] and tot[i][j] > 0:
                carries.append((add[i][j] / tot[i][j], x, i, int(tot[i][j])))
    mn = min(c[0] for c in carries) if carries else 1.0
    return viol, T.n_hidden(t), mn, sum(c[0] for c in carries), carries


if __name__ == '__main__':
    chars = MX.build(bo1=os.environ.get('BO1', 'near5m'))
    prep = RU.prepare(chars)
    cnt = collections.Counter(prep)
    classes = list(cnt); wts = [cnt[k] for k in classes]
    VIOL = RU.Scorer2(prep, G=1.0, eps=1e-4)
    VIOL.base_loss[:] = 1e-4
    res = []
    for t in RU.ADM:
        v, h, mn, tot, carries = evaluate(t, classes, wts)
        res.append((v, h, mn, tot, T.fmt(t), t))
    out = open(os.path.join(HERE, sys.argv[1] if len(sys.argv) > 1 else 'results_rules_prop.txt'), 'w')

    def P(s):
        print(s); out.write(s + '\n')
    for theta in [0.5, 0.8, 0.9]:
        adm = [r for r in res if r[2] >= theta]
        adm.sort(key=lambda r: (r[0], r[1], -r[3]))
        b = adm[0]
        ed = next((i for i, r in enumerate(adm) if T.canon(r[5]) == RU.EDC), None)
        P(f'theta={theta}: {len(adm)} admissible; best {b[4]} (violations {b[0]}, hidden {b[1]}, min carry {b[2]:.2f}); '
          f'editor: ' + (f'rank {ed + 1} (violations {adm[ed][0]}, hidden {adm[ed][1]}, min carry {adm[ed][2]:.2f})' if ed is not None else 'inadmissible'))
        for r in adm[1:6]:
            P(f'      next: {r[4]:42s} violations {r[0]} hidden {r[1]} min carry {r[2]:.2f} total {r[3]:.2f}')
    # largest-proportion variant: maximise min carry, then fewest violations, hidden
    res.sort(key=lambda r: (-round(r[2], 3), r[0], r[1]))
    P('max-min-carry variant: ' + '; '.join(f'{r[4]} (min carry {r[2]:.3f}, viol {r[0]}, hidden {r[1]})' for r in res[:5]))
    ed = next(r for r in res if T.canon(r[5]) == RU.EDC)
    P(f'editor tree: min carry {ed[2]:.3f}, violations {ed[0]}, hidden {ed[1]}')
    v, h, mn, tot, carries = evaluate(RU.EDITOR, classes, wts)
    P('editor tree carries below 0.95: ' + ', '.join(f'{x} of node#{i} {c:.2f} (n={k})' for c, x, i, k in sorted(carries) if c < 0.95))
