"""Render the signal-processing versions as dry mono WAVs in dry/."""
import sys, time
import numpy as np, soundfile as sf
import voicemodel as vm, synth_dsp as sd

mel = vm.load_melody('melody.json')
which = sys.argv[1:] or ['sine_deadpan', 'sine_roll', 'additive_deadpan', 'additive_hum',
                         'lf_hum', 'lf_ooh']

def ctrl(mode):
    notes = vm.build_notes(mel, mode=mode)
    return vm.render_controls(notes, mel, mode=mode)

jobs = {
    'sine_deadpan': lambda: sd.sine_literal(mel, 'deadpan'),
    'sine_roll': lambda: sd.sine_literal(mel, 'gruenfeld'),
    'additive_deadpan': lambda: sd.additive(ctrl('deadpan'), 'm'),
    'additive_hum': lambda: sd.additive(ctrl('gruenfeld'), 'm'),
    'lf_hum': lambda: sd.lf_klatt(ctrl('gruenfeld'), 'm'),
    'lf_ooh': lambda: sd.lf_klatt(ctrl('gruenfeld'), 'u'),
}
for name in which:
    t = time.time()
    y = jobs[name]()
    y = y / (np.max(np.abs(y)) + 1e-9) * 0.9
    sf.write(f'dry/{name}.wav', y.astype(np.float32), sd.SR)
    print(name, f'{len(y)/sd.SR:.1f}s', f'{time.time()-t:.1f}s render')
