"""The live page's data from the offline pipeline (run with its working directory as WORKDIR, and
HUMMED as the hummed/ directory): the speaker with a lattice of mouth shapes (data/hummer.speaker.xml),
the hum style measured from the recording (data/hum-style.json) and trimmed piano samples (piano/).
The score and the MPM are the site's own (/mpm/); `npm run calibrate` then sets data/calibration.json."""
import json, os, subprocess, sys
import numpy as np
S = os.environ.get('WORKDIR', '.') + '/'   # the offline pipeline's working directory
sys.path.insert(0, S + 'work_rec'); sys.path.insert(0, S + 'work')
import hummer as H, vtlfit as V
OUT = os.environ.get('HUMMED', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')) + '/'
profile = json.load(open(S + 'work_rec/profile.json'))
pal = np.load(S + 'work_rec/palette.npz'); P = dict(zip(pal['names'], pal['shapes']))
hums = ['hum1', 'hum2', 'hum3']; towards = ['open2', 'open4', 'open1']
ld = V.TN.index('LD')
# the mouth-shape lattice: closed mixes of the three hums in 10 % steps, and for each the open
# shape it leans toward at its widest (OPEN_MAX of the way from parted lips): the page blends the
# two tubes by the opening amount. (The page has since given the open shapes up: they bleated. Its
# speaker keeps the closed mixes and opens to `ah`, the speaker's own "a" with LD 0.35, added by hand.)
shapes = {}
for i in range(11):
    for j in range(11 - i):
        k = 10 - i - j
        C = (i * P['hum1'] + j * P['hum2'] + k * P['hum3']) / 10
        shapes[f'c{i}_{j}'] = C
        for T in towards:
            b0 = float(np.clip((0.11 - C[ld]) / (P[T][ld] - C[ld]), 0, 1))
            b = b0 + H.OPEN_MAX * (1 - b0)
            shapes[f'{T}_{i}_{j}'] = (1 - b) * C + b * P[T]
H.write_speaker({nm: dict(zip(V.TN, vec)) for nm, vec in shapes.items()}, OUT + 'data/hummer.speaker.xml')
style = dict(scoops=[s for s in profile['f0_scoop_all'] if s < 0] or [-2.0],
             releaseS=profile['release_s'], wobbleCents=round(profile['wobble_cents_rms'] * 0.8, 1))
json.dump(style, open(OUT + 'data/hum-style.json', 'w'), indent=2)
print(len(shapes), 'shapes; hum style', style)
# piano: every other velocity layer of the pitches the piece reaches, mono, 7 s
NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B']
for b in [33, 36, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81]:
    for l in [3, 5, 7, 9]:
        src = S + f'salamander/{NAMES[b % 12]}{b // 12 - 1}v{l}.mp3'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-t', '7', '-ac', '1',
                        '-af', 'afade=t=out:st=5.5:d=1.5', '-codec:a', 'libmp3lame', '-q:a', '5', OUT + f'piano/p{b}v{l}.mp3'], check=True)
print('piano samples written')
