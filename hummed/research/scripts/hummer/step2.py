"""Fit tract shapes to the recording's spectral envelope at 20 ms keyframes; save step2.npz."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from multiprocessing import Pool
from scipy.ndimage import median_filter, uniform_filter1d
import vtlfit as V

Z = dict(np.load('step1.npz'))
t, f0, lev, envg, floor, calib = Z['t'], Z['f0'], Z['lev'], Z['envg'], Z['floor'], Z['calib']
cb, cbdb = Z['cb'], Z['cbdb']
thr = np.median(lev[f0 == 0]) + 10
voiced = (f0 > 0) & (lev > thr)
print('level threshold', round(thr, 1), 'dB; voiced', voiced.mean().round(3))
key = np.where(voiced)[0][::4]
print('keyframes', len(key))

# phrase type: hums have (almost) no envelope above the noise floor between 1.5 and 4.5 kHz
idx = np.where(voiced)[0]
runs = np.split(idx, np.where(np.diff(idx) > 12)[0] + 1)
hfband = (V.GRID > 1500) & (V.GRID < 4500)
kind_of_frame = np.full(len(t), 'open', dtype=object)
for r in runs:
    above = np.median((envg[r][:, hfband] > floor[hfband] + 6).mean(1))
    kind_of_frame[r] = 'hum' if above < 0.5 else 'open'
    print(f'  phrase {t[r[0]]:5.2f}-{t[r[-1]]:5.2f}s: {kind_of_frame[r[0]]} (HF bands above noise {above:.2f})')
kinds = kind_of_frame[key]
BOUNDS = {k: V.bounds_for(k) for k in ['hum', 'open']}

# (a) codebook start, vectorised
def cb_match(i, kind):
    lo, hi = BOUNDS[kind]
    ok = np.all((cb[:, V.FI] >= lo - 1e-9) & (cb[:, V.FI] <= hi + 1e-9), axis=1)
    if ok.sum() < 20:                      # few codebook entries fit: clip them into the bounds instead
        ok[:] = True
    tgt = envg[i]
    above = tgt > floor + 6
    d = cbdb + calib - tgt
    g = np.median(np.where(above, d, np.nan), axis=1, keepdims=True) if above.sum() > 8 else np.median(d, axis=1, keepdims=True)
    d = d - g
    d = np.where(above, d, np.maximum(d, 0))
    c = np.mean(d * d, axis=1) + V.gain_penalty(cbdb.max(axis=1))
    c[~ok] = np.inf
    s = cb[int(np.argmin(c))].copy()
    s[V.FI] = np.clip(s[V.FI], lo, hi)
    return s

start = np.array([cb_match(i, k) for i, k in zip(key, kinds)])

def job1(args):
    k, s0, kind = args
    lo, hi = BOUNDS[kind]
    return V.refine(s0, envg[k], floor, calib, iters=150, seed=k, lo=lo, hi=hi)

def job2(args):
    k, s0, prior, kind = args
    lo, hi = BOUNDS[kind]
    return V.refine(s0, envg[k], floor, calib, prior=prior, lam=15.0, iters=80, seed=k + 7, lo=lo, hi=hi)

def segments(idx):
    """runs of consecutive keyframes (gap > 60 ms splits)"""
    tk = t[idx]
    cut = np.where(np.diff(tk) > 0.06)[0] + 1
    return np.split(np.arange(len(idx)), cut)

def smooth(P, idx, w=5):
    Q = P.copy()
    for seg in segments(idx):
        if len(seg) < 3:
            continue
        x = P[seg][:, V.FI]
        x = median_filter(x, size=(min(w, len(seg)), 1), mode='nearest')
        x = uniform_filter1d(x, size=min(3, len(seg)), axis=0, mode='nearest')
        Q[seg[:, None], np.array(V.FI)[None, :]] = x
    return Q

if __name__ == '__main__':
    t0 = time.time()
    with Pool(4) as p:
        r1 = p.map(job1, list(zip(key, start, kinds)), chunksize=8)
    P1 = np.array([r[0] for r in r1]); c1 = np.array([r[1] for r in r1])
    print('pass 1', round(time.time() - t0), 's, median dist', np.median(c1).round(2), 'dB^2')
    P1s = smooth(P1, key)
    with Pool(4) as p:
        r2 = p.map(job2, list(zip(key, P1s, P1s, kinds)), chunksize=8)
    P2 = np.array([r[0] for r in r2])
    P2s = smooth(P2, key, w=3)
    c2 = np.array([V.distance(V.tf_db(s) + calib, envg[k], floor) for k, s in zip(key, P2s)])
    cs = np.array([V.distance(V.tf_db(s) + calib, envg[k], floor) for k, s in zip(key, start)])
    print('pass 2', round(time.time() - t0), 's; median dist: codebook', np.median(cs).round(2),
          'pass1', np.median(c1).round(2), 'final(smoothed)', np.median(c2).round(2), 'dB^2')
    np.savez('step2.npz', key=key, voiced=voiced, start=start, P1=P1, P2s=P2s, c2=c2, thr=thr, kinds=kinds.astype(str))
