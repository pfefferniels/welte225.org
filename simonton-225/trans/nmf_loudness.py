"""Per-note loudness by score-informed NMF (Ewert & Müller 2012): harmonic and onset templates per pitch,
activations constrained to the aligned span of each note, loudness read at the onset."""
import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np

SR = 22050
N_FFT = 4096
HOP = 220
F_MAX = 6000.0
PARTIALS = 24
EPS = 1e-10


@dataclass(frozen=True)
class AlignedNote:
    index: int
    pitch: int
    onset: float
    offset: float


def magnitude_spectrogram(path: Path) -> tuple[np.ndarray, np.ndarray]:
    audio, _ = librosa.load(path, sr=SR, mono=True)
    spectrum = np.abs(librosa.stft(audio, n_fft=N_FFT, hop_length=HOP, window='hann'))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=N_FFT)
    keep = freqs <= F_MAX
    return spectrum[keep], freqs[keep]


def harmonic_template(pitch: int, freqs: np.ndarray, inharmonicity: float = 3e-4) -> np.ndarray:
    f0 = librosa.midi_to_hz(pitch)
    k = np.arange(1, PARTIALS + 1)
    partials = k * f0 * np.sqrt(1 + inharmonicity * k ** 2)
    width = np.maximum(SR / N_FFT * 1.5, partials * 0.012)
    mask = np.exp(-0.5 * ((freqs[None, :] - partials[:, None]) / width[:, None]) ** 2)
    template = (mask / k[:, None]).sum(axis=0)
    return template / (template.sum() + EPS)


def onset_template(pitch: int, freqs: np.ndarray) -> np.ndarray:
    f0 = librosa.midi_to_hz(pitch)
    template = np.where(freqs > f0 * 0.8, 1.0 / np.maximum(freqs, 1.0) ** 0.5, 0.0)
    return template / (template.sum() + EPS)


def activation_mask(notes: list[AlignedNote], pitches: list[int], frames: int) -> tuple[np.ndarray, np.ndarray]:
    """Harmonic activations may be non-zero from just before a note's onset until well into its decay;
    onset activations only in a short window around the onset."""
    to_frame = lambda t: int(round(t * SR / HOP))
    harmonic = np.zeros((len(pitches), frames))
    percussive = np.zeros((len(pitches), frames))
    row = {pitch: k for k, pitch in enumerate(pitches)}
    for note in notes:
        start = max(0, to_frame(note.onset - 0.06))
        stop = min(frames, to_frame(max(note.offset, note.onset + 0.3) + 1.5))
        harmonic[row[note.pitch], start:stop] = 1
        percussive[row[note.pitch], start:min(frames, to_frame(note.onset + 0.06))] = 1
    return harmonic, percussive


def factorise(V: np.ndarray, W: np.ndarray, H: np.ndarray, W_support: np.ndarray, iterations: int) -> tuple[np.ndarray, np.ndarray]:
    """KL-divergence NMF with multiplicative updates; zeros in W and H stay zero, which carries the constraints."""
    for _ in range(iterations):
        R = W @ H + EPS
        H *= (W.T @ (V / R)) / (W.sum(axis=0)[:, None] + EPS)
        R = W @ H + EPS
        W *= (V / R) @ H.T / (H.sum(axis=1)[None, :] + EPS)
        W *= W_support
        norms = W.sum(axis=0, keepdims=True) + EPS
        W /= norms
        H *= norms.T
    return W, H


def note_loudness(notes: list[AlignedNote], H_harm: np.ndarray, H_perc: np.ndarray, pitches: list[int]) -> list[dict]:
    row = {pitch: k for k, pitch in enumerate(pitches)}
    to_frame = lambda t: int(round(t * SR / HOP))

    def peak(H, note, before, after):
        start, stop = max(0, to_frame(note.onset - before)), to_frame(note.onset + after)
        return float(H[row[note.pitch], start:stop].max()) if stop > start else float('nan')

    def floor(H, note):
        start, stop = max(0, to_frame(note.onset - 0.12)), max(1, to_frame(note.onset - 0.04))
        return float(H[row[note.pitch], start:stop].mean()) if stop > start else 0.0

    return [{
        'index': note.index,
        'harmonic_peak': peak(H_harm, note, 0.03, 0.12),
        'harmonic_floor': floor(H_harm, note),
        'onset_peak': peak(H_perc, note, 0.03, 0.06),
    } for note in notes]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('audio', type=Path)
    parser.add_argument('aligned', type=Path, help='json list of {index, pitch, onset, offset}')
    parser.add_argument('out', type=Path)
    parser.add_argument('--iterations', type=int, default=60)
    args = parser.parse_args()

    notes = [AlignedNote(**n) for n in json.loads(args.aligned.read_text())]
    V, freqs = magnitude_spectrogram(args.audio)
    pitches = sorted({n.pitch for n in notes})

    W_harm = np.stack([harmonic_template(p, freqs) for p in pitches], axis=1)
    W_perc = np.stack([onset_template(p, freqs) for p in pitches], axis=1)
    support_harm = (W_harm > W_harm.max(axis=0, keepdims=True) * 1e-3).astype(float)
    support_perc = (W_perc > 0).astype(float)
    mask_harm, mask_perc = activation_mask(notes, pitches, V.shape[1])

    W = np.concatenate([W_harm, W_perc], axis=1)
    support = np.concatenate([support_harm, support_perc], axis=1)
    H = np.concatenate([mask_harm, mask_perc], axis=0) * V.sum(axis=0, keepdims=True).mean()
    W, H = factorise(V, W, H, support, args.iterations)

    n = len(pitches)
    args.out.write_text(json.dumps(note_loudness(notes, H[:n], H[n:], pitches)))
    residual = np.abs(V - W @ H).sum() / V.sum()
    print(f'{len(notes)} notes, {n} pitches, relative L1 residual {residual:.3f}')


if __name__ == '__main__':
    main()
