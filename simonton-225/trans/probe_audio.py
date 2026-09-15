"""What the transfer does to the sound: its pitch against A = 440 Hz, and how far its two channels agree."""
import json
from pathlib import Path

import librosa
import numpy as np
import scipy.signal as ss
import soundfile as sf

SCRATCH = Path(__file__).resolve().parent.parent
MUSIC_S = (6.0, 172.0)
WINDOW_S = 10.0
N_FFT, HOP = 16384, 4096
PEAK_BAND_HZ = (90.0, 1400.0)
COMPARED_S = (20.0, 160.0)
COHERENCE_BANDS_HZ = [(50, 150), (150, 300), (300, 600), (600, 1200), (1200, 2500), (2500, 5000)]


def peak_cents(signal: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """Spectral peaks between 90 and 1400 Hz, parabolically interpolated, in cents against A = 440 Hz, with their magnitudes."""
    f, _, Z = ss.stft(signal, sr, nperseg=N_FFT, noverlap=N_FFT - HOP, window='hann')
    magnitude = np.abs(Z)

    def in_frame(column: np.ndarray):
        peaks, _ = ss.find_peaks(column, height=column.max() * 0.05)
        peaks = peaks[(f[peaks] > PEAK_BAND_HZ[0]) & (f[peaks] < PEAK_BAND_HZ[1])]
        a, b, c = (np.log(column[peaks + d] + 1e-12) for d in (-1, 0, 1))
        frequency = (peaks + 0.5 * (a - c) / (a - 2 * b + c)) * sr / N_FFT
        return 1200 * np.log2(frequency / 440.0), column[peaks]

    frames = [in_frame(magnitude[:, j]) for j in range(magnitude.shape[1])]
    return np.concatenate([cents for cents, _ in frames]), np.concatenate([weights for _, weights in frames])


def offset_within_semitone(cents: np.ndarray, weights: np.ndarray) -> tuple[float, float]:
    """Circular mean of the peaks' distance to the equal-tempered grid, and how concentrated they are around it."""
    z = np.sum(weights * np.exp(2j * np.pi * cents / 100)) / np.sum(weights)
    return float(np.angle(z) / (2 * np.pi) * 100), float(np.abs(z))


def pitch_class_agreement(cents: np.ndarray, weights: np.ndarray, offset: float, profile: np.ndarray) -> dict[int, float]:
    """Correlation of the heard pitch classes with the roll's, for each whole-semitone shift on top of the offset."""
    def at_shift(semitones: int) -> float:
        classes = (np.round((cents - offset - 100 * semitones) / 100).astype(int) + 9) % 12
        heard = np.bincount(classes, weights=weights, minlength=12)
        return float(np.corrcoef(heard / heard.sum(), profile)[0, 1])
    return {semitones: at_shift(semitones) for semitones in range(-6, 6)}


def comb_strength(log_power: np.ndarray, spacing_hz: float) -> float:
    """Peak of the log-power ripple at quefrencies of 4–8 ms against its median at 9–20 ms: a comb filter shows as a peak."""
    detrended = (log_power - np.convolve(log_power, np.ones(301) / 301, 'same'))[400:-400]
    spectrum = np.abs(np.fft.rfft(detrended * np.hanning(len(detrended))))
    quefrency = np.fft.rfftfreq(len(detrended), d=spacing_hz)
    peak = spectrum[(quefrency > 0.004) & (quefrency < 0.008)].max()
    return float(peak / np.median(spectrum[(quefrency > 0.009) & (quefrency < 0.02)]))


def channel_agreement(stereo: np.ndarray, sr: int) -> dict:
    left, right = (stereo[int(COMPARED_S[0] * sr):int(COMPARED_S[1] * sr), k] for k in (0, 1))
    f, coherence = ss.coherence(left, right, sr, nperseg=8192)
    envelopes = [librosa.onset.onset_strength(y=librosa.resample(s, orig_sr=sr, target_sr=22050), sr=22050) for s in (left, right)]
    freqs, _ = ss.welch(left, sr, nperseg=65536)
    band = (freqs > 100) & (freqs < 3000)
    log_power = {name: 10 * np.log10(ss.welch(signal, sr, nperseg=65536)[1][band] + 1e-15)
                 for name, signal in (('L', left), ('R', right), ('M', (left + right) / 2))}
    spacing = freqs[1] - freqs[0]
    return {
        'coherence': {f'{lo}–{hi} Hz': float(coherence[(f >= lo) & (f < hi)].mean()) for lo, hi in COHERENCE_BANDS_HZ},
        'onset_envelope_correlation': float(np.corrcoef(*envelopes)[0, 1]),
        'comb_strength': {'L/R': comb_strength(log_power['L'] - log_power['R'], spacing),
                          'L/M': comb_strength(log_power['L'] - log_power['M'], spacing),
                          'R/M': comb_strength(log_power['R'] - log_power['M'], spacing),
                          'M': comb_strength(log_power['M'], spacing)},
    }


def main():
    stereo, sr = sf.read(SCRATCH / 'yt' / 'rec_stereo.wav')
    mono = stereo.mean(axis=1)
    music = mono[int(MUSIC_S[0] * sr):int(MUSIC_S[1] * sr)]
    cents, weights = peak_cents(music, sr)
    offset, concentration = offset_within_semitone(cents, weights)
    starts = np.arange(MUSIC_S[0], MUSIC_S[1], WINDOW_S)
    windows = [offset_within_semitone(*peak_cents(mono[int(s * sr):int((s + WINDOW_S) * sr)], sr))[0] for s in starts]
    versions = {v['siglum']: v for v in json.loads((SCRATCH / 'emu' / 'versions.json').read_text())['versions']}
    profile = np.bincount([n['pitch'] % 12 for n in versions['C']['notes']], minlength=12).astype(float)
    probe = {
        'seconds': len(mono) / sr,
        'cents_sharp': offset,
        'concentration': concentration,
        'cents_sharp_by_window': dict(zip([float(s) for s in starts], windows)),
        'pitch_class_correlation_by_shift': pitch_class_agreement(cents, weights, offset, profile / profile.sum()),
        'channels': channel_agreement(stereo, sr),
    }
    (SCRATCH / 'trans' / 'audio_probe.json').write_text(json.dumps(probe, indent=1, ensure_ascii=False))
    print(json.dumps(probe, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
