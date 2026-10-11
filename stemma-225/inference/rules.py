"""Follow-up B: domain-rule parsimony (deterministic, editor-readable) that might decide r3 without fitted rates.

Base: Sankoff on presence/absence, gain G (also for presence at the root), loss 1, redundant loss eps,
lambda per hypothetical node. Rules:
 (i)  kappa: a loss on a transfer edge (child coded for another system than its parent) costs kappa * loss;
 (ii) accent units: a crescendo/forzando On and its Off (next Off of the same function and side within 40 mm,
      no On between) with identical patterns count as ONE character; withdrawn-accent evidence: losing an On in a
      subtree whose lacking copies all keep the partner Off as a redundant (orphaned) Off costs w;
 (iv) cdev: the copy at a node may deviate from the node's text at cost cdev per reading (punching fault /
      copy-specific loss), instead of being impossible (only matters for sampled ancestors).
 (iii) proportion criterion: see proportion() below.
"""
import collections, os, sys, json
import numpy as np
import matrix as MX, trees as T

COPIES = MX.COPIES
BIT = {c: 1 << i for i, c in enumerate(COPIES)}
INF = 1e9
RED_SYS = 'welte-t100'
ACCENT = {'SlowCrescendoOn': ('cresc', 'on'), 'SlowCrescendoOff': ('cresc', 'off'),
          'ForzandoOn': ('sfz', 'on'), 'ForzandoOff': ('sfz', 'off')}


def accent_pairs(chars, maxd=40.0):
    """version-independent pairing On -> next Off of the same function/side (no On between) within maxd mm."""
    by = collections.defaultdict(list)
    for i, c in enumerate(chars):
        if c['type'] == 'expression' and c['kind'][1] in ACCENT and c['frm'] is not None:
            f, sp = ACCENT[c['kind'][1]]
            by[(f, c['kind'][2])].append((c['frm'], sp, i))
    pairs = {}
    for k, g in by.items():
        g.sort()
        for j, (at, sp, i) in enumerate(g):
            if sp != 'on':
                continue
            for at2, sp2, i2 in g[j + 1:]:
                if at2 - at > maxd or sp2 == 'on':
                    break
                if sp2 == 'off':
                    pairs[i] = i2
                    break
    return pairs


def prepare(chars, units=False, orphan=False):
    """returns list of (states tuple, redundant flag, orphan mask); merges accent units if asked."""
    pairs = accent_pairs(chars) if (units or orphan) else {}
    drop = set()
    orph = {}
    for a, b in pairs.items():
        sa, sb = chars[a]['states'], chars[b]['states']
        if units and all(sa[x] == sb[x] for x in COPIES):
            drop.add(b)
        if orphan:
            m = 0
            for x in COPIES:
                if sa[x] == '0' and sb[x] == '1' and x in MX.REDUNDANT_IN and chars[b]['id'] in MX.REDUNDANT_IN[x]:
                    m |= BIT[x]
            if m:
                orph[a] = m
    out = []
    for i, c in enumerate(chars):
        if i in drop:
            continue
        out.append((tuple(c['states'][x] for x in COPIES), c['redundant'], orph.get(i, 0)))
    return out


class Scorer2:
    def __init__(self, prepared, G=10.0, eps=0.25, kappa=1.0, w=None, cdev=None, lam=0.0):
        cnt = collections.Counter(prepared)
        self.keys = list(cnt)
        self.wt = np.array([cnt[k] for k in self.keys], float)
        self.base_loss = np.array([eps if k[1] else 1.0 for k in self.keys])
        self.orph = np.array([k[2] for k in self.keys], dtype=np.int64)
        self.zero = np.array([sum(BIT[x] for i, x in enumerate(COPIES) if k[0][i] == '0') for k in self.keys], dtype=np.int64)
        self.G, self.kappa, self.w, self.cdev, self.lam = G, kappa, w, cdev, lam
        self.obs = {}
        for i, x in enumerate(COPIES):
            s = [k[0][i] for k in self.keys]
            self.obs[x] = (np.array([INF if v == '1' else 0.0 for v in s]), np.array([INF if v == '0' else 0.0 for v in s]))
            # copy-specific omission at a sampled ancestor: node has the reading, its copy does not
            self.obs_anc = getattr(self, 'obs_anc', {})
            self.obs_anc[x] = (self.obs[x][0], np.array([(INF if cdev is None else cdev) if v == '0' else 0.0 for v in s]))

    def _sys(self, t):
        lab, ch = t
        if lab:
            return MX.SYSTEM[lab]
        below = T.descendants_labels(t)
        systems = {MX.SYSTEM[b] for b in below}
        return RED_SYS if (RED_SYS in systems or len(systems) != 1) else systems.pop()

    def _rec(self, t, parent_sys):
        lab, ch = t
        n = len(self.keys)
        if lab:
            src = self.obs_anc if ch else self.obs
            c0, c1 = src[lab][0].copy(), src[lab][1].copy()
        else:
            c0, c1 = np.zeros(n), np.zeros(n)
        mysys = self._sys(t)
        submask = 0
        for c in ch:
            k0, k1, cm = self._rec(c, mysys)
            submask |= cm
            loss = self.base_loss.copy()
            if self.kappa != 1.0 and self._sys(c) != mysys:
                loss = loss * self.kappa
            if self.w is not None:
                lack = self.zero & cm
                cheap = (lack != 0) & ((lack & ~self.orph) == 0)
                loss = np.where(cheap, np.minimum(loss, self.w), loss)
            c0 = c0 + np.minimum(k0, k1 + self.G)
            c1 = c1 + np.minimum(k1, k0 + loss)
        if lab:
            submask |= BIT[lab]
        return c0, c1, submask

    def score(self, t):
        c0, c1, _ = self._rec(t, None)
        return float(np.dot(self.wt, np.minimum(c0, c1 + self.G))) - self.G * self.wt.sum() + self.lam * T.n_hidden(t)


ADM = [t for t in T.all_trees(COPIES) if T.ok_systems(t, MX.SYSTEM)]
EDITOR = (None, (('Wi1', ()), ('St1', ((None, (('St2', (('Ch1', ()), ('Bo1', ()))), ('Ne1', ()))),))))
EDC = T.canon(EDITOR)
import ml_splits_lib as SL
EDSPL = SL.splits(EDITOR)


def search(prepared, trees=ADM, **kw):
    sc = Scorer2(prepared, **kw)
    res = sorted(((round(sc.score(t), 6), T.n_hidden(t), T.fmt(t), t) for t in trees), key=lambda r: (r[0], r[1], r[2]))
    return res


def summary(res):
    b = res[0]
    ed = next(i for i, r in enumerate(res) if T.canon(r[3]) == EDC)
    nxt = next(r for r in res[1:] if r[0] > b[0] + 1e-9 or True)
    other_unrooted = next((r for r in res if SL.splits(r[3]) != SL.splits(b[3])), None)
    return dict(best=b[2], best_is_editor=T.canon(b[3]) == EDC, unrooted_editor=SL.splits(b[3]) == EDSPL,
                ties=sum(1 for r in res if r[0] == b[0]), editor_rank=ed + 1, editor_delta=res[ed][0] - b[0],
                runner=res[1][2], runner_delta=res[1][0] - b[0],
                other_unrooted_delta=(other_unrooted[0] - b[0]) if other_unrooted else None)
