"""Fast version of ml.py (same model): the OR-convolution of disjoint subtrees becomes a pointwise product under
the subset-sum (zeta) transform, and coordinate ascent evaluates a grid of values for one parameter in one batch.
Model (per character class): reading born once - at the root with mass 1 (base text) or on the edge into node v with
mass g_v - then lost on edge v with probability p_v; each observed copy state flipped with probability delta
(misreading/homoplasy). Multinomial likelihood of the observed patterns, conditioned per missing-data mask."""
import math, collections
import numpy as np
import matrix as MX

COPIES = MX.COPIES
NC = len(COPIES)
NP = 1 << NC
BIT = {c: 1 << i for i, c in enumerate(COPIES)}
SUB = np.array([[1.0 if (y & ~s) == 0 else 0.0 for s in range(NP)] for y in range(NP)])  # zeta: f @ SUB
MOB = np.linalg.inv(SUB)
HAM = np.array([[bin(a ^ b).count('1') for b in range(NP)] for a in range(NP)], float)
LABZ = {c: np.array([1.0 if (s & BIT[c]) else 0.0 for s in range(NP)]) for c in COPIES}


def flatten(t):
    out = []

    def rec(n, par):
        i = len(out)
        out.append((n[0], par))
        for c in n[1]:
            rec(c, i)
    rec(t, -1)
    return out


class Data:
    def __init__(self, chars, classes='all'):
        groups = collections.defaultdict(collections.Counter)
        for c in chars:
            st = c['states']
            mask = sum(BIT[x] for x in COPIES if st[x] == '?')
            X = sum(BIT[x] for x in COPIES if st[x] == '1')
            k = {'type': c['type'], 'type+red': ('red' if c['redundant'] else c['type'])}.get(classes, 'all')
            groups[(k, mask)][X] += 1
        self.classes = sorted({k for k, _ in groups})
        self.n = len(chars)
        self.per_class = []
        for k in self.classes:
            gs = []
            for (kk, mask), cnt in groups.items():
                if kk != k:
                    continue
                proj = np.zeros((NP, NP))
                for y in range(NP):
                    proj[y, y & ~mask] = 1.0
                Xs = np.array(sorted(cnt)); ns = np.array([cnt[x] for x in Xs], float)
                gs.append((proj, Xs, ns, ns.sum()))
            self.per_class.append(gs)


def flip(E, delta):
    """apply independent per-copy flips with prob delta[b] to batch E (B, 64)."""
    B = E.shape[0]
    X = E.reshape((B,) + (2,) * NC)
    d = delta.reshape((B,) + (1,) * NC)
    for ax in range(1, NC + 1):
        a0 = np.take(X, 0, axis=ax); a1 = np.take(X, 1, axis=ax)
        dd = d.reshape((B,) + (1,) * (NC - 1))
        X = np.stack([(1 - dd) * a0 + dd * a1, dd * a0 + (1 - dd) * a1], axis=ax)
    return X.reshape(B, NP)


def ll_batch(nodes, kids, TH, groups):
    """TH: (B, 2(n-1)+1) parameters -> (B,) log-likelihoods for one class."""
    n = len(nodes)
    B = TH.shape[0]
    g = np.exp(TH[:, :n - 1]); p = 1 / (1 + np.exp(-TH[:, n - 1:2 * n - 2])); delta = 1 / (1 + np.exp(-TH[:, -1]))
    Z = [None] * n
    for v in reversed(range(n)):
        lab = nodes[v][0]
        z = np.tile(LABZ[lab], (B, 1)) if lab else np.ones((B, NP))
        for w in kids[v]:
            pw = p[:, w - 1:w]
            z = z * (pw + (1 - pw) * Z[w])
        Z[v] = z
    Ez = Z[0].copy()
    for v in range(1, n):
        Ez += g[:, v - 1:v] * Z[v]
    E0 = Ez @ MOB
    if np.all(delta == delta[0]):
        d = delta[0]
        E = E0 @ (d ** HAM * (1 - d) ** (NC - HAM))
    else:
        K = delta[:, None, None] ** HAM * (1 - delta[:, None, None]) ** (NC - HAM)
        E = np.einsum('bi,bij->bj', E0, K)
    ll = np.zeros(B)
    for proj, Xs, ns, N in groups:
        Em = E @ proj
        Zm = Em.sum(1) - Em[:, 0]
        ll += np.log(np.maximum(Em[:, Xs], 1e-300)) @ ns - N * np.log(Zm)
    return ll


def fit_class(nodes, kids, groups, sweeps=40):
    n = len(nodes)
    P = 2 * (n - 1) + 1
    th = np.concatenate([np.full(n - 1, -2.0), np.full(n - 1, -3.0), [-6.0]])
    lo, hi = -14.0, 12.0
    best = ll_batch(nodes, kids, th[None], groups)[0]
    step = 2.0
    grid = np.array([-4, -3, -2, -1, 1, 2, 3, 4], float)
    for sw in range(sweeps):
        improved = False
        for j in range(P):
            TH = np.tile(th, (len(grid), 1))
            TH[:, j] = np.clip(th[j] + step * grid, lo, hi)
            vals = ll_batch(nodes, kids, TH, groups)
            i = int(np.argmax(vals))
            if vals[i] > best + 1e-9:
                best = vals[i]; th = TH[i]; improved = True
        if not improved:
            step /= 3
            if step < 0.005:
                break
    return best, th


def fit(t, data):
    nodes = flatten(t)
    n = len(nodes)
    kids = [[] for _ in range(n)]
    for i, (lab, par) in enumerate(nodes):
        if par >= 0:
            kids[par].append(i)
    tot = 0.0; ths = []
    for groups in data.per_class:
        ll, th = fit_class(nodes, kids, groups)
        tot += ll; ths.append(th)
    return tot, nodes, ths


def n_params(t, data):
    return (2 * (len(flatten(t)) - 1) + 1) * len(data.classes)


def bic(ll, k, n):
    return -2 * ll + k * math.log(n)
