"""Turn the fitted keyframes into a VTL tract sequence, close the loop on lung pressure,
synthesise, and build the naive one-shape-per-phrase baseline. Writes copy_vtl.wav,
copy_vtl.tsq, naive_vtl.wav and step3.npz."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, soundfile as sf, pyworld as pw
from scipy.ndimage import uniform_filter1d
import vtlfit as V

Z = dict(np.load('step1.npz'))
F = dict(np.load('step2.npz'))
y, t, f0, lev, envg, floor, calib = Z['y'], Z['t'], Z['f0'], Z['lev'], Z['envg'], Z['floor'], Z['calib']
key, voiced, P = F['key'], F['voiced'], F['P2s']
N = int(len(y) / V.SPS) + 1
tv = np.arange(N) / V.FR

# tract: interpolate the keyframes, hold at the edges
T = np.stack([np.interp(tv, t[key], P[:, j]) for j in range(P.shape[1])], axis=1)

# voicing at VTL frames, with 10 ms ramps
vmask = np.interp(tv, t, voiced.astype(float)) > 0.5
ramp = uniform_filter1d(vmask.astype(float), size=max(1, int(0.01 * V.FR)))
# f0 through the gaps
vi = np.where(voiced)[0]
F0 = np.interp(tv, t[vi], f0[vi])
lev_v = np.interp(tv, t, lev)
ref_t = np.percentile(lev[voiced], 90)


def glottis(PR):
    g = np.asarray(V.vtl.get_shape('modal', 'glottis'), dtype=float)
    G = np.tile(g, (N, 1))
    G[:, V.GN.index('F0')] = np.clip(F0, 40, 600)
    G[:, V.GN.index('PR')] = PR
    return G


def level_of(x):
    e = np.sqrt(uniform_filter1d(x ** 2, int(0.03 * V.SR)) + 1e-14)
    return 20 * np.log10(e[np.minimum((t * V.SR).astype(int), len(e) - 1)])


def closed_loop(Tr, name, iters=3):
    PR = np.clip(8000 * 10 ** ((lev_v - ref_t) / 25), 1500, 14000) * ramp
    for it in range(iters + 1):
        x = V.synth(Tr, glottis(PR))[: len(y)]
        ls = level_of(x)
        ref_s = np.percentile(ls[voiced], 90)
        err = (lev - ref_t) - (ls - ref_s)
        print(f'  {name} pass {it}: level error on voiced frames, median |dB| {np.median(np.abs(err[voiced])):.2f}')
        if it == iters:
            break
        corr = np.interp(tv, t[voiced], np.clip(err[voiced], -12, 12))
        corr = uniform_filter1d(corr, size=int(0.08 * V.FR))
        PR = np.clip(PR * 10 ** (corr / 25), 0, 14000) * ramp     # VTL gestures allow 15000 at most
    return x, glottis(PR)


if 'naive' not in sys.argv:
    x, G = closed_loop(T, 'fitted')
    sf.write('copy_vtl.wav', (x / (np.abs(x).max() + 1e-9) * 0.9).astype(np.float32), V.SR)
    V.write_tsq('copy_vtl.tsq', T, G)
    np.savez('step3_fit.npz', T=T, G=G, tv=tv)

if 'fitonly' in sys.argv:
    sys.exit(0)

# naive baseline: per phrase, the single predefined shape that matches best on average
base = Z['cb'][:19]
basedb = Z['cbdb'][:19]
segs = np.split(np.arange(len(key)), np.where(np.diff(t[key]) > 0.06)[0] + 1)
Tn = np.tile(V.shape('@'), (N, 1))
choice = []
for seg in segs:
    ks = key[seg]
    costs = [np.mean([V.distance(basedb[b] + calib, envg[k], floor) for k in ks]) + float(V.gain_penalty(basedb[b].max()))
             for b in range(len(base))]
    b = int(np.argmin(costs))
    choice.append((round(t[ks[0]], 2), round(t[ks[-1]], 2), b))
    a, e = np.searchsorted(tv, t[ks[0]] - 0.05), np.searchsorted(tv, t[ks[-1]] + 0.05)
    Tn[a:e] = base[b]
print('naive shapes per phrase:', choice)
xn, Gn = closed_loop(Tn, 'naive')
sf.write('naive_vtl.wav', (xn / (np.abs(xn).max() + 1e-9) * 0.9).astype(np.float32), V.SR)
np.savez('step3_naive.npz', Tn=Tn, Gn=Gn, tv=tv, choice=np.array(choice))
print('states', N, 'tsq lines', 8 + 2 * N)
