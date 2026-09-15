"""Match the notes of the emulated roll to the notes transcribed from the recording."""
import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
from scipy.interpolate import UnivariateSpline
from scipy.ndimage import gaussian_filter1d
from scipy.optimize import linear_sum_assignment

SCRATCH = Path(__file__).resolve().parent.parent
SIGLA = ['A', 'A1', 'B', 'B2', 'C', 'D1', 'D3', 'D2']
FRAME = 0.02


@dataclass(frozen=True)
class Note:
    id: str
    pitch: int
    onset: float
    offset: float
    velocity: float
    mm: float = float('nan')


def emulated_notes(version) -> list[Note]:
    offsets = {}
    for off in version['offs']:
        offsets.setdefault(off['id'], off['at'])
    return [Note(n['id'], n['pitch'], n['at'], offsets.get(n['id'], n['at'] + 0.3), n['velocity'], n['mm']) for n in version['notes']]


def transcribed_notes(path: Path) -> list[Note]:
    events = json.loads(path.read_text())['notes']
    return [Note(f'rec{k}', int(e['midi_note']), e['onset_time'], e['offset_time'], e['velocity']) for k, e in enumerate(events)]


def activity_roll(notes: list[Note], length: float) -> np.ndarray:
    """Pitch-by-frame roll with an onset spike and a short decaying sustain, smoothed in time."""
    frames = int(length / FRAME) + 1
    roll = np.zeros((88, frames))
    for note in notes:
        start = int(note.onset / FRAME)
        stop = max(start + 1, min(frames, int(note.offset / FRAME)))
        span = np.arange(stop - start)
        roll[note.pitch - 21, start:stop] += 0.3 * np.exp(-span * FRAME / 0.5)
        roll[note.pitch - 21, start] += 1.0
    return gaussian_filter1d(roll, sigma=1.5, axis=1) + 1e-3


def dtw_time_map(reference: list[Note], performance: list[Note]):
    length = max(n.offset for n in reference + performance) + 1
    path = librosa.sequence.dtw(activity_roll(reference, length), activity_roll(performance, length), metric='cosine',
                                subseq=False, backtrack=True)[1][::-1]
    ref_t, perf_t = path[:, 0] * FRAME, path[:, 1] * FRAME
    unique_ref, first = np.unique(ref_t, return_index=True)
    return lambda t: np.interp(t, unique_ref, perf_t[first])


def assign(reference: list[Note], performance: list[Note], predict, window: float) -> dict[str, Note]:
    """Per pitch, the assignment of performed to reference notes minimising the onset error."""
    matches = {}
    for pitch in {n.pitch for n in reference}:
        refs = [n for n in reference if n.pitch == pitch]
        perfs = [n for n in performance if n.pitch == pitch]
        if not perfs:
            continue
        cost = np.abs(predict(np.array([r.onset for r in refs]))[:, None] - np.array([p.onset for p in perfs])[None, :])
        cost = np.where(cost < window, cost, 1e6)
        rows, cols = linear_sum_assignment(cost)
        matches.update({refs[r].id: perfs[c] for r, c in zip(rows, cols) if cost[r, c] < window})
    return matches


def spline_time_map(reference: list[Note], matches: dict[str, Note]):
    pairs = sorted((n.onset, matches[n.id].onset) for n in reference if n.id in matches)
    x, y = np.array(pairs).T
    x = x + np.arange(len(x)) * 1e-6
    return UnivariateSpline(x, y, k=3, s=len(x) * 0.03 ** 2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--transcription', type=Path, default=SCRATCH / 'trans' / 'kong.json')
    parser.add_argument('--out', type=Path, default=SCRATCH / 'trans' / 'matched.json')
    parser.add_argument('--reference', default='C')
    parser.add_argument('--time-map', type=Path, help='take the time map of an earlier alignment instead of finding one')
    args = parser.parse_args()

    versions = {v['siglum']: v for v in json.loads((SCRATCH / 'emu' / 'versions.json').read_text())['versions']}
    reference = emulated_notes(versions[args.reference])
    performance = transcribed_notes(args.transcription)

    if args.time_map:
        knots = np.array(json.loads(args.time_map.read_text())['time_map_knots'])
        predict = lambda t: np.interp(t, knots[:, 0], knots[:, 1])
        matches = assign(reference, performance, predict, window=0.1)
    else:
        predict = dtw_time_map(reference, performance)
        matches = assign(reference, performance, predict, window=0.35)
        for window in (0.2, 0.12, 0.1):
            predict = spline_time_map(reference, matches)
            matches = assign(reference, performance, predict, window=window)

    residuals = np.array([matches[n.id].onset - predict(n.onset) for n in reference if n.id in matches])
    print(f'matched {len(matches)} of {len(reference)} reference notes; {len(performance)} transcribed; '
          f'onset residual sd {residuals.std() * 1000:.1f} ms')

    velocities = {s: {n['canonical']: n['velocity'] for n in versions[s]['notes'] if n['canonical']} for s in SIGLA}
    rows = []
    for note in reference:
        rec = matches.get(note.id)
        row = {'id': note.id, 'pitch': note.pitch, 'mm': note.mm, 'emu_t': note.onset, 'emu_off': note.offset,
               'rec_t': rec.onset if rec else None, 'rec_off': rec.offset if rec else None,
               'kong_velocity': rec.velocity if rec else None}
        row.update({f'V_{s}': velocities[s].get(note.id) for s in SIGLA})
        rows.append(row)
    matched_ids = {id(m) for m in matches.values()}
    unmatched = [n for n in performance if id(n) not in matched_ids]
    args.out.write_text(json.dumps({
        'rows': rows,
        'unmatched_transcribed': [n.__dict__ for n in unmatched],
        'time_map_knots': [[float(t), float(predict(t))] for t in np.linspace(reference[0].onset, reference[-1].onset, 400)],
    }))


if __name__ == '__main__':
    main()
