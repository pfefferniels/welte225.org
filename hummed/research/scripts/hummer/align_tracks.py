"""Align one VTL rendering to another of the same score: the self-oscillating glottis runs a
little differently under a different tract, so the glottal cycles of the two drift apart (up to
about a millisecond). Track the lag every 20 ms, keep it continuous, and resample."""
import numpy as np


def track_lag(ref, x, sr, hop=0.02, win=0.04, max_ms=4.0, jump=0.35):
    H, W, L = int(hop * sr), int(win * sr), int(max_ms / 1000 * sr)
    thr = 0.02 * np.sqrt(np.mean(ref ** 2))
    times, lags, prev = [], [], 0
    nfft = 1 << int(np.ceil(np.log2(W + 2 * L)))
    for i in range(L, len(ref) - W - L, H):
        r = ref[i:i + W]
        if np.sqrt(np.mean(r ** 2)) < thr:
            times.append(i + W // 2); lags.append(np.nan); prev = 0; continue
        seg = x[i - L:i + W + L]
        cc = np.fft.irfft(np.fft.rfft(seg, nfft) * np.conj(np.fft.rfft(r, nfft)), nfft)[:2 * L + 1]
        cc = cc / (np.sqrt(np.sum(r ** 2) * np.convolve(seg ** 2, np.ones(W), 'valid')[:2 * L + 1]) + 1e-20)
        s = np.arange(-L, L + 1)
        score = cc - jump * np.abs(s - prev) / L        # prefer the peak nearest the last lag
        k = int(np.argmax(score))
        times.append(i + W // 2); lags.append(s[k]); prev = s[k]
    return np.array(times), np.array(lags, dtype=float)


def align(ref, x, sr):
    """x resampled so that it lines up with ref; returns (x_aligned, times, lags)"""
    from scipy.ndimage import median_filter
    t, lag = track_lag(ref, x, sr)
    ok = ~np.isnan(lag)
    lag_f = np.interp(np.arange(len(lag)), np.flatnonzero(ok), lag[ok])
    lag_f = median_filter(lag_f, 7)
    k = np.ones(9) / 9                                   # ~180 ms smoothing
    lag_f = np.convolve(np.pad(lag_f, 4, mode='edge'), k, 'valid')
    n = np.arange(len(x))
    d = np.interp(n, t, lag_f)
    return np.interp(n + d, n, x), t, lag_f
