"""Signal-processing renderings of the control curves: sine tones, additive harmonic hum,
and an LF glottal source through a Klatt-style cascade (closed-mouth [m] or open [u])."""
import numpy as np
import numba
from scipy.signal import resample_poly, lfilter, butter

import voicemodel as vm

SR = 44100


def upsample(x, sr, cr=vm.CR):
    n = int(len(x) * sr / cr)
    ti = np.arange(n) / sr
    return np.interp(ti, np.arange(len(x)) / cr, x)


# --- sine -------------------------------------------------------------------------------

def sine_literal(mel, mode='gruenfeld'):
    """Each note as a sine at its pitch, from key-on to key-off (as on the roll), level from
    velocity; 8 ms ramps. The most literal sonification of the data."""
    notes = vm.build_notes(mel, mode=mode)
    pad = 0.6
    end = max(n.key_off for n in notes) + pad + 1
    out = np.zeros(int(end * SR))
    for n in notes:
        a, b = int((n.on + pad) * SR), int((n.key_off + pad) * SR)
        t = np.arange(b - a) / SR
        f = 440 * 2 ** ((n.pitch - 69) / 12)
        env = np.minimum(1, np.minimum(t / 0.008, (t[-1] - t) / 0.008))
        out[a:b] += 10 ** (vm.vel_to_db(n.velocity) / 20) * env * np.sin(2 * np.pi * f * t)
    return out


# --- spectral envelopes ------------------------------------------------------------------

KLATT = {
    # Klatt (1980) cascade values; [m] has a nasal pole/zero pair, the oral formants of the
    # closed tract, and is dominated by the 270 Hz nasal murmur.
    # Bandwidths of the higher formants widened: the nasal tract is heavily damped.
    'm': dict(formants=[(480, 40), (1270, 350), (2130, 450), (3300, 550), (3750, 600)],
              nasal_pole=(270, 100), nasal_zero=(450, 100), lowpass=1500),
    # [u] for a female voice (Peterson & Barney 1952 means), with F1 tuned to f0 when f0 rises
    # above it, as sopranos do.
    'u': dict(formants=[(370, 60), (950, 90), (2670, 150), (3300, 250), (4000, 300)],
              nasal_pole=(270, 100), nasal_zero=(270, 100)),
}


def tract_energy(ctrl, vowel, tilt_lo=-12.0, tilt_hi=-7.5, step=10):
    """RMS gain of source slope x tract over the harmonics, per control frame (relative to the
    median), so that loudness follows the dynamics curve rather than which harmonic happens to
    fall on a formant."""
    f0 = ctrl.f0_hz[::step]
    lev = ctrl.level_db[::step]
    tilt = np.interp(lev, [-30, -12], [tilt_lo, tilt_hi])
    e = np.zeros(len(f0))
    for h in range(1, 40):
        fh = h * f0
        db = tilt * np.log2(h) + envelope_db(fh, vowel, f0)
        if 'lowpass' in KLATT[vowel]:
            db = db - 10 * np.log10(1 + (fh / KLATT[vowel]['lowpass']) ** 2)
        e += 10 ** (db / 10) * (fh < 9000)
    e = np.sqrt(e)
    e = np.interp(np.arange(len(ctrl.f0_hz)), np.arange(len(e)) * step, e)
    return e / np.median(e)


def resonator_mag(f, F, B):
    return 1 / np.abs(1 - (f / F) ** 2 + 1j * f * B / F ** 2)


def envelope_db(f, vowel, f0=None):
    p = KLATT[vowel]
    h = np.ones_like(f)
    for i, (F, B) in enumerate(p['formants']):
        if i == 0 and vowel == 'u' and f0 is not None:
            F = np.maximum(F, 1.08 * f0)
            B = np.maximum(B, 0.15 * F)
        h = h * resonator_mag(f, F, B)
    h = h * resonator_mag(f, *p['nasal_pole']) / resonator_mag(f, *p['nasal_zero'])
    return 20 * np.log10(h + 1e-12)


# --- additive -----------------------------------------------------------------------------

