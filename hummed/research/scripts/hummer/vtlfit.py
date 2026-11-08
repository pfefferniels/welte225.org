"""Copy a voice recording with VocalTractLab by analysis-by-synthesis (articulatory inversion).

1. Analyse the recording with WORLD: f0, spectral envelope, aperiodicity, level.
2. Calibrate what VTL's glottal source and radiation add to its tract transfer function, by
   synthesising static shapes and comparing the output envelope with the transfer function.
3. For every analysis frame, search the tract parameters whose transfer function (+ that
   calibration) best matches the recording's envelope: a codebook of mixtures of the speaker's
   own shapes gives the start, a bounded local search refines it, a temporal smoothing pass and
   a second search with a continuity penalty make the trajectories articulatory rather than
   frame-by-frame noise.
4. Glottis: f0 straight from the recording; lung pressure adjusted in closed loop until the
   synthesised level follows the recording's.
5. Write everything as a VTL tract sequence file (110 samples per state, ~2.5 ms).
"""
import numpy as np
import soundfile as sf
import pyworld as pw
from scipy.signal import resample_poly
from scipy.ndimage import median_filter, uniform_filter1d
import vocaltractlab_cython as vtl

SR = 44100
C = vtl.get_constants()
SPS = C['n_samples_per_state']            # 110
FR = SR / SPS                              # ~400.9 states/s
TRACT = vtl.get_param_info('tract')
GLOT = vtl.get_param_info('glottis')
TN = [p['name'] for p in TRACT]
GN = [p['name'] for p in GLOT]
TMIN = np.array([p['min'] for p in TRACT])
TMAX = np.array([p['max'] for p in TRACT])
FIT = ['HY', 'JA', 'LP', 'LD', 'VO', 'TCX', 'TCY', 'TTX', 'TTY', 'TRX']
FI = [TN.index(n) for n in FIT]
NSPEC = 2048
GRID = 700 * (10 ** (np.linspace(np.log10(1 + 90 / 700), np.log10(1 + 5000 / 700), 64)) - 1)  # mel-spaced
FP = 5.0   # ms analysis frame period


# ---------------------------------------------------------------- analysis of the recording

