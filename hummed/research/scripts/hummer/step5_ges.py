"""Condense the dense fit into a VocalTractLab gestural score.

* Tract: each phrase's fitted trajectory is cut into quasi-stationary pieces; each piece becomes
  a vowel shape of its own ("f01", "f02", ...) written into a copy of the speaker file, and a
  vowel gesture that holds it. The velum gets its own tier.
* Voice quality: one glottal-shape gesture per phrase (VTL's 'breathy', or a custom shape on
  the modal-breathy line where the fit chose one).
* f0 and lung pressure: linear targets (value, slope) with VTL's 5th-order target approximation,
  fitted by linear least squares to the recording's f0 (in semitones re 1 Hz) and to the
  closed-loop lung pressure of the dense copy.
Writes copy.ges, copy.speaker, copy_ges.wav and a summary."""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, soundfile as sf
from target_approximation.target import Target
from target_approximation.filter import target_filter
import vtlfit as V

Z = dict(np.load('step1.npz'))
F = dict(np.load('step2.npz'))
S4 = dict(np.load('step4.npz'))
S3 = dict(np.load('step3_fit.npz'))
y, t, f0 = Z['y'], Z['t'], Z['f0']
key, voiced, P = F['key'], F['voiced'], F['P2s']
G, tv = S4['G'], S3['tv']
best = S4['best']
D = len(y) / V.SR
RATE = 1000 / V.FP          # 200 Hz analysis grid


# ------------------------------------------------------------- target approximation fitting

def fit_targets(bounds, tau, values, weights, ridge_m=1e-3, ridge_db=1e-3, blim=(-np.inf, np.inf), mlim=np.inf):
    """Linear targets on the intervals given by `bounds` (s), fitted so that VTL's 5th-order
    target filter, sampled on the analysis grid, follows `values` where `weights` > 0."""
    durs = np.diff(bounds)
    n = len(values)
    K = len(durs)

    def response(theta):
        tg = [Target(m=theta[2 * i], b=theta[2 * i + 1], tau=tau, duration=durs[i]) for i in range(K)]
        r = np.asarray(target_filter(tg, sample_rate=RATE, end_time=bounds[-1]), dtype=float)
        r = r[:, -1] if r.ndim == 2 else r          # (time, value) pairs
        return np.pad(r, (0, max(0, n - len(r))), mode='edge')[:n]

    A = np.stack([response(np.eye(2 * K)[j]) for j in range(2 * K)], axis=1)
    w = np.sqrt(weights[:n])
    rows = [A * w[:, None]]
    rhs = [values[:n] * w]
    R1 = np.zeros((K, 2 * K))
    R1[np.arange(K), 2 * np.arange(K)] = np.sqrt(ridge_m)                 # small slopes
    R2 = np.zeros((K - 1, 2 * K))
    for i in range(K - 1):
        R2[i, 2 * i + 1], R2[i, 2 * i + 3] = -np.sqrt(ridge_db), np.sqrt(ridge_db)   # continuity of offsets
    rows += [R1, R2]
    rhs += [np.zeros(K), np.zeros(K - 1)]
    from scipy.optimize import lsq_linear
    lo = np.ravel([[-mlim, blim[0]] for _ in range(K)])
    hi = np.ravel([[mlim, blim[1]] for _ in range(K)])
    theta = lsq_linear(np.vstack(rows), np.concatenate(rhs), bounds=(lo, hi), lsmr_tol='auto', max_iter=5000).x
    return [(theta[2 * i + 1], theta[2 * i], durs[i]) for i in range(K)], response(theta)


def phrase_runs():
    idx = np.where(voiced)[0]
    runs = np.split(idx, np.where(np.diff(idx) > 12)[0] + 1)
    return [(t[r[0]], t[r[-1]] + V.FP / 1000) for r in runs if len(r) > 20]


phrases = phrase_runs()


def boundaries(step):
    """phrase on/offsets, plus cuts every ~step s inside phrases"""
    b = [0.0]
    for a, e in phrases:
        b.append(a)
        k = max(1, int(round((e - a) / step)))
        b += list(np.linspace(a, e, k + 1)[1:])
    b.append(D)
    b = np.array(sorted(set(np.round(b, 4))))
    keep = np.r_[True, np.diff(b) > 0.02]
    return b[keep]


# f0 in semitones re 1 Hz, voiced frames only
st = np.where(f0 > 0, 12 * np.log2(np.maximum(f0, 1)), 0)
wf = ((f0 > 0) & voiced).astype(float)
vi = np.where(wf > 0)[0]
st_filled = np.interp(np.arange(len(st)), vi, st[vi])
fb = boundaries(0.12)
f0_targets, f0_curve = fit_targets(fb, 0.03, st_filled, wf + 0.02, ridge_m=1e-4, ridge_db=1e-3,
                                   blim=(12 * np.log2(40), 12 * np.log2(380)), mlim=60.0)
err_f0 = (f0_curve[: len(st)] - st)[wf > 0] * 100
print(f'f0: {len(f0_targets)} gestures, fit error median |{np.median(np.abs(err_f0)):.1f}| cents')

# lung pressure on the analysis grid
PR = np.interp(t, tv, G[:, V.GN.index('PR')])
pb = boundaries(0.10)
# VTL accepts lung-pressure gestures only flat (slope 0) and up to 15000 dPa
pr_targets, pr_curve = fit_targets(pb, 0.012, PR, np.ones(len(PR)), ridge_m=1e-2, ridge_db=1e-9,
                                   blim=(0.0, 15000.0), mlim=1e-9)
print(f'lung pressure: {len(pr_targets)} gestures, rms error {np.sqrt(np.mean((pr_curve[:len(PR)] - PR) ** 2)):.0f} dPa')


