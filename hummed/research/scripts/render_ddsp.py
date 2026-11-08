"""DDSP (Engel et al. 2020) timbre models driven by our f0 and loudness curves.

Magenta's pretrained solo-instrument autoencoders (violin, flute) decode an f0 curve and a
loudness curve (250 frames/s) into harmonic + filtered-noise synthesis parameters. There are
no released voice weights, so these are the neural "instrument that sings" counterparts of the
hums: exactly the same f0 contour, timing and dynamics, a learned timbre. Loudness is mapped
onto each model's training statistics (as Magenta's timbre-transfer notebook does).
"""
import sys, os, pickle
import numpy as np, soundfile as sf
import gin, tensorflow as tf
import ddsp, ddsp.training
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voicemodel as vm

SR = 16000
FR = 250


def render(inst, out, transpose=0, seconds=None):
    d = f'../models/ddsp/{inst}/'
    gin_file = d + 'operative_config-0.gin'
    stats = pickle.load(open(d + 'dataset_statistics.pkl', 'rb'))
    ckpt = [f for f in os.listdir(d) if f.endswith('.index')][0][:-6]
    mel = vm.load_melody('melody.json')
    notes = vm.build_notes(mel, transpose=transpose)
    ctrl = vm.render_controls(notes, mel)
    T = ctrl.t[-1] if seconds is None else seconds
    n_frames = int(T * FR)
    t = np.arange(n_frames) / FR
    f0 = np.interp(t, ctrl.t, ctrl.f0_hz)
    gain_db = 20 * np.log10(np.maximum(np.interp(t, ctrl.t, ctrl.gain), 1e-6))
    voiced = gain_db > -60
    # keep the dB differences of the dynamics 1:1, centred on the dataset's mean note maximum
    # (Magenta's notebook shifts loudness the same way); silence far below
    centre = stats['mean_max_loudness'] + float(os.environ.get('DDSP_LOUD_OFFSET', '0'))
    ref = np.median(gain_db[voiced])
    ld = np.where(voiced, centre + (gain_db - ref), -120.0)
    ld = np.maximum(ld, -120.0)
    # Overlapping 10 s windows (2 s crossfades): long sequences run out of memory and the
    # oscillator phase drifts in float32 over millions of samples.
    win, hop_w = 10 * FR, 8 * FR
    spf = SR // FR
    n_samples = win * spf
    with gin.unlock_config():
        gin.parse_config_file(gin_file, skip_unknown=True)
        gin.parse_config([f'Harmonic.n_samples = {n_samples}', f'FilteredNoise.n_samples = {n_samples}',
                          f'F0LoudnessPreprocessor.time_steps = {win}',
                          'oscillator_bank.use_angular_cumsum = True',
                          'F0LoudnessPreprocessor.compute_loudness = False'])
    model = ddsp.training.models.Autoencoder()
    model.restore(d + ckpt)
    audio = np.zeros(n_frames * spf + n_samples)
    weight = np.zeros_like(audio)
    xf = (win - hop_w) * spf
    for s0 in range(0, n_frames, hop_w):
        fw = np.pad(f0[s0:s0 + win], (0, max(0, s0 + win - n_frames)), mode='edge')
        lw = np.pad(ld[s0:s0 + win], (0, max(0, s0 + win - n_frames)), constant_values=-120.0)
        feats = {'f0_hz': fw[None].astype(np.float32), 'loudness_db': lw[None].astype(np.float32),
                 'f0_confidence': np.ones((1, win), np.float32),
                 'audio': np.zeros((1, n_samples), np.float32)}
        a = model.get_audio_from_outputs(model(feats, training=False)).numpy()[0].astype(float)
        w = np.ones(n_samples)
        if s0 > 0:
            w[:xf] = np.sin(0.5 * np.pi * np.linspace(0, 1, xf)) ** 2
        w[-xf:] = np.cos(0.5 * np.pi * np.linspace(0, 1, xf)) ** 2
        audio[s0 * spf: s0 * spf + n_samples] += a * w
        weight[s0 * spf: s0 * spf + n_samples] += w
        if s0 + win >= n_frames:
            break
    audio = (audio / np.maximum(weight, 1e-3))[: n_frames * spf]
    sf.write(out, (audio / (np.abs(audio).max() + 1e-9) * 0.9).astype(np.float32), SR)
    print(inst, len(audio) / SR, 's')


if __name__ == '__main__':
    inst, out = sys.argv[1], sys.argv[2]
    transpose = float(sys.argv[3]) if len(sys.argv) > 3 else 0
    secs = float(sys.argv[4]) if len(sys.argv) > 4 else None
    render(inst, out, transpose, secs)
