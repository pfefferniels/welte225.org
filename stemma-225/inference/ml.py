"""Stochastic-Dollo-type likelihood with free per-branch parameters (birth mass g_v and loss probability p_v
on the edge into each node v; birth mass N=1 at the root = base text), sampled ancestors allowed.
A reading is born once (no parallel births), then may be lost on any edge; the copy at a node shows the state
of that node. Readings are observed only if at least one unmasked copy carries them (multinomial likelihood
conditioned per missing-data mask). Model choice between trees with different numbers of nodes by BIC.
Optional: separate parameter sets per character class (notes / expressions; redundant expressions)."""
import math, collections
import numpy as np
import matrix as MX
import trees as T

COPIES = MX.COPIES
NC = len(COPIES)
NP = 1 << NC
BIT = {c: 1 << i for i, c in enumerate(COPIES)}
OR = np.array([[a | b for b in range(NP)] for a in range(NP)])
HAM = np.array([[bin(a ^ b).count('1') for b in range(NP)] for a in range(NP)])


def err_kernel(delta):
    return delta ** HAM * (1 - delta) ** (NC - HAM)


def flatten(t):
    """Nodes in pre-order: list of (label, parent_index)."""
    out = []

    def rec(n, par):
        i = len(out)
        out.append((n[0], par))
        for c in n[1]:
            rec(c, i)
    rec(t, -1)
    return out


class Data:
    def __init__(self, chars, classes=('all',)):
        """classes: 'all' one class; 'type' notes vs expressions; 'type+red' notes / expr / redundant expr."""
        self.groups = collections.defaultdict(lambda: collections.Counter())  # (cls, maskbits) -> Counter(X)
        for c in chars:
            st = c['states']
            mask = sum(BIT[x] for x in COPIES if st[x] == '?')
            X = sum(BIT[x] for x in COPIES if st[x] == '1')
            if classes == 'type':
                k = c['type']
            elif classes == 'type+red':
                k = 'red' if c['redundant'] else c['type']
            else:
                k = 'all'
            self.groups[(k, mask)][X] += 1
        self.classes = sorted({k for k, _ in self.groups})
        self.n = len(chars)
        # projection: for each mask, map Y -> X = Y & ~mask
        self.prep = []
        for (k, mask), cnt in self.groups.items():
            Xs = np.array(list(cnt.keys()))
            ns = np.array([cnt[x] for x in Xs], float)
            proj = np.arange(NP) & ~mask
            self.prep.append((self.classes.index(k), proj, Xs, ns))


def dist_at(nodes, p):
    """P_v(Y) for all nodes: distribution of the full pattern of a reading present at v (bits outside subtree 0)."""
    n = len(nodes)
    kids = [[] for _ in range(n)]
    for i, (lab, par) in enumerate(nodes):
        if par >= 0:
            kids[par].append(i)
    P = [None] * n
    for v in reversed(range(n)):
        lab = nodes[v][0]
        q = np.zeros(NP)
        q[BIT[lab] if lab else 0] = 1.0
        for w in kids[v]:
            d = (1 - p[w]) * P[w]
            d[0] += p[w]
            # OR-convolution of disjoint supports
            nz_q = np.nonzero(q)[0]; nz_d = np.nonzero(d)[0]
            r = np.zeros(NP)
            np.add.at(r, OR[np.ix_(nz_q, nz_d)].ravel(), np.outer(q[nz_q], d[nz_d]).ravel())
            q = r
        P[v] = q
    return P


def subtree_bits(nodes):
    n = len(nodes)
    b = [BIT[l] if l else 0 for l, _ in nodes]
    for v in reversed(range(1, n)):
        b[nodes[v][1]] |= b[v]
    return b


def loglik(nodes, theta, data, ncls):
    """theta: per class, array [log g_1..g_{n-1}, logit p_1..p_{n-1}, logit delta] for non-root nodes 1..n-1;
    delta = per-copy observation/homoplasy error (state flipped)."""
    n = len(nodes)
    ll = 0.0
    E = []
    for k in range(ncls):
        th = theta[k]
        g = np.concatenate([[1.0], np.exp(th[:n - 1])])
        p = np.concatenate([[0.0], 1 / (1 + np.exp(-th[n - 1:2 * n - 2]))])
        delta = 1 / (1 + math.exp(-th[-1]))
        P = dist_at(nodes, p)
        E.append((sum(g[v] * P[v] for v in range(n))) @ err_kernel(delta))
    for k, proj, Xs, ns in data.prep:
        Em = np.bincount(proj, weights=E[k], minlength=NP)
        Z = Em.sum() - Em[0]
        ll += float(np.dot(ns, np.log(np.maximum(Em[Xs], 1e-300)) - math.log(Z)))
    return ll


def fit(t, data, sweeps=6, init=None):
    nodes = flatten(t)
    n = len(nodes)
    ncls = len(data.classes)
    theta = [np.concatenate([np.full(n - 1, -2.0), np.full(n - 1, -3.0), [-6.0]]) for _ in range(ncls)] if init is None else init
    best = loglik(nodes, theta, data, ncls)
    step = 2.0
    for sw in range(sweeps * 4):
        improved = False
        for k in range(ncls):
            for j in range(2 * (n - 1) + 1):
                for direction in (+1, -1):
                    while True:
                        old = theta[k][j]
                        theta[k][j] = min(12, max(-14, old + direction * step))
                        val = loglik(nodes, theta, data, ncls)
                        if val > best + 1e-9:
                            best = val; improved = True
                        else:
                            theta[k][j] = old
                            break
        if not improved:
            step /= 2
            if step < 0.02:
                break
    return best, nodes, theta


def n_params(t, data):
    n = len(flatten(t))
    return (2 * (n - 1) + 1) * len(data.classes)


def bic(ll, k, nobs):
    return -2 * ll + k * math.log(nobs)


def describe(nodes, theta, data):
    """Per-node fitted gain mass (expected births) and loss prob."""
    out = []
    n = len(nodes)
    for k, cls in enumerate(data.classes):
        th = theta[k]
        g = np.exp(th[:n - 1]); p = 1 / (1 + np.exp(-th[n - 1:2 * n - 2]))
        out.append((cls, round(float(1 / (1 + np.exp(-th[-1]))), 5), [(nodes[i + 1][0] or f'h{i + 1}', nodes[nodes[i + 1][1]][0] or f'h{nodes[i + 1][1]}', round(float(g[i]), 4), round(float(p[i]), 4)) for i in range(n - 1)]))
    return out
