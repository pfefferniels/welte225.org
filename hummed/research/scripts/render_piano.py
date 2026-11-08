"""Piano references from the Salamander Grand samples (as used by @tonejs/piano): the whole
performance, the melody alone, and everything but the melody (accompaniment for the hums).
Note ends follow the roll's key releases and the sustain-pedal stream."""
import json, sys
import numpy as np, soundfile as sf
from scipy.signal import resample_poly

SAL = '../salamander/'
SR = 44100
NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B']
SAMPLED = [21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96]
_cache = {}


def sample(midi, layer):
    key = (midi, layer)
    if key not in _cache:
        y, sr = sf.read(f'{SAL}{NAMES[midi % 12]}{midi // 12 - 1}v{layer}.mp3')
        if y.ndim > 1:
            y = y.mean(axis=1)
        assert sr == SR, sr
        _cache[key] = y
    return _cache[key]


def release(midi):
    key = ('rel', midi)
    if key not in _cache:
        y, sr = sf.read(f'{SAL}rel{midi - 20}.mp3')
        _cache[key] = y.mean(axis=1) if y.ndim > 1 else y
    return _cache[key]


def shifted(midi, layer):
    base = min(SAMPLED, key=lambda s: abs(s - midi))
    y = sample(base, layer)
    st = midi - base
    if st == 0:
        return y
    # resample by 2^(st/12) with a rational approximation
    num, den = {1: (1000, 1059), -1: (1059, 1000), 2: (891, 1000), -2: (1000, 891)}[st]
    return resample_poly(y, num, den)


def render(notes, sustain, pad=0.6, tail=3.0):
    end = max(n['milliseconds']['end'] for n in notes) / 1000 + pad + tail
    out = np.zeros(int(end * SR))
    st = np.array([p[0] / 1000 for p in sustain])
    sv = np.array([p[1] for p in sustain])
    for n in notes:
        on = n['milliseconds']['date'] / 1000
        off = max(n['milliseconds']['end'] / 1000, on + 0.3)   # a note that ends before it starts sounds briefly
        # damper: the key's release, held while the pedal is down (value >= 64)
        i = np.searchsorted(st, off, side='right') - 1
        if i >= 0 and sv[i] >= 64:
            j = i
            while j < len(sv) and sv[j] >= 64:
                j += 1
            off = st[j] if j < len(st) else end - tail
        v = float(n['velocity'])
        layer = int(np.clip(round(v / 127 * 15) + 1, 1, 16))
        y = shifted(int(n['pitch']), layer)
        a = int((on + pad) * SR)
        dur = int((off - on) * SR)
        fade = int(0.12 * SR)
        seg = y[: dur + fade].copy()
        if len(seg) > dur:
            seg[dur:] *= np.linspace(1, 0, len(seg) - dur) ** 2
        g = (v / 127)
        out[a: a + len(seg)] += g * seg[: len(out) - a]
        r = release(int(n['pitch'])) * 0.02 * g
        b = a + dur
        if b < len(out):
            out[b: b + len(r)] += r[: len(out) - b]
    return out


if __name__ == '__main__':
    perf = json.load(open('../render/performed.json'))
    mel = json.load(open('melody.json'))
    allnotes = [n for p in perf['parts'] for n in p['notes']]
    melody_ids = {n['id'] for n in mel['notes']}
    sustain = mel['sustain']
    accomp = [n for n in allnotes if n['id'] not in melody_ids]
    # the accompaniment a minor sixth lower, to sit under the transposed DiffSinger hum
    accomp_m8 = [dict(n, pitch=n['pitch'] - 8) for n in accomp]
    jobs = [('piano_full', allnotes),
            ('piano_melody', [n for n in allnotes if n['id'] in melody_ids]),
            ('piano_accomp', accomp), ('piano_accomp_m8', accomp_m8)]
    only = set(sys.argv[1:])
    for name, sel in jobs:
        if only and name not in only:
            continue
        y = render(sel, sustain)
        sf.write(f'dry/{name}.wav', (y / np.abs(y).max() * 0.9).astype(np.float32), SR)
        print(name, len(sel), 'notes', len(y) / SR, 's')
