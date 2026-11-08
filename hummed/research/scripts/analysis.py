"""How faithfully does each rendering follow Grünfeld? f0 tracking (WORLD Harvest, 5 ms) of
the dry files against the voice notes:

* pitch: median deviation of f0 in the middle of each note from the written pitch (cents);
* arrival: when the f0 first settles within 60 cents of the new pitch, relative to Grünfeld's
  onset (ms), for notes reached by a leap of at least a whole tone or after a breath;
* dynamics: correlation of each note's level (dB) with the level its velocity asks for.
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np, soundfile as sf, pyworld as pw
from scipy.signal import resample_poly
import voicemodel as vm
from versions import VERSIONS

PAD = 0.6
SR = 16000


def track(path, cache=None):
    """f0 (Harvest, 5 ms) and 40 ms RMS, cached per version in f0cache/."""
    if cache and os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(path):
        z = np.load(cache)
        return z['t'], z['f0'], z['rms']
    y, sr = sf.read(path)
    if y.ndim > 1:
        y = y.mean(axis=1)
    if sr != SR:
        g = np.gcd(sr, SR)
        y = resample_poly(y, SR // g, sr // g)
    f0, t = pw.harvest(y.astype(np.float64), SR, f0_floor=70, f0_ceil=1200, frame_period=5)
    # 40 ms RMS around each frame (short windows measure the waveform phase, not the level)
    e = np.sqrt(np.convolve(y ** 2, np.ones(640) / 640, mode='same') + 1e-12)
    rms = e[np.minimum((t * SR).astype(int), len(e) - 1)]
    if cache:
        np.savez(cache, t=t, f0=f0, rms=rms)
    return t, f0, rms


def analyse(v, mel):
    mode = v.get('timing', 'gruenfeld')
    notes = vm.build_notes(mel, mode=mode, transpose=v['transpose'])
    t, f0, rms = track(f'final/{v["id"]}.wav', f'f0cache/{v["id"]}.npz')
    cents = np.where(f0 > 0, 6900 + 1200 * np.log2(np.maximum(f0, 1) / 440), np.nan)
    errs, lags, lev, want = [], [], [], []
    for k, n in enumerate(notes):
        on, off = n.on + PAD, n.off + PAD
        dur = off - on
        if dur < 0.15:
            continue
        m = (t >= on + 0.3 * dur) & (t <= off - 0.15 * dur)
        c = cents[m]
        c = c[~np.isnan(c)]
        if len(c) >= 4:
            e = np.median(c) - n.pitch * 100
            e = (e + 600) % 1200 - 600 if abs(e) > 900 else e   # forgive octave errors of the tracker
            errs.append(e)
            lev.append(20 * np.log10(np.percentile(rms[m], 80)))
            want.append(vm.vel_to_db(n.velocity))
        leap = k > 0 and abs(n.pitch - notes[k - 1].pitch) >= 2
        if (leap or n.breath_before) and not n.repeated_in:
            w = (t >= on - 0.2) & (t <= min(off, on + 0.4))
            ok = np.abs(cents[w] - n.pitch * 100) < 60
            tw = t[w]
            for i in range(len(ok) - 8):
                if ok[i:i + 8].all():     # 40 ms settled
                    lags.append((tw[i] - on) * 1000)
                    break
    errs, lags = np.array(errs), np.array(lags)
    r = np.corrcoef(lev, want)[0, 1] if np.std(want) > 1e-6 else float('nan')
    return dict(id=v['id'], n=len(errs),
                pitch_median_abs_cents=float(np.median(np.abs(errs))),
                pitch_within_50=float(np.mean(np.abs(errs) < 50)),
                arrival_median_ms=float(np.median(lags)) if len(lags) else None,
                arrival_iqr_ms=float(np.subtract(*np.percentile(lags, [75, 25]))) if len(lags) else None,
                arrival_n=int(len(lags)),
                dynamics_r=None if np.isnan(r) else float(r))


def _job(v):
    if not os.path.exists(f'final/{v["id"]}.wav'):
        return v['id'], None
    return v['id'], analyse(v, vm.load_melody('melody.json'))


if __name__ == '__main__':
    os.makedirs('f0cache', exist_ok=True)
    only = set(sys.argv[1:])
    res = {}
    try:
        res = json.load(open('analysis.json'))
    except Exception:
        pass
    todo = [v for v in VERSIONS if v.get('analyse', True) is not False and (not only or v['id'] in only)]
    with Pool(4) as pool:
        for vid, a in pool.imap_unordered(_job, todo):
            if a is None:
                print('missing', vid)
                continue
            res[vid] = a
            print(f"{vid:22s} pitch |err| {a['pitch_median_abs_cents']:6.1f} c, within 50c {a['pitch_within_50']*100:5.1f}%, "
                  f"arrival {a['arrival_median_ms']} ms (IQR {a['arrival_iqr_ms']}, n={a['arrival_n']}), dyn r {a['dynamics_r']}", flush=True)
    json.dump(res, open('analysis.json', 'w'), indent=1)
