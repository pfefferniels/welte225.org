"""Generate the vocal map, render it with VTL (phrase chunks in parallel; the score twice, lips
held closed and lips following the opening, mixed by the opening weight), correct each note's
lung pressure once from the measured levels (a per-note calibration, not part of the map),
render again. Writes performance_hummed.mpm,
hummer_full.ges, hummer.speaker and ../work/dry/vtl_gruenfeld_hum.wav."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, soundfile as sf
from multiprocessing import Pool
import hummer as H
from align_tracks import align

SR = 44100
MPM_OUT = 'performance_hummed.mpm'
LAST_TRACKS = None


def render_chunk(args):
    path, speaker = args
    import vocaltractlab as vt, vocaltractlab_cython as v
    vt.load_speaker(os.path.abspath(speaker))
    return np.asarray(v.gesture_file_to_audio(os.path.abspath(path)), dtype=float)


def render(mpm, tag, calibration=None):
    tiers, postures, end_ms, voice, (t_ms, weight) = H.to_gestures(mpm, calibration)
    H.write_speaker(postures, 'hummer.speaker')
    H.write_ges(tiers, voice, 0.0, end_ms, 'hummer_full.ges')
    H.write_ges(tiers, voice, 0.0, end_ms, 'hummer_full_closed.ges', lips_closed=True)
    np.savetxt('hummer_opening.csv', np.c_[t_ms[::10] / 1000, weight[::10]], fmt='%.2f,%.3f',
               header='time_s,weight_of_the_open_rendering', comments='')
    # chunks: cut at breath starts with silence around them
    perf, mel, notes, sus = H.load_performance()
    clock = H.Clock(notes, sus)
    text = open(mpm, encoding='utf-8').read()
    cuts = [clock.ms(float(d)) + H.PAD * 1000 - 15 for d in re.findall(r'<breath date="([^"]+)"', text)]
    bounds = [0.0] + [c for c in cuts if c > 5000] + [end_ms]
    merged = [bounds[0]]
    for b in bounds[1:-1]:
        if b - merged[-1] > 25000:
            merged.append(b)
    merged.append(end_ms)
    jobs = []
    for closed in (False, True):
        for i, (a, b) in enumerate(zip(merged[:-1], merged[1:])):
            nm = f'hummer_chunk{i}{"_closed" if closed else ""}.ges'
            H.write_ges(tiers, voice, a, b, nm, lips_closed=closed)
            jobs.append((nm, 'hummer.speaker'))
    with Pool(4) as pool:
        parts = pool.map(render_chunk, jobs)
    n = len(merged) - 1
    tracks = []
    for parts_ in (parts[:n], parts[n:]):
        y = np.zeros(int(end_ms / 1000 * SR) + SR)
        for (a, b), x in zip(zip(merged[:-1], merged[1:]), parts_):
            i0 = int(a / 1000 * SR)
            y[i0: i0 + len(x)] += x[: len(y) - i0]
        tracks.append(y)
    # the two glottal cycles drift apart by up to ~1 ms (the glottis oscillates against a
    # different tract): line the open rendering up with the closed one before mixing
    tracks[0] = align(tracks[1], tracks[0], SR)[0]
    w = np.interp(np.arange(len(tracks[0])) / SR * 1000, t_ms, weight)
    y = w * tracks[0] + (1 - w) * tracks[1]
    print(f'{tag}: {len(jobs)} chunks, {len(y) / SR:.1f} s, open for {np.mean(w > 0.05) * 100:.0f} % of the time')
    global LAST_TRACKS
    LAST_TRACKS = (tracks[0], tracks[1], w)
    return y


def note_levels(y):
    """each melody note's level (80th percentile of 40 ms RMS over 30-85 % of it) and the level
    the dynamics ask for over the same stretch (the curve inside the note plus the note's offset)"""
    import voicemodel as vm
    mel = json.load(open(os.path.join(H.WORK, 'melody.json')))
    vn = vm.build_notes(mel)
    ct, cv = vm.dynamics_curve(mel)
    e = np.sqrt(np.convolve(y ** 2, np.ones(1764) / 1764, mode='same')) + 1e-9
    out = []
    for v, n in zip(vn, mel['notes']):
        a, b = v.on + H.PAD, v.off + H.PAD
        d = b - a
        i0, i1 = int((a + 0.3 * d) * SR), int((b - 0.15 * d) * SR)
        if i1 - i0 < 441:
            out.append(None); continue
        tt = np.linspace(v.on + 0.3 * d, v.off - 0.15 * d, 20)
        want = vm.vel_to_db(np.interp(tt, ct, cv) + n['velocity'] - np.interp(v.on, ct, cv))
        out.append((20 * np.log10(np.percentile(e[i0:i1], 80)), float(np.percentile(want, 80))))
    return out


def calibrate(y):
    """per-note level corrections (dB) for the second pass: what each note missed, relative to
    the median, as a factor on its lung pressure (the hum's level goes with 20 log10 of it)"""
    lv = note_levels(y)
    d = np.array([t - m for m_t in lv if m_t for m, t in [m_t]])
    med = np.median(d)
    cal = {k: float(np.clip((m_t[1] - m_t[0]) - med, -8, 8)) for k, m_t in enumerate(lv) if m_t}
    err = d - med
    print(f'  level error before calibration: median |{np.median(np.abs(err)):.2f}| dB, '
          f'90th pct |{np.percentile(np.abs(err), 90):.2f}| dB')
    return cal


if __name__ == '__main__':
    profile = json.load(open('profile.json'))
    pal = np.load('palette.npz')
    palette = dict(zip(pal['names'], pal['shapes']))
    ev, clock = H.build_vocal_map(profile, list(palette))
    H.write_mpm(ev, profile, palette, MPM_OUT)
    counts = {}
    for _, tag, _ in ev:
        counts[tag] = counts.get(tag, 0) + 1
    print('vocalMap:', len(ev), 'events', counts)
    if '--calibration' in sys.argv:              # one pass, with another rendering's calibration
        cal = {int(k): v for k, v in json.load(open(sys.argv[sys.argv.index('--calibration') + 1])).items()}
        y = render(MPM_OUT, 'one pass', cal)
    else:
        y = render(MPM_OUT, 'pass 1')
        cal = calibrate(y)
        json.dump(cal, open('hummer_calibration.json', 'w'))
        y = render(MPM_OUT, 'pass 2', cal)
    lv = note_levels(y)
    d = np.array([t - m for m_t in lv if m_t for m, t in [m_t]])
    print(f'  level error after calibration: median |{np.median(np.abs(d - np.median(d))):.2f}| dB, '
          f'90th pct |{np.percentile(np.abs(d - np.median(d)), 90):.2f}| dB')
    sf.write(os.path.join(H.WORK, 'dry', 'vtl_gruenfeld_hum.wav'), (y / (np.abs(y).max() + 1e-9) * 0.9).astype(np.float32), SR)
    print('written', MPM_OUT, 'hummer_full.ges', 'hummer.speaker', 'dry/vtl_gruenfeld_hum.wav')
