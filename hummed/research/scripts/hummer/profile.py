"""Style profile of the recorded humming, to give the Grünfeld hummer the same amount of
inflection, breathing and articulatory movement. Writes profile.json and palette.npz."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy.ndimage import median_filter, uniform_filter1d
from scipy.signal import welch
import vtlfit as V

Z = dict(np.load('step1.npz'))
F = dict(np.load('step2.npz'))
S4 = dict(np.load('step4.npz'))
t, f0, lev = Z['t'], Z['f0'], Z['lev']
voiced = F['voiced']
key, P, kinds = F['key'], F['P2s'], F['kinds']
dt = V.FP / 1000

idx = np.where(voiced)[0]
runs = [r for r in np.split(idx, np.where(np.diff(idx) > 12)[0] + 1) if len(r) * dt > 0.4]
st = 12 * np.log2(np.maximum(f0, 1))

scoops, falls, attack, release, plateau = [], [], [], [], []
wob = []
for r in runs:
    s = st[r]
    s = np.where(f0[r] > 0, s, np.nan)
    n = len(r)
    ref_on = np.nanmedian(s[int(0.3 / dt): int(0.8 / dt)]) if n * dt > 0.9 else np.nanmedian(s)
    ref_off = np.nanmedian(s[-int(0.8 / dt): -int(0.3 / dt)]) if n * dt > 0.9 else np.nanmedian(s)
    first, last = np.nanmedian(s[: int(0.06 / dt)]), np.nanmedian(s[-int(0.06 / dt):])
    scoops.append(first - ref_on)
    falls.append(last - ref_off)
    L = lev[r]
    peak = np.percentile(L, 90)
    attack.append(np.argmax(L > peak - 3) * dt)
    release.append((n - 1 - np.where(L > peak - 3)[0][-1]) * dt)
    # wobble: deviation from a 250 ms running median, in cents
    sm = median_filter(np.nan_to_num(s, nan=np.nanmedian(s)), size=int(0.25 / dt))
    wob.append((np.nan_to_num(s, nan=np.nanmedian(s)) - sm) * 100)

w = np.concatenate(wob)
fr, pxx = welch(w, fs=1 / dt, nperseg=256)
band = (fr > 1) & (fr < 15)
slope = np.abs(np.diff(st[voiced])) / dt        # semitones per second, voiced neighbours
slope = slope[slope < 200]

# articulatory movement: deviation of each fitted parameter from its 300 ms running mean
mov = {}
for j, nm in zip(V.FI, V.FIT):
    x = P[:, j]
    m = uniform_filter1d(x, size=15, mode='nearest')
    mov[nm] = float(np.std(x - m) / (V.TMAX[j] - V.TMIN[j]))

# posture palette: k-means per phrase type on the fitted keyframes
def kmeans(X, k, seed=0, it=50):
    rng = np.random.default_rng(seed)
    C = X[rng.choice(len(X), k, replace=False)]
    for _ in range(it):
        lab = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
        C = np.array([X[lab == i].mean(0) if np.any(lab == i) else C[i] for i in range(k)])
    return C, lab

palette = {}
for kind, k in [('hum', 3), ('open', 4)]:
    sel = kinds == kind
    Xn = V.norm(P[sel][:, V.FI])
    C, lab = kmeans(Xn, k)
    full = np.array([P[sel][lab == i].mean(0) for i in range(k)])
    order = np.argsort([-(lab == i).sum() for i in range(k)])
    for n_, i in enumerate(order):
        palette[f'{kind}{n_ + 1}'] = full[i]

# how often the posture changes: the gestural-score fit cut the voiced time into this many shapes
n_shapes = len(open('copy.ges').read().split('type="vowel-gestures"')[1].split('</gesture_sequence>')[0].split('<gesture ')) - 1
voiced_s = voiced.sum() * dt
gaps = np.diff([t[r[0]] for r in runs])
breath = [float(t[runs[i + 1][0]] - t[runs[i][-1]]) for i in range(len(runs) - 1)]

prof = dict(
    f0_scoop_st=float(np.median(scoops)), f0_scoop_all=[round(float(x), 2) for x in scoops],
    f0_fall_st=float(np.median(falls)), f0_fall_all=[round(float(x), 2) for x in falls],
    wobble_cents_rms=float(np.std(w)), wobble_peak_hz=float(fr[band][np.argmax(pxx[band])]),
    glide_st_per_s_p50=float(np.percentile(slope, 50)), glide_st_per_s_p95=float(np.percentile(slope, 95)),
    attack_s=float(np.median(attack)), release_s=float(np.median(release)),
    breath_gap_s=[round(b, 2) for b in breath],
    posture_changes_per_s=float(n_shapes / voiced_s),
    movement_rel_std=mov,
    voice_quality='breathy (w = 1 on the modal-breathy line) in every phrase',
    f0_median_hz=float(np.median(f0[voiced & (f0 > 0)])),
)
json.dump(prof, open('profile.json', 'w'), indent=1)
np.savez('palette.npz', names=np.array(list(palette)), shapes=np.array(list(palette.values())))
for k, v in prof.items():
    print(f'{k:24s} {v}')
print('palette:', {k: dict(LD=round(v[V.TN.index("LD")], 2), VO=round(v[V.TN.index("VO")], 2), JA=round(v[V.TN.index("JA")], 2)) for k, v in palette.items()})
