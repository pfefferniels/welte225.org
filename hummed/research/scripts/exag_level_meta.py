"""Per exaggeration level: duration, the score-position map (ticks -> seconds on the audio
timeline) and the bar starts, as JSON for the mixing page."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'work'))
import soundfile as sf
import export_data as ed

S = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LEVELS = [('x000', 0.0), ('x050', 0.5), ('x100', 1.0), ('x150', 1.5), ('x200', 2.0)]
out = []
for key, s in LEVELS:
    E = os.path.join(S, 'exag', key)
    perf = json.load(open(os.path.join(E, 'render', 'performed.json')))
    mel = json.load(open(os.path.join(E, 'work', 'melody.json')))
    fin = os.path.join(S, 'work', 'final') if key == 'x100' else os.path.join(E, 'work', 'final')
    dur = sf.info(os.path.join(fin, 'vtl_hummer.wav')).duration
    pts = sorted({(round(n['date']), round(n['milliseconds']['date'])) for p in perf['parts'] for n in p['notes']
                  if not n.get('ornamented')})
    tick, ms = [], []
    for d, m in pts:                                 # strictly increasing in both
        if tick and (d <= tick[-1] or m <= ms[-1]):
            continue
        tick.append(d); ms.append(m)
    bars = ed.bars(ed.notes_for(mel, 'gruenfeld'))
    tiles = sorted(os.listdir(os.path.join(S, 'site_mix', 'levels', key, 'spec')))
    out.append(dict(key=key, s=s, dur=round(dur, 2), tiles=tiles, tick=tick, sec=[round(m / 1000 + ed.PAD, 3) for m in ms],
                    bars=[[b['t'], b['b']] for b in bars]))
    print(key, s, round(dur, 1), 's,', len(tick), 'map points,', len(bars), 'bars', file=sys.stderr)
json.dump(out, open(os.path.join(S, 'site_mix', 'levels.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
