"""Neural singing voice synthesis with pretrained ESPnet models (VISinger / VISinger2).

The model gets a score whose notes start and end exactly where Grünfeld's do (and where the
shared voice model breathes), sung on a hum syllable: Japanese ん (phoneme N), or Mandarin 嗯
(final 'en'). Phoneme durations are handed in as ground truth, quantised cumulatively to the
model's frame grid, so the network does not move a single onset; the f0 contour, vibrato,
transitions and loudness are the network's own (it has no input for dynamics).

Rendered phrase by phrase (split at the breaths) and placed at the exact times.
"""
import sys, os, warnings
warnings.filterwarnings('ignore')
import numpy as np, soundfile as sf, torch
from espnet2.bin.svs_inference import SingingGenerate

sys.path.insert(0, os.path.dirname(__file__))
import voicemodel as vm

M = '../models/'
MODELS = {
    'kiritan_visinger': dict(dir='kiritan_svs_visinger/exp/svs_train_visinger_24_raw_phn_pyopenjtalk_jp',
                             ckpt='200epoch.pth', lang='jp', transpose=0),
    'ofuton_visinger2': dict(dir='ofuton_p_utagoe_db_svs_visinger2/exp/svs_train_visinger2_24_raw_phn_pyopenjtalk_jp',
                             ckpt='125epoch.pth', lang='jp', transpose=-12),
    'kurumi_visinger2': dict(dir='oniku_kurumi_utagoe_db_svs_visinger2/44kexp/svs_train_visinger2_raw_phn_pyopenjtalk_jp',
                             ckpt='82epoch.pth', lang='jp', transpose=0),
    'acesinger_visinger2': dict(dir='acesinger_opencpop_visinger2_44khz/exp/svs_train_visinger2_raw_phn_None_zh',
                                ckpt='500epoch.pth', lang='zh', transpose=0),
}


def phrases(notes, lead=0.3, tail=0.3):
    """Split the voice notes at breaths into phrases."""
    groups, cur = [], []
    for n in notes:
        if n.breath_before and cur:
            groups.append(cur)
            cur = []
        cur.append(n)
    groups.append(cur)
    return groups


def score_for(group, lang, hop_s, t0):
    """Score and frame-aligned label for one phrase, times relative to t0."""
    hum = ('ん', 'N') if lang == 'jp' else ('嗯', 'en')
    rest = 'pau' if lang == 'jp' else 'SP'
    segs = []  # (start, end, lyric, midi, phn)
    start = group[0].on - t0
    segs.append((0.0, start, rest, 0, rest))
    for k, n in enumerate(group):
        on, off = n.on - t0, n.off - t0
        if k > 0 and on > segs[-1][1] + 1e-6:
            segs.append((segs[-1][1], on, rest, 0, rest))
        segs.append((on, off, hum[0], int(round(n.pitch)), hum[1]))
    end = segs[-1][1]
    segs.append((end, end + 0.3, rest, 0, rest))
    # cumulative frame alignment of every boundary
    q = lambda t: round(t / hop_s) * hop_s
    aligned = []
    for s, e, lyr, midi, ph in segs:
        s, e = q(s), q(e)
        if e - s < hop_s:   # drop slivers
            continue
        aligned.append((s, e, lyr, midi, ph))
    # make contiguous
    for i in range(1, len(aligned)):
        s, e, *r = aligned[i]
        aligned[i] = (aligned[i - 1][1], e, *r)
    labels = np.array([[s, e] for s, e, *_ in aligned])
    phns = [a[4] for a in aligned]
    return dict(score=(60, aligned), text=' '.join(phns), label=(labels, phns))


def render(name, sid=None, out=None, seconds=None, seed=0):
    cfg = MODELS[name]
    d = M + cfg['dir']
    here = os.getcwd()
    root = M + cfg['dir'].split('/')[0]          # config paths are relative to the model root
    d = os.path.abspath(d)
    os.chdir(root)
    svs = SingingGenerate(f'{d}/config.yaml', f'{d}/{cfg["ckpt"]}', device='cpu')
    os.chdir(here)
    fs = svs.fs
    hop_s = svs.preprocess_fn.time_shift
    mel = vm.load_melody('melody.json')
    notes = vm.build_notes(mel, transpose=cfg['transpose'])
    pad = 0.6
    total = notes[-1].off + pad + 1.5
    out_wav = np.zeros(int(total * fs))
    torch.manual_seed(seed)
    for g in phrases(notes):
        if seconds is not None and g[0].on > seconds:
            break
        t0 = g[0].on - 0.25
        batch = score_for(g, cfg['lang'], hop_s, t0)
        kw = {}
        if sid is not None:
            kw['sids'] = np.array([sid])
        with torch.no_grad():
            o = svs(batch, **kw)
        w = o['wav'].cpu().numpy().astype(float)
        a = int(round((t0 + pad) * fs))
        b = min(len(out_wav), a + len(w))
        # short crossfade at the phrase edges (the edges are silence anyway)
        f = min(int(0.03 * fs), len(w) // 4)
        w[:f] *= np.linspace(0, 1, f)
        w[-f:] *= np.linspace(1, 0, f)
        out_wav[a:b] += w[: b - a]
        print(f'  phrase {g[0].index:3d}-{g[-1].index:3d} {g[0].on:7.2f}s  {len(batch["label"][1])} phonemes', flush=True)
    if out:
        sf.write(out, (out_wav / (np.abs(out_wav).max() + 1e-9) * 0.9).astype(np.float32), fs)
    return out_wav, fs


if __name__ == '__main__':
    name = sys.argv[1]
    out = sys.argv[2]
    sid = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != '-' else None
    secs = float(sys.argv[4]) if len(sys.argv) > 4 else None
    render(name, sid, out, secs)
