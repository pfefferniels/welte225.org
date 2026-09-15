"""Blind reconstruction of one register's expression switching from note velocities.

A Viterbi pass over (level bin, crescendo latched, forzando burst) on a fixed grid. The engine's rates are
given; the emission is the squared velocity residual of the level through the output line; switching the
crescendo costs `lam_c`, starting a forzando burst costs `lam_f`.
"""
from __future__ import annotations
import numpy as np
from numba import njit

DT = 0.02
BIN = 0.001
NB = int(round(1.0 / BIN)) + 1
COMBOS = [(c, f) for c in (0, 1) for f in (0, 1, 2)]


def shifts_of(engine):
    """Level change in bins per step for each (crescendo, forzando) combination."""
    out = []
    for c, f in COMBOS:
        rate = (engine.slow if c else -engine.decay) + (engine.fast if f == 1 else 0.0) - (engine.fast_decay if f == 2 else 0.0)
        out.append(int(round(rate * DT / BIN)))
    return np.array(out, dtype=np.int64)


@njit(cache=True)
def _viterbi(nsteps, obs_step, obs_v, obs_att, a, b, inv2s2, shifts, lam_c, lam_f):
    K = 6
    INF = 1e18
    cost = np.full((NB_, K), INF)
    cost[0, 0] = 0.0
    bp_bin = np.zeros((nsteps, NB_, K), dtype=np.int16)
    bp_combo = np.zeros((nsteps, NB_, K), dtype=np.int8)
    oi = 0
    nobs = len(obs_step)
    for t in range(nsteps):
        new = np.full((NB_, K), INF)
        for k in range(K):
            ck = k // 3; fk = k % 3
            best = np.full(NB_, INF); arg = np.zeros(NB_, dtype=np.int8)
            for j in range(K):
                cj = j // 3; fj = j % 3
                sw = (lam_c if cj != ck else 0.0) + (lam_f if (fk != 0 and fk != fj) else 0.0)
                for p in range(NB_):
                    v = cost[p, j] + sw
                    if v < best[p]:
                        best[p] = v; arg[p] = j
            d = shifts[k]
            for p in range(NB_):
                if best[p] >= INF: continue
                i = p + d
                if i < 0: i = 0
                elif i > NB_ - 1: i = NB_ - 1
                if best[p] < new[i, k]:
                    new[i, k] = best[p]; bp_bin[t, i, k] = p; bp_combo[t, i, k] = arg[p]
        while oi < nobs and obs_step[oi] == t:
            for i in range(NB_):
                pred = (a + b * i * BIN_) * obs_att[oi]
                e = (obs_v[oi] - pred) ** 2 * inv2s2
                for k in range(K):
                    new[i, k] += e
            oi += 1
        cost = new
    i_best = 0; k_best = 0; vbest = INF
    for i in range(NB_):
        for k in range(K):
            if cost[i, k] < vbest:
                vbest = cost[i, k]; i_best = i; k_best = k
    level = np.zeros(nsteps, dtype=np.int64); combo = np.zeros(nsteps, dtype=np.int64)
    i = i_best; k = k_best
    for t in range(nsteps - 1, -1, -1):
        level[t] = i; combo[t] = k
        pi = bp_bin[t, i, k]; pk = bp_combo[t, i, k]
        i = pi; k = pk
    return level, combo, vbest


NB_ = NB
BIN_ = BIN


def decode(t_obs, v_obs, att_obs, engine, a, b, sigma, lam_c, lam_f, duration):
    nsteps = int(duration / DT) + 2
    steps = np.clip((np.asarray(t_obs) / DT).astype(np.int64), 0, nsteps - 1)
    order = np.argsort(steps, kind="stable")
    level, combo, total = _viterbi(nsteps, steps[order], np.asarray(v_obs, float)[order], np.asarray(att_obs, float)[order],
                                   float(a), float(b), 1.0 / (2 * sigma ** 2), shifts_of(engine), float(lam_c), float(lam_f))
    c = (combo // 3).astype(np.int8); f = (combo % 3).astype(np.int8)
    return c, f, level * BIN, total


def intervals(state, value=1):
    """(start step, end step) of runs where state == value."""
    s = np.asarray(state) == value
    edges = np.diff(np.concatenate([[0], s.astype(np.int8), [0]]))
    return list(zip(np.where(edges == 1)[0], np.where(edges == -1)[0]))