# ------------------------------------------------------------- tract pieces -> vowel shapes

PIECE_TOL = float(os.environ.get('PIECE_TOL', '0.09'))   # normalised RMS spread allowed within one vowel shape


def pieces():
    out = []
    segs = np.split(np.arange(len(key)), np.where(np.diff(t[key]) > 0.06)[0] + 1)
    for seg in segs:
        i = 0
        while i < len(seg):
            j = i + 1
            while j < len(seg):
                cand = V.norm(P[seg[i:j + 1]][:, V.FI])
                if np.sqrt(np.mean((cand - cand.mean(0)) ** 2)) > PIECE_TOL:
                    break
                j += 1
            out.append((seg[i], seg[j - 1]))
            i = j
    return out


pcs = pieces()
shapes = []
for n, (a, b) in enumerate(pcs):
    shapes.append((f'f{n + 1:02d}', P[a: b + 1].mean(0), t[key[a]], t[key[b]] + 0.02))
print(f'tract: {len(shapes)} custom vowel shapes')

# vowel gestures cover the whole timeline: each shape from its start to the next one's start
vg = []
starts = [0.0] + [s[2] for s in shapes[1:]] + [D]
for k, s in enumerate(shapes):
    vg.append((s[0], starts[k + 1] - starts[k], float(s[1][V.TN.index('VO')])))

# glottal shapes per phrase
QI = [V.GN.index(n) for n in ['XB', 'XT', 'CA']]
gv = {n: np.asarray(V.vtl.get_shape(n, 'glottis'), dtype=float) for n in ['modal', 'breathy']}
custom_glottis = {}
gg = []
pstarts = [0.0] + [float(b[0]) for b in best[1:]] + [D]
for k, (a, e, w) in enumerate(best):
    if abs(w - 1.0) < 1e-6:
        name = 'breathy'
    else:
        name = f'breathy{int(round(w * 100)):03d}'
        custom_glottis[name] = (1 - w) * gv['modal'] + w * gv['breathy']
    gg.append((name, pstarts[k + 1] - pstarts[k]))


# ------------------------------------------------------------- write speaker and score

sp = open(V.vtl.DEFAULT_SPEAKER_PATH, encoding='utf-8').read()
tract_xml = ''.join(
    f'      <shape name="{nm}">\n' + ''.join(f'        <param name="{p}" value="{v:.4f}"/>\n' for p, v in zip(V.TN, vals)) + '      </shape>\n'
    for nm, vals, *_ in shapes)
i = sp.index('    </shapes>')
sp = sp[:i] + tract_xml + sp[i:]
gl_xml = ''.join(
    f'        <shape name="{nm}">\n' + ''.join(f'          <control_param name="{p}" value="{v:.6f}"/>\n' for p, v in zip(V.GN, vals)) + '        </shape>\n'
    for nm, vals in custom_glottis.items())
g0 = sp.index('<glottis_model type="Geometric glottis"')
j = sp.index('      </shapes>', g0)
sp = sp[:j] + gl_xml + sp[j:]
open('copy.speaker', 'w', encoding='utf-8').write(sp)


def g(value, dur, tc, slope=0.0, neutral=0):
    v = value if isinstance(value, str) else f'{value:.6f}'
    return f'    <gesture value="{v}" slope="{slope:.6f}" duration_s="{dur:.6f}" time_constant_s="{tc:.6f}" neutral="{neutral}" />\n'


ges = ['<gestural_score>\n']
ges.append('  <gesture_sequence type="vowel-gestures" unit="">\n' + ''.join(g(nm, d, 0.015) for nm, d, _ in vg) + '  </gesture_sequence>\n')
for tier in ['lip-gestures', 'tongue-tip-gestures', 'tongue-body-gestures']:
    ges.append(f'  <gesture_sequence type="{tier}" unit="">\n  </gesture_sequence>\n')
ges.append('  <gesture_sequence type="velic-gestures" unit="">\n' + ''.join(g(vo, d, 0.015) for _, d, vo in vg) + '  </gesture_sequence>\n')
ges.append('  <gesture_sequence type="glottal-shape-gestures" unit="">\n' + ''.join(g(nm, d, 0.012) for nm, d in gg) + '  </gesture_sequence>\n')
ges.append('  <gesture_sequence type="f0-gestures" unit="st">\n' + ''.join(g(b, d, 0.03, slope=m) for b, m, d in f0_targets) + '  </gesture_sequence>\n')
ges.append('  <gesture_sequence type="lung-pressure-gestures" unit="dPa">\n' + ''.join(g(min(15000.0, max(0.0, b)), d, 0.012) for b, m, d in pr_targets) + '  </gesture_sequence>\n')
ges.append('</gestural_score>\n')
open('copy.ges', 'w').write(''.join(ges))
n_g = len(vg) * 2 + len(gg) + len(f0_targets) + len(pr_targets)
print(f'gestural score: {n_g} gestures in all ({len(vg)} vowel, {len(vg)} velic, {len(gg)} glottal, '
      f'{len(f0_targets)} f0, {len(pr_targets)} lung pressure) for {D:.1f} s')

# ------------------------------------------------------------- synthesise it
import vocaltractlab as vt
vt.load_speaker(os.path.abspath('copy.speaker'))
x = np.asarray(V.vtl.gesture_file_to_audio(os.path.abspath('copy.ges')), dtype=float)
x = np.pad(x, (0, max(0, len(y) - len(x))))[: len(y)]
sf.write('copy_ges.wav', (x / (np.abs(x).max() + 1e-9) * 0.9).astype(np.float32), V.SR)
np.savez('step5.npz', f0_curve=f0_curve, pr_curve=pr_curve, fb=fb, pb=pb)
print('written copy.ges, copy.speaker, copy_ges.wav')