def additive(ctrl, vowel='m', seed=3):
    """Harmonic sum; each harmonic's amplitude = gain x source slope x tract envelope at h*f0."""
    rng = np.random.default_rng(seed)
    f0c = ctrl.f0_hz
    level = ctrl.level_db
    f0 = upsample(f0c, SR)
    gain = upsample(ctrl.gain / tract_energy(ctrl, vowel), SR)
    phase = 2 * np.pi * np.cumsum(f0) / SR
    out = np.zeros_like(f0)
    # source slope: -12 dB/oct (soft) to -9 dB/oct (louder), +6 dB/oct radiation
    tilt = np.interp(level, [-30, -12], [-12.0, -7.5])   # net dB/oct
    hmax = int(9000 / f0c.min()) + 1
    for h in range(1, hmax + 1):
        fh = h * f0c
        amp_db = tilt * np.log2(h) + envelope_db(fh, vowel, f0c)
        if 'lowpass' in KLATT[vowel]:
            amp_db = amp_db - 10 * np.log10(1 + (fh / KLATT[vowel]['lowpass']) ** 2)
        amp = 10 ** (amp_db / 20) * (fh < 9000)
        if not amp.any():
            break
        out += upsample(amp, SR) * np.sin(h * phase + rng.random() * 2 * np.pi)
    out *= gain
    out += 0.004 * gain * nasal_noise(len(out))
    out += breath_noise(ctrl, vowel) * np.max(np.abs(out)) / 0.05
    return out


def nasal_noise(n, seed=5):
    rng = np.random.default_rng(seed)
    b, a = butter(2, [200 / (SR / 2), 1500 / (SR / 2)], 'band')
    return lfilter(b, a, rng.normal(0, 1, n))


def breath_noise(ctrl, vowel, seed=7):
    """Inhalation between phrases: through the nose for the hum, through the mouth for 'oo'."""
    rng = np.random.default_rng(seed)
    env = upsample(ctrl.breath, SR)
    lo, hi, lvl = (250, 1800, 0.0015) if vowel == 'm' else (400, 3500, 0.0025)
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return lvl * env * lfilter(b, a, rng.normal(0, 1, len(env)))


# --- LF glottal source ---------------------------------------------------------------------

def lf_pulse(Rd, n=4096):
    """One period of the LF glottal flow derivative for Fant's Rd parameter, Ee = 1."""
    Rap = (-1 + 4.8 * Rd) / 100
    Rkp = (22.4 + 11.8 * Rd) / 100
    Rgp = 0.25 * Rkp / ((0.11 * Rd) / (0.5 + 1.2 * Rkp) - Rap)
    tp = 1 / (2 * Rgp)
    te = tp * (1 + Rkp)
    ta = Rap
    wg = np.pi / tp
    eps = 1 / ta
    for _ in range(100):
        eps = (1 - np.exp(-eps * (1 - te))) / ta
    ret_area = -(1 / (eps * ta)) * ((1 - np.exp(-eps * (1 - te))) / eps - (1 - te) * np.exp(-eps * (1 - te)))

    def area(alpha):
        E0 = -1 / (np.exp(alpha * te) * np.sin(wg * te))
        op = E0 * (np.exp(alpha * te) * (alpha * np.sin(wg * te) - wg * np.cos(wg * te)) + wg) / (alpha ** 2 + wg ** 2)
        return op + ret_area

    lo, hi = -100.0, 300.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if area(mid) > 0:
            hi = mid
        else:
            lo = mid
    alpha = (lo + hi) / 2
    E0 = -1 / (np.exp(alpha * te) * np.sin(wg * te))
    t = np.arange(n) / n
    e = np.where(t <= te, E0 * np.exp(alpha * t) * np.sin(wg * t),
                 -(1 / (eps * ta)) * (np.exp(-eps * (t - te)) - np.exp(-eps * (1 - te))))
    return e - e.mean()


RD_GRID = np.round(np.arange(0.5, 2.61, 0.05), 3)
LF_TABLE = np.stack([lf_pulse(r) for r in RD_GRID])


@numba.njit(cache=True)
def _wavetable(phase_frac, rd, table, rd0, drd):
    n = len(phase_frac)
    out = np.empty(n)
    L = table.shape[1]
    R = table.shape[0]
    for i in range(n):
        x = (rd[i] - rd0) / drd
        j = int(x)
        if j < 0:
            j, fr = 0, 0.0
        elif j >= R - 1:
            j, fr = R - 2, 1.0
        else:
            fr = x - j
        p = phase_frac[i] * L
        k = int(p)
        fp = p - k
        k2 = (k + 1) % L
        a = table[j, k] * (1 - fp) + table[j, k2] * fp
        b = table[j + 1, k] * (1 - fp) + table[j + 1, k2] * fp
        out[i] = a * (1 - fr) + b * fr
    return out