def load_target(path):
    y, sr = sf.read(path)
    if y.ndim > 1:
        y = y.mean(axis=1)
    if sr != SR:
        g = np.gcd(sr, SR)
        y = resample_poly(y, SR // g, sr // g)
    y = y / (np.abs(y).max() + 1e-12) * 0.5
    return y


def analyse(y):
    y = y.astype(np.float64)
    f0, t = pw.harvest(y, SR, f0_floor=60, f0_ceil=600, frame_period=FP)
    sp = pw.cheaptrick(y, f0, t, SR, fft_size=2048)
    ap = pw.d4c(y, f0, t, SR, fft_size=2048)
    hop = int(SR * FP / 1000)
    win = int(0.03 * SR)
    e = np.sqrt(uniform_filter1d(y ** 2, win) + 1e-14)
    lev = 20 * np.log10(e[np.minimum((t * SR).astype(int), len(e) - 1)])
    fbin = np.arange(sp.shape[1]) * SR / 2048
    env = 10 * np.log10(sp + 1e-20)                          # dB, linear frequency
    envg = np.stack([np.interp(GRID, fbin, row) for row in env])
    voiced = f0 > 0
    # noise floor per grid point: low percentile over the quiet unvoiced frames
    quiet = (~voiced) & (lev < np.percentile(lev, 30))
    floor = np.percentile(envg[quiet], 50, axis=0) if quiet.sum() > 10 else np.full(len(GRID), -200.0)
    return dict(t=t, f0=f0, sp=sp, ap=ap, lev=lev, envg=envg, voiced=voiced, floor=floor)


# ---------------------------------------------------------------- the model side

def shape(name):
    return np.asarray(vtl.get_shape(name, 'tract'), dtype=float).copy()


def tf_db(state):
    r = vtl.tract_state_to_transfer_function(np.asarray(state, dtype=float), n_spectrum_samples=NSPEC,
                                             save_phase_spectrum=False)
    m = np.asarray(r['magnitude_spectrum'])
    f = np.arange(len(m)) * SR / len(m)
    return np.interp(GRID, f, 20 * np.log10(m + 1e-12))


def synth(tract_frames, glottis_frames):
    y = vtl.synth_block(np.asarray(tract_frames, float), np.asarray(glottis_frames, float), state_samples=SPS)
    return np.asarray(y, dtype=float)


def static_glottis(n, f0=110.0, pr=8000.0, kind='modal'):
    g = np.asarray(vtl.get_shape(kind, 'glottis'), dtype=float)
    G = np.tile(g, (n, 1))
    G[:, GN.index('F0')] = f0
    G[:, GN.index('PR')] = pr
    G[: 20, GN.index('PR')] = np.linspace(0, pr, 20)
    return G


def calibrate(names=('a', 'e', 'i', 'o', 'u', '@', 'E', 'O')):
    """dB that VTL's source and radiation add to the transfer function, on GRID."""
    diffs = []
    for nm in names:
        s = shape(nm)
        n = int(0.7 * FR)
        y = synth(np.tile(s, (n, 1)), static_glottis(n))
        seg = y[int(0.3 * SR): int(0.6 * SR)]
        f0, t = pw.harvest(seg, SR, f0_floor=60, f0_ceil=400, frame_period=FP)
        sp = pw.cheaptrick(seg, f0, t, SR, fft_size=2048)
        fbin = np.arange(sp.shape[1]) * SR / 2048
        env = 10 * np.log10(np.mean(sp[f0 > 0], axis=0) + 1e-20)
        diffs.append(np.interp(GRID, fbin, env) - tf_db(s))
    d = np.array(diffs)
    return np.median(d, axis=0) - np.median(d)


# ---------------------------------------------------------------- matching

def distance(model_db, target_db, floor_db, weight=None):
    """Mean squared dB difference after removing the best gain. Where the target sits at the
    recording's noise floor it only bounds the model from above."""
    above = target_db > floor_db + 6
    d = model_db - target_db
    g = np.median(d[above]) if above.sum() > 8 else np.median(d)
    d = d - g
    d = np.where(above, d, np.maximum(d, 0))
    w = np.ones_like(d) if weight is None else weight
    return float(np.sum(w * d * d) / np.sum(w))


PEAK_MIN = 5.0   # dB: a tract whose transfer function peaks lower lets almost no sound out


def gain_penalty(peak_db):
    """The envelope match ignores overall gain, so without this a closed tract (lips and velum
    shut) can win by the spectral shape of its leakage. A real voice needs an open path."""
    return 2.0 * np.maximum(0.0, PEAK_MIN - peak_db) ** 2


def codebook(n_mix=1500, seed=0):
    """Mixtures of the speaker's predefined shapes, with and without a lowered velum and closed
    lips: a dense starting set for the search."""
    rng = np.random.default_rng(seed)
    base = ['a', 'e', 'i', 'o', 'u', '@', 'E', 'O', 'I', 'U', 'y', 'Y', '2', '9', '6', 'E:',
            'll-labial-closure(a)', 'll-labial-closure(u)', 'll-labial-closure(i)']
    S = np.array([shape(b) for b in base])
    states = list(S)
    for _ in range(n_mix):
        k = rng.integers(2, 4)
        idx = rng.choice(len(S), k, replace=False)
        w = rng.dirichlet(np.ones(k))
        s = (w[:, None] * S[idx]).sum(0)
        r = rng.random()
        if r < 0.35:
            s[TN.index('VO')] = rng.uniform(0.05, 0.6)          # nasal coupling
        if r < 0.2:
            s[TN.index('LD')] = rng.uniform(-0.5, 0.0)          # lips closed: a hum
        states.append(np.clip(s, TMIN, TMAX))
    return np.array(states)


def norm(p):
    return (p - TMIN[FI]) / (TMAX[FI] - TMIN[FI])


def refine(start, target_db, floor_db, calib, prior=None, lam=0.0, iters=150, seed=0, lo=None, hi=None):
    """Bounded random-restart coordinate search over the FIT parameters (cheap and robust with a
    ~20 ms objective; gradients are not available)."""
    rng = np.random.default_rng(seed)
    lo = TMIN[FI] if lo is None else lo
    hi = TMAX[FI] if hi is None else hi
    best = start.copy()
    best[FI] = np.clip(best[FI], lo, hi)

    def cost(s):
        m = tf_db(s)
        c = distance(m + calib, target_db, floor_db) + float(gain_penalty(m.max()))
        if prior is not None and lam > 0:
            c += lam * float(np.sum((norm(s[FI]) - norm(prior[FI])) ** 2))
        return c

    bc = cost(best)
    step = 0.12
    for it in range(iters):
        cand = best.copy()
        k = rng.integers(1, 4)
        for j in rng.choice(len(FI), k, replace=False):
            span = TMAX[FI[j]] - TMIN[FI[j]]
            cand[FI[j]] = np.clip(cand[FI[j]] + rng.normal(0, step) * span, lo[j], hi[j])
        cc = cost(cand)
        if cc < bc:
            best, bc = cand, cc
        if it % 50 == 49:
            step *= 0.6
    return best, bc


def bounds_for(kind):
    """Articulatory constraints per phrase type. A hum seals the lips and lowers the velum (sound
    leaves through the nose, no lip turbulence); an open vowel keeps the lips far enough apart
    that VTL's noise source at a narrow constriction stays quiet."""
    lo, hi = TMIN[FI].copy(), TMAX[FI].copy()
    ld, vo = FIT.index('LD'), FIT.index('VO')
    if kind == 'hum':
        lo[ld], hi[ld] = -0.5, -0.1
        lo[vo], hi[vo] = 0.1, 0.8
    else:
        lo[ld] = 0.35
    return lo, hi


# ---------------------------------------------------------------- tract sequence file

HEADER = """# The first two lines (below the comment lines) indicate the name of the vocal fold model and the number of states.
# The following lines contain the control parameters of the vocal folds and the vocal tract (states)
# in steps of 110 audio samples (corresponding to about 2.5 ms for the sampling rate of 44100 Hz).
# For every step, there is one line with the vocal fold parameters followed by
# one line with the vocal tract parameters.
#
Geometric glottis
"""


def write_tsq(path, T, G):
    with open(path, 'w') as f:
        f.write(HEADER)
        f.write(f'{len(T)}\n')
        for g, s in zip(G, T):
            f.write(' '.join(f'{x:.4g}' for x in g) + ' \n')
            f.write(' '.join(f'{x:.4g}' for x in s) + ' \n')
