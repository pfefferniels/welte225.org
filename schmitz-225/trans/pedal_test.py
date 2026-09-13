"""The pedal channel, which the velocity analysis does not see: where the versions' pedal timelines differ, and which
timeline the recording follows, in loudness for the soft pedal and in the transcribed damper for the sustain pedal."""
import json
from pathlib import Path

import numpy as np

from analysis import design, least_squares
from hybrid_analysis import loudness_by_id

SCRATCH = Path(__file__).resolve().parent.parent
SIGLA = ['A', 'A1', 'B', 'B1', 'C']


def curve(version, name):
    c = next(c for c in version['curves'] if c['name'] == name)
    return np.array(c['seconds']), np.array(c['travel']), np.array(c['place'])


def spans_where(mask: np.ndarray, seconds: np.ndarray, place: np.ndarray) -> list[tuple[float, float, float, float]]:
    edges = np.flatnonzero(np.diff(np.concatenate([[0], mask.astype(int), [0]])))
    return [(seconds[a], seconds[b - 1], place[a], place[b - 1]) for a, b in zip(edges[::2], edges[1::2])]


def main():
    versions = {v['siglum']: v for v in json.loads((SCRATCH / 'emu' / 'versions.json').read_text())}
    for name in ('hammerRail', 'damper'):
        t, reference, place = curve(versions['C'], name)
        for s in SIGLA:
            ts, travel, _ = curve(versions[s], name)
            differs = np.abs(np.interp(t, ts, travel) - reference) > 0.5
            spans = [f'{p0:.0f}–{p1:.0f} mm ({t0:.1f}–{t1:.1f} s)' for t0, t1, p0, p1 in spans_where(differs, t, place) if t1 - t0 > 0.05]
            print(f'{name:>10} {s:>2} vs C: {", ".join(spans) if spans else "same"}')

    matched = json.loads((SCRATCH / 'trans' / 'matched.json').read_text())
    rows = matched['rows']
    loudness, _ = loudness_by_id(SCRATCH / 'trans' / 'matched.json', SCRATCH / 'trans' / 'rec_composite.json', 'composite')
    used = [r for r in rows if r['id'] in loudness and r['V_C'] is not None]
    y = np.array([loudness[r['id']] for r in used])
    pitch = np.array([r['pitch'] for r in used], dtype=float)
    emu_t = np.array([r['emu_t'] for r in used])
    base = design(np.array([r['V_C'] for r in used], dtype=float), pitch)
    n = len(y)
    print('\nsoft pedal: composite loudness ~ design(V_C) + γ·hammer rail of each version')
    fits = {}
    for s in SIGLA:
        t, travel, _ = curve(versions[s], 'hammerRail')
        soft = np.interp(emu_t, t, travel)
        fits[s] = least_squares(y, np.column_stack([base, soft]))
        print(f'  {s:>2}: γ {fits[s].coefficients[-1]:+.3f} (loudness sd units per full rail travel), notes under rail {int(np.sum(soft > 0.5))}, '
              f'n·log(RSS/RSS_C) {n * np.log(fits[s].rss / fits["C"].rss if "C" in fits else 1):+.2f}')
    print('  relative to C:', {s: round(n * np.log(fits[s].rss / fits['C'].rss), 2) for s in SIGLA})

    knots = np.array(matched['time_map_knots'])
    to_emu = lambda rec_seconds: np.interp(rec_seconds, knots[:, 1], knots[:, 0])
    pedal_events = json.loads((SCRATCH / 'trans' / 'kong.json').read_text())['pedals']
    t, _, _ = curve(versions['C'], 'damper')
    detected = np.zeros_like(t, dtype=bool)
    for e in pedal_events:
        detected |= (t >= to_emu(e['onset_time'])) & (t <= to_emu(e['offset_time']))
    span = (t >= rows[0]['emu_t']) & (t <= rows[-1]['emu_t'])
    print('\nsustain pedal: share of time the transcribed damper agrees with each version\'s damper')
    for s in SIGLA:
        ts, travel, _ = curve(versions[s], 'damper')
        down = np.interp(t, ts, travel) > 0.5
        print(f'  {s:>2}: agreement {np.mean(down[span] == detected[span]):.4f}')


if __name__ == '__main__':
    main()
