"""Master every rendering the same way, so they can be compared.

final/<id>.wav  mono 44.1 kHz, level-normalised, no room: what the analysis measures
mp3/<id>.mp3    the same through one small hall, for listening

For the neural singers that take no loudness input ('dyn-post'), and for the physical models
whose loudness depends on pitch more than on lung pressure ('dyn-level'), the MPM dynamics are
transplanted note by note: each note's measured level is moved to the level its velocity and
the dynamics curve ask for (gain steps crossfaded over 40 ms; at most 18 dB down, 9 dB up), keeping the voice's own shaping
inside the note.
"""
import os, subprocess, sys
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
import voicemodel as vm
import synth_dsp as sd
from versions import VERSIONS

SR = 44100
PAD = 0.6
os.makedirs('final', exist_ok=True)
os.makedirs('mp3', exist_ok=True)


def load(path):
    y, sr = sf.read(path)
    if y.ndim > 1:
        y = y.mean(axis=1)
    if sr != SR:
        g = np.gcd(sr, SR)
        y = resample_poly(y, SR // g, sr // g)
    return y.astype(float)


def transplant(y, notes, ctrl):
    cr = 1000
    n = len(y)
    env = np.sqrt(np.convolve(y ** 2, np.ones(1764) / 1764, mode='same')) + 1e-9
    gain_db = np.full(int(n / SR * cr) + 1, np.nan)
    for k, nt in enumerate(notes):
        a, b = nt.on + PAD, nt.off + PAD
        d = b - a
        m0, m1 = int((a + 0.3 * d) * SR), int((b - 0.15 * d) * SR)
        if m1 - m0 < 441 or m1 > n:      # too short, or beyond the end of an excerpt
            continue
        measured = 20 * np.log10(np.percentile(env[m0:m1], 80))   # robust to an early phrase-end fade
        want = np.interp(a + 0.5 * d, ctrl.t, ctrl.level_db)
        nxt = notes[k + 1].on + PAD if k + 1 < len(notes) else b + 0.5
        gain_db[int(a * cr):int(nxt * cr)] = want - measured
    ok = ~np.isnan(gain_db)
    idx = np.arange(len(gain_db))
    gain_db = np.interp(idx, idx[ok], gain_db[ok])
    gain_db -= np.median(gain_db[ok])
    gain_db = np.clip(gain_db, -18, 9)    # never boost a fade or a breath by much
    gain_db = vm._smooth(gain_db, 20)
    g = 10 ** (np.interp(np.arange(n) / SR, idx / cr, gain_db) / 20)
    return y * g


def master(v, mel):
    y = load(f'dry/{v["file"]}')
    if 'dyn-post' in v['control'] or 'dyn-level' in v['control']:
        mode = v.get('timing', 'gruenfeld')
        notes = vm.build_notes(mel, mode=mode, transpose=v['transpose'])
        ctrl = vm.render_controls(notes, mel, mode=mode)
        y = transplant(y, notes, ctrl)
    y = sd.normalize(y, -23.0)
    sf.write(f'final/{v["id"]}.wav', y.astype(np.float32), SR)
    return y


def to_mp3(y, name):
    st = sd.room(y, SR)
    st = sd.normalize(st, -20.0, peak=0.95)
    sf.write('tmp_master.wav', st.T.astype(np.float32), SR)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'tmp_master.wav', '-codec:a', 'libmp3lame',
                    '-q:a', '5', f'mp3/{name}.mp3'], check=True)


def mix(hum_id, out_id, accomp='piano_accomp', rel_db=-7.0):
    hum = load(f'final/{hum_id}.wav')
    acc = load(f'dry/{accomp}.wav')
    n = max(len(hum), len(acc))
    hum = np.pad(hum, (0, n - len(hum)))
    acc = np.pad(acc, (0, n - len(acc)))
    rms = lambda x: np.sqrt(np.mean(x[np.abs(x) > 1e-3 * np.abs(x).max()] ** 2))
    acc = acc / rms(acc) * rms(hum) * 10 ** (rel_db / 20)
    y = sd.normalize(hum + acc, -23.0)
    sf.write(f'final/{out_id}.wav', y.astype(np.float32), SR)
    return y


if __name__ == '__main__':
    mel = vm.load_melody('melody.json')
    only = set(sys.argv[1:])
    for v in VERSIONS:
        if only and v['id'] not in only:
            continue
        if v['id'].startswith('mix_'):
            continue
        if not os.path.exists(f'dry/{v["file"]}'):
            print('missing', v['id'])
            continue
        y = master(v, mel)
        to_mp3(y, v['id'])
        print('mastered', v['id'], f'{len(y) / SR:.1f}s', flush=True)
    # the DiffSinger hum is a minor sixth lower, so its accompaniment is too
    for hum, out, acc, rel in [('ds_kiritan_hum', 'mix_ds_piano', 'piano_accomp_m8', -7.0),
                               ('lf_hum', 'mix_lf_piano', 'piano_accomp', -7.0),
                               ('vtl_hummer', 'mix_vtl_piano_full', 'piano_full', 7.0)]:   # the hum under the piano
        if (only and out not in only) or not os.path.exists(f'final/{hum}.wav'):
            continue
        to_mp3(mix(hum, out, acc, rel), out)
        print('mixed', out, flush=True)
