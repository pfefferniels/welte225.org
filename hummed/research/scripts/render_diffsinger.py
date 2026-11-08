"""DiffSinger (OpenVPI ONNX export, as used by OpenUtau), driven by our own f0 contour.

Acoustic model: an OpenUtau DiffSinger voicebank of Tohoku Kiritan (tokens, frame durations
and an f0 curve -> 128-bin mel). Vocoder: OpenVPI's NSF-HiFiGAN 44.1 kHz (mel + f0 -> wave).
Every phoneme boundary sits on Grünfeld's onsets/offsets (frames of 11.6 ms, cumulative
rounding), the pitch is exactly the contour of the shared voice model, the breaths are the
model's own AP token, and the MPM dynamics are applied as gain afterwards (this model has no
loudness input).
"""
import sys, os
import numpy as np, soundfile as sf, onnxruntime as ort
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voicemodel as vm

VB = '../models/ds_kiritan/kiritan/'
VOC = {'nsf': '../models/vocoder/oudep_nsf/nsf_hifigan_44.1k_hop512_128bin_2024.02.onnx',
       'pcnsf': '../models/vocoder/oudep_pcnsf/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02.onnx'}
SR, HOP = 44100, 512
FT = HOP / SR


def phrases(notes):
    groups, cur = [], []
    for n in notes:
        if n.breath_before and cur:
            groups.append(cur)
            cur = []
        cur.append(n)
    groups.append(cur)
    return groups


def render(out, transpose=0, own_f0=True, vocoder='nsf', speedup=10, seconds=None, hum='N', mode='gruenfeld'):
    phon = [l.strip() for l in open(VB + 'phonemes.txt', encoding='utf-8') if l.strip()]
    tid = {p: i for i, p in enumerate(phon)}
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4
    ac = ort.InferenceSession(VB + 'acoustic.onnx', opts, providers=['CPUExecutionProvider'])
    vo = ort.InferenceSession(VOC[vocoder], opts, providers=['CPUExecutionProvider'])
    mel = vm.load_melody('melody.json')
    notes = vm.build_notes(mel, mode=mode, transpose=transpose)
    ctrl = vm.render_controls(notes, mel, mode=mode, expressive=own_f0)
    pad = 0.6
    total = ctrl.t[-1]
    y = np.zeros(int(total * SR) + SR)
    prev_end = 0.0
    for g in phrases(notes):
        if seconds is not None and g[0].on > seconds:
            break
        # segment boundaries in absolute seconds (performance time)
        gap = g[0].on - prev_end
        lead = min(0.5, max(0.15, gap))
        t0 = g[0].on - lead
        segs = []
        if gap >= 0.2:
            br = min(0.45, gap - 0.05)
            segs.append(('SP', t0, g[0].on - br))
            segs.append(('AP', g[0].on - br, g[0].on))
        else:
            segs.append(('SP', t0, g[0].on))
        for k, n in enumerate(g):
            if k > 0 and n.on > segs[-1][2] + 1e-6:
                segs.append(('SP', segs[-1][2], n.on))
            if k > 0 and n.repeated_in:
                # re-articulate a repeated note: two frames of silence before it
                p, a, b = segs[-1]
                segs[-1] = (p, a, n.on - 2 * FT)
                segs.append(('SP', n.on - 2 * FT, n.on))
            segs.append((hum, n.on, n.off))
        segs.append(('SP', segs[-1][2], segs[-1][2] + 0.3))
        prev_end = g[-1].off
        # cumulative frame alignment
        fr = lambda t: int(round((t - t0) / FT))
        toks, durs = [], []
        for p, a, b in segs:
            d = fr(b) - fr(a)
            if d <= 0:
                continue
            toks.append(tid[p])
            durs.append(d)
        n_frames = sum(durs)
        tf = t0 + pad + np.arange(n_frames) * FT
        f0 = np.interp(tf, ctrl.t, ctrl.f0_hz).astype(np.float32)
        m = ac.run(None, {'tokens': np.array([toks], np.int64), 'durations': np.array([durs], np.int64),
                          'f0': f0[None], 'speedup': np.array(speedup, np.int64)})[0]
        w = vo.run(None, {'mel': m.astype(np.float32), 'f0': f0[None]})[0][0]
        a = int(round((t0 + pad) * SR))
        f = int(0.02 * SR)
        w[:f] *= np.linspace(0, 1, f)
        w[-f:] *= np.linspace(1, 0, f)
        y[a:a + len(w)] += w[: len(y) - a]
        print(f'  phrase {g[0].index:3d}-{g[-1].index:3d} at {g[0].on:7.2f}s, {n_frames} frames', flush=True)
    # MPM dynamics as gain (relative), smoothed
    lev = np.interp(np.arange(len(y)) / SR, ctrl.t, ctrl.level_db)
    lev -= np.median(ctrl.level_db[ctrl.voiced])
    y *= 10 ** (lev / 20)
    sf.write(out, (y / (np.abs(y).max() + 1e-9) * 0.9).astype(np.float32), SR)


if __name__ == '__main__':
    out = sys.argv[1]
    transpose = float(sys.argv[2]) if len(sys.argv) > 2 else 0
    secs = float(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != 'all' else None
    voc = sys.argv[4] if len(sys.argv) > 4 else 'nsf'
    mode = sys.argv[5] if len(sys.argv) > 5 else 'gruenfeld'
    render(out, transpose=transpose, seconds=secs, vocoder=voc, mode=mode)
