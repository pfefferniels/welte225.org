"""Articulatory rendering with VocalTractLab 2.4 (Birkholz): a 3D vocal-tract model with a
self-oscillating glottis and a nasal cavity. Humming = lips closed, velum open; 'oo' = [u].
The default speaker is male and its glottis model stops at 600 Hz, so the melody is sung an
octave lower (C3-Bb4), as a man would hum it."""
import sys
import numpy as np, soundfile as sf
import vocaltractlab_cython as vtl
sys.path.insert(0, '.')
import voicemodel as vm

C = vtl.get_constants()
FR = C['sr_audio'] / C['n_samples_per_state']   # ~400.9 frames/s


def render(vowel='m', seconds=None, transpose=-12, out=None):
    mel = vm.load_melody('melody.json')
    notes = vm.build_notes(mel, transpose=transpose)
    ctrl = vm.render_controls(notes, mel, vibrato_cents=22.0)
    t = np.arange(0, ctrl.t[-1] if seconds is None else seconds, 1 / FR)
    f0 = np.interp(t, ctrl.t, ctrl.f0_hz)
    level = np.interp(t, ctrl.t, ctrl.level_db)
    env = np.interp(t, ctrl.t, ctrl.gain / 10 ** (ctrl.level_db / 20))
    # lung pressure: soft humming ~ 400-900 Pa; level range of the piece maps onto it
    pr = np.interp(level, [-28, -14], [4500, 9500]) * np.clip(env, 0, 1) ** 0.7
    shape = 'll-labial-closure(u)' if vowel == 'm' else 'u'
    tract = vtl.get_shape(shape, 'tract').copy()
    names = [p['name'] for p in vtl.get_param_info('tract')]
    if vowel == 'm':
        tract[names.index('VO')] = 0.25      # velum open: sound leaves through the nose
    gnames = [p['name'] for p in vtl.get_param_info('glottis')]
    modal = vtl.get_shape('modal', 'glottis')
    breathy = vtl.get_shape('breathy', 'glottis')
    T = np.tile(tract, (len(t), 1))
    # soft = laxer: blend the glottal settings from 'breathy' (soft) to 'modal' (louder)
    w = np.clip(np.interp(level, [-28, -14], [0.6, 0.0]), 0, 1)[:, None]
    G = w * breathy[None, :] + (1 - w) * modal[None, :]
    G[:, gnames.index('F0')] = np.clip(f0, 40, 600)
    G[:, gnames.index('PR')] = pr
    y = vtl.synth_block(T, G, state_samples=C['n_samples_per_state'])
    y = np.asarray(y, dtype=float)
    if out:
        sf.write(out, (y / (np.abs(y).max() + 1e-9) * 0.9).astype(np.float32), C['sr_audio'])
    return y


if __name__ == '__main__':
    vowel = sys.argv[1]
    secs = float(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] != 'all' else None
    out = sys.argv[3]
    y = render(vowel, secs, out=out)
    print(vowel, len(y) / 44100, 's', np.abs(y).max())