@numba.njit(cache=True)
def _tv_resonator(x, F, B, sr, anti):
    n = len(x)
    y = np.zeros(n)
    y1 = 0.0
    y2 = 0.0
    x1 = 0.0
    x2 = 0.0
    T = 1.0 / sr
    for i in range(n):
        C = -np.exp(-2 * np.pi * B[i] * T)
        Bc = 2 * np.exp(-np.pi * B[i] * T) * np.cos(2 * np.pi * F[i] * T)
        A = 1 - Bc - C
        if anti:
            y[i] = (x[i] - Bc * x1 - C * x2) / A
            x2 = x1
            x1 = x[i]
        else:
            y[i] = A * x[i] + Bc * y1 + C * y2
            y2 = y1
            y1 = y[i]
    return y


def lf_klatt(ctrl, vowel='m', seed=11, os=2):
    """LF source (Rd follows loudness: softer = laxer) through a Klatt cascade, rendered at
    os x 44.1 kHz and decimated."""
    rng = np.random.default_rng(seed)
    sr = SR * os
    f0 = upsample(ctrl.f0_hz, sr)
    level = upsample(ctrl.level_db, sr)
    gain = upsample(ctrl.gain / tract_energy(ctrl, vowel, -12.0, -6.0), sr)
    # small cycle-to-cycle jitter (0.3 %) on top of the f0 contour
    jit = 1 + 0.003 * np.repeat(rng.normal(0, 1, len(f0) // 200 + 1), 200)[:len(f0)]
    ph = np.cumsum(f0 * jit) / sr
    frac = ph - np.floor(ph)
    rd = np.clip(np.interp(level, [-30, -12], [2.3, 1.2]), 0.5, 2.6)
    src = _wavetable(frac, rd, LF_TABLE, RD_GRID[0], 0.05)
    # aspiration, pitch-synchronous, more when lax
    asp = rng.normal(0, 1, len(src)) * (0.5 + 0.5 * np.cos(2 * np.pi * frac)) * (rd - 0.8) * 0.02
    x = (src + asp) * gain
    p = KLATT[vowel]
    ones = np.ones(len(x))
    fz, bz = p['nasal_zero']
    fp, bp = p['nasal_pole']
    if fz != fp:
        x = _tv_resonator(x, fz * ones, bz * ones, sr, True)
        x = _tv_resonator(x, fp * ones, bp * ones, sr, False)
    for i, (F, B) in enumerate(p['formants']):
        Fv = F * ones
        Bv = B * ones
        if i == 0 and vowel == 'u':
            Fv = np.maximum(F, 1.08 * f0)
            Bv = np.maximum(B, 0.15 * Fv)
        x = _tv_resonator(x, Fv, Bv, sr, False)
    if 'lowpass' in p:
        b, a = butter(1, p['lowpass'] / (sr / 2))
        x = lfilter(b, a, x)
    y = resample_poly(x, 1, os)
    y += breath_noise(ctrl, vowel)[:len(y)] * np.max(np.abs(y)) / 0.05
    return y


# --- room and level -----------------------------------------------------------------------

def room(x, sr=SR, rt60=1.1, wet_db=-16, seed=2):
    """A small hall: exponentially decaying stereo noise impulse response."""
    rng = np.random.default_rng(seed)
    n = int(rt60 * 1.3 * sr)
    t = np.arange(n) / sr
    decay = np.exp(-6.9 * t / rt60)
    irs = []
    b, a = butter(1, 5000 / (sr / 2))
    for ch in range(2):
        ir = rng.normal(0, 1, n) * decay
        ir[: int(0.012 * sr)] = 0
        ir = lfilter(b, a, ir)
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    from scipy.signal import fftconvolve
    wet = np.stack([fftconvolve(x, ir)[: len(x)] for ir in irs])
    dry = np.stack([x, x])
    return dry + 10 ** (wet_db / 20) * wet * 3


def normalize(x, target_rms_db=-23.0, peak=0.97):
    """RMS over the voiced part to target, peaks limited."""
    mono = x if x.ndim == 1 else x.mean(axis=0)
    thr = np.max(np.abs(mono)) * 1e-3
    act = mono[np.abs(mono) > thr]
    rms = np.sqrt(np.mean(act ** 2)) if len(act) else 1
    y = x * 10 ** (target_rms_db / 20) / rms
    m = np.max(np.abs(y))
    if m > peak:
        y = y * peak / m
    return y
