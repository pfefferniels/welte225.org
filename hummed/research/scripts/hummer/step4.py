"""Voice quality: choose, per phrase, the glottal setting on the pressed-modal-breathy continuum
whose synthesis best matches the recording's envelope; then redo the lung-pressure loop.
w = -1 is VTL's 'pressed', 0 'modal', +1 'breathy'; w < -1 extrapolates beyond 'pressed'."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, soundfile as sf, pyworld as pw, librosa
from multiprocessing import Pool
from scipy.ndimage import uniform_filter1d
import vtlfit as V

Z = dict(np.load('step1.npz'))
F = dict(np.load('step2.npz'))
S3 = dict(np.load('step3_fit.npz'))
y, t, lev = Z['y'], Z['t'], Z['lev']
voiced = F['voiced']
T, G0, tv = S3['T'], S3['G'], S3['tv']
GV = {n: np.asarray(V.vtl.get_shape(n, 'glottis'), dtype=float) for n in ['pressed', 'modal', 'breathy']}
QI = [V.GN.index(n) for n in ['XB', 'XT', 'CA']]
WS = [-0.5, 0.0, 0.5, 1.0]


def quality(w):
    """XB, XT, CA for a point on the continuum (piecewise linear through the three shapes)."""
    a, b = (GV['pressed'], GV['modal']) if w < 0 else (GV['modal'], GV['breathy'])
    u = w + 1 if w < 0 else w
    return (1 - u) * a[QI] + u * b[QI]


def with_quality(G, wv):
    G = G.copy()
    q = np.array([quality(w) for w in wv])
    G[:, QI] = q
    return G


MFB = librosa.filters.mel(sr=V.SR, n_fft=2048, n_mels=40, fmin=60, fmax=8000)


def melenv(x):
    f0, tt = pw.harvest(x.astype(np.float64), V.SR, f0_floor=60, f0_ceil=600, frame_period=V.FP)
    sp = pw.cheaptrick(x.astype(np.float64), f0, tt, V.SR, fft_size=2048)
    mel = sp @ MFB.T
    return 10 * np.log10(np.maximum(mel, mel.max(axis=1, keepdims=True) * 1e-6 + 1e-30))


TL = melenv(y)


def lsd_frames(x):
    L = melenv(x)
    n = min(len(L), len(TL))
    d = L[:n] - TL[:n]
    d = d - d.mean(axis=1, keepdims=True)
    return np.sqrt(np.mean(d * d, axis=1))


def render(w):
    x = V.synth(T, with_quality(G0, np.full(len(T), w)))[: len(y)]
    return w, lsd_frames(x)


phr = np.split(np.where(voiced)[0], np.where(np.diff(np.where(voiced)[0]) > 12)[0] + 1)
phr = [p for p in phr if len(p) > 20]

if __name__ == '__main__':
    with Pool(4) as pool:
        res = dict(pool.map(render, WS))
    best = []
    for p in phr:
        scores = {w: float(np.mean(res[w][p[p < len(res[w])]])) for w in WS}
        b = min(scores, key=scores.get)
        best.append((t[p[0]], t[p[-1]], b))
        print(f'phrase {t[p[0]]:5.2f}-{t[p[-1]]:5.2f}s  ' + '  '.join(f'w={w:+.2f}:{s:5.2f}' for w, s in scores.items()) + f'  -> {b:+.2f}')
    # per-frame w: phrase value, 50 ms transitions
    wv = np.zeros(len(tv))
    for a, e, b in best:
        wv[(tv >= a - 0.05) & (tv <= e + 0.05)] = b
    wv = uniform_filter1d(wv, size=int(0.05 * V.FR))
    G1 = with_quality(G0, wv)
    # lung pressure: closed loop again for the new source
    ref_t = np.percentile(lev[voiced], 90)
    PR = G1[:, V.GN.index('PR')].copy()
    ramp = (PR > 0).astype(float)
    for it in range(4):
        G1[:, V.GN.index('PR')] = PR
        x = V.synth(T, G1)[: len(y)]
        e = np.sqrt(uniform_filter1d(x ** 2, int(0.03 * V.SR)) + 1e-14)
        ls = 20 * np.log10(e[np.minimum((t * V.SR).astype(int), len(e) - 1)])
        err = (lev - ref_t) - (ls - np.percentile(ls[voiced], 90))
        print(f'  pressure pass {it}: median |level error| {np.median(np.abs(err[voiced])):.2f} dB')
        if it == 3:
            break
        corr = uniform_filter1d(np.interp(tv, t[voiced], np.clip(err[voiced], -12, 12)), size=int(0.08 * V.FR))
        PR = np.clip(PR * 10 ** (corr / 25), 0, 14000)
    sf.write('copy_vtl_q.wav', (x / (np.abs(x).max() + 1e-9) * 0.9).astype(np.float32), V.SR)
    V.write_tsq('copy_vtl_q.tsq', T, G1)
    np.savez('step4.npz', G=G1, wv=wv, best=np.array(best))
