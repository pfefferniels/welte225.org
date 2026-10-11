"""Exhaustive enumeration of rooted stemmata over the 6 feature-bearing copies, with sampled ancestors
(a copy may label an internal node) and unobserved (hypothetical) internal nodes, scored by weighted
Dollo/Camin-Sokal-style Sankoff parsimony on presence/absence characters.

Tree = nested tuples: (label_or_None, (child, child, ...)). Leaves are (label, ()).
"""
import itertools, functools, collections
import numpy as np

INF = 1e9


# ---------------------------------------------------------------- enumeration
def _insert_everywhere(tree, leaf):
    """All trees obtained by adding `leaf` to a multifurcating tree (unlabeled internal nodes)."""
    lab, ch = tree
    out = []
    # (c) new root above this subtree
    out.append((None, (tree, (leaf, ()))))
    if ch:
        # (a) as a new child of this internal node
        out.append((lab, ch + ((leaf, ()),)))
        # recurse into children (subdivide edges below / attach deeper)
        for i, c in enumerate(ch):
            for nc in _insert_everywhere(c, leaf):
                out.append((lab, ch[:i] + (nc,) + ch[i + 1:]))
    return out


def multifurcating(labels):
    trees = [(None, ((labels[0], ()), (labels[1], ())))]
    for l in labels[2:]:
        nxt = []
        for t in trees:
            nxt.extend(_insert_everywhere(t, l))
        trees = nxt
    # canonicalize & dedupe (the insertion scheme should already be unique)
    seen = {}
    for t in trees:
        seen[canon(t)] = t
    return list(seen.values())


def canon(t):
    lab, ch = t
    return (lab or '', tuple(sorted(canon(c) for c in ch)))


def promotions(t):
    """All ways to let at most one leaf child of each internal node label that node (sampled ancestor)."""
    lab, ch = t
    if not ch:
        yield t
        return
    child_opts = [list(promotions(c)) for c in ch]
    leaf_idx = [i for i, c in enumerate(ch) if not c[1]]
    choices = [None] + leaf_idx
    for combo in itertools.product(*child_opts):
        for p in choices:
            if p is None:
                yield (lab, tuple(combo))
            else:
                rest = tuple(c for i, c in enumerate(combo) if i != p)
                yield (ch[p][0], rest)


def all_trees(labels):
    out = {}
    for t in multifurcating(labels):
        for p in promotions(t):
            out[canon(p)] = p
    return list(out.values())


# ---------------------------------------------------------------- helpers
def nodes_post(t):
    """Post-order list of (node, parent_index) with indices."""
    out = []

    def rec(n, parent):
        idx = len(out)
        out.append([n, parent, []])
        for c in n[1]:
            ci = rec(c, idx)
            out[idx][2].append(ci)
        return idx
    rec(t, -1)
    return out  # pre-order actually; we iterate reversed for post-order


def descendants_labels(t):
    lab, ch = t
    s = set([lab]) if lab else set()
    for c in ch:
        s |= descendants_labels(c)
    return s


def n_hidden(t):
    lab, ch = t
    return (0 if lab or not ch else 1) + sum(n_hidden(c) for c in ch)


def fmt(t):
    lab, ch = t
    if not ch:
        return lab
    inner = ','.join(sorted(fmt(c) for c in ch))
    return f"{lab or '*'}({inner})"


# ---------------------------------------------------------------- constraints
def ok_systems(t, system, strict_same_system=True):
    """A Licensee or green copy cannot be the ancestor of a red one; (strict) a non-red copy is ancestor only of
    copies of its own system."""
    lab, ch = t
    if lab and ch and system[lab] != 'welte-t100':
        below = set()
        for c in ch:
            below |= descendants_labels(c)
        for b in below:
            if system[b] == 'welte-t100':
                return False
            if strict_same_system and system[b] != system[lab]:
                return False
    return all(ok_systems(c, system, strict_same_system) for c in ch)


def ok_dates(t, rank):
    """A copy that labels an internal node (sampled ancestor) must not be later than any copy below it."""
    lab, ch = t
    if lab and ch:
        for c in ch:
            for b in descendants_labels(c):
                if rank[b] < rank[lab]:
                    return False
    return all(ok_dates(c, rank) for c in ch)


# ---------------------------------------------------------------- scoring
class Scorer:
    """Weighted Sankoff on 0/1 characters. gain 0->1 costs G (also for presence at the root),
    loss 1->0 costs `loss` per character (1, or eps for redundant readings)."""

    def __init__(self, chars, copies, G=10.0, eps=0.25, weight_by=None):
        cls = collections.Counter()
        for c in chars:
            key = (tuple(c['states'][x] for x in copies), eps if c['redundant'] else 1.0)
            cls[key] += 1
        self.keys = list(cls)
        self.w = np.array([cls[k] for k in self.keys], float)
        self.loss = np.array([k[1] for k in self.keys], float)
        self.G = G
        self.copies = copies
        # observed state matrices per copy: cost vectors for state0/state1
        self.obs = {}
        for i, x in enumerate(copies):
            s = [k[0][i] for k in self.keys]
            c0 = np.array([INF if v == '1' else 0.0 for v in s])
            c1 = np.array([INF if v == '0' else 0.0 for v in s])
            self.obs[x] = (c0, c1)

    def node_costs(self, t):
        lab, ch = t
        if lab:
            c0, c1 = self.obs[lab]
            c0 = c0.copy(); c1 = c1.copy()
        else:
            c0 = np.zeros(len(self.keys)); c1 = np.zeros(len(self.keys))
        for c in ch:
            k0, k1 = self.node_costs(c)
            # parent 0: child stays 0 or gains (G)
            c0 = c0 + np.minimum(k0, k1 + self.G)
            # parent 1: child keeps (0) or loses (loss)
            c1 = c1 + np.minimum(k1, k0 + self.loss)
        return c0, c1

    def per_class(self, t):
        c0, c1 = self.node_costs(t)
        return np.minimum(c0, c1 + self.G)  # presence at root = a gain (base text)

    def score(self, t):
        return float(np.dot(self.w, self.per_class(t)))

    def baseline(self):
        """Unavoidable cost: one gain per character that is present somewhere."""
        return float(self.G * self.w.sum())
