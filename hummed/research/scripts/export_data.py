"""Data for the listening page: the melody as played (and deadpan), bar lines, every version's
metadata, metrics and pitch track (WORLD Harvest, 20 ms, shown at the written pitch)."""
import json, os
import numpy as np, soundfile as sf, pyworld as pw
from scipy.signal import resample_poly
import voicemodel as vm
from versions import VERSIONS

PAD = 0.6
SR = 16000
FP = 20  # ms


def bar_label(n):
    m = int(n['measure']) - 1          # MEI measure 1 is the upbeat
    return f"{m}'" if n['rend2'] else str(m)


def notes_for(mel, mode):
    out = []
    vn = vm.build_notes(mel, mode=mode)
    for n, src in zip(vn, mel['notes']):
        out.append(dict(t=round(n.on + PAD, 3), d=round(n.off - n.on, 3), k=round(n.key_off - n.on, 3),
                        p=int(src['pitch']), v=round(n.velocity, 1), b=bar_label(src),
                        br=bool(n.breath_before)))
    return out


def bars(notes):
    seen, out = set(), []
    for n in notes:
        if n['b'] not in seen and n['b'] != '0':
            seen.add(n['b'])
            out.append(dict(t=n['t'], b=n['b']))
    return out


def f0_track(vid, transpose):
    """The cached 5 ms Harvest track of analysis.py, decimated to 20 ms, at the written pitch."""
    z = np.load(f'f0cache/{vid}.npz')
    f0 = z['f0'][::FP // 5]
    midi = np.where(f0 > 0, 69 + 12 * np.log2(np.maximum(f0, 1) / 440) - transpose, 0)
    return [int(round(x * 10)) for x in midi]


if __name__ == '__main__':
    mel = vm.load_melody('melody.json')
    metrics = json.load(open('analysis.json'))
    g_notes = notes_for(mel, 'gruenfeld')
    d_notes = notes_for(mel, 'deadpan')
    out = dict(notes=g_notes, deadpan=d_notes, bars=bars(g_notes), deadpan_bars=bars(d_notes),
               frame_ms=FP, versions=[])
    for v in VERSIONS:
        path = f'final/{v["id"]}.wav'
        if not os.path.exists(path):
            print('skip', v['id'])
            continue
        info = sf.info(path)
        src = {'mix_ds_piano': ('ds_kiritan_hum', -8), 'mix_lf_piano': ('lf_hum', 0), 'mix_vtl_piano_full': ('vtl_hummer', -12)}.get(v['id'])
        if v['id'] == 'piano_full':
            f0 = None
        elif src:
            f0 = f0_track(src[0], src[1])
        else:
            f0 = f0_track(v['id'], v['transpose'])
        out['versions'].append(dict(
            id=v['id'], family=v['family'], title=v['title'], how=v['how'], control=v['control'],
            transpose=v['transpose'], timing=v.get('timing', 'gruenfeld'), excerpt=v.get('excerpt'),
            duration=round(info.duration, 2), metrics=metrics.get(v['id']), f0=f0,
            audio=f'audio/{v["id"]}.mp3'))
        print('exported', v['id'], flush=True)
    json.dump(out, open('page_data.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    print(os.path.getsize('page_data.json') // 1024, 'kB')
