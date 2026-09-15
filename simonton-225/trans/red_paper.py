"""Whether the recording plays red paper or the Licensee paper of D3: the notes D3 re-strikes and ties, and the
stretches the Licensee paper adds."""
import json
from dataclasses import dataclass
from functools import reduce
from pathlib import Path

import numpy as np

SCRATCH = Path(__file__).resolve().parent.parent
TRANS = SCRATCH / 'trans'
# Where both Licensee copies run longer than the red ones, after welte225.org/licensee-225/an/findings.md.
LICENSEE_STRETCHES = {'bar 3 → bar 4': (2073.0, 2244.0), 'bar 8 → bar 1′': (3340.0, 3474.0)}
HEARD_WITHIN = 0.6
CONTROL_SPAN_MM = (130.0, 175.0)
STEP_WINDOW = 20


def versions_by_siglum() -> dict:
    return {v['siglum']: v for v in json.loads((SCRATCH / 'emu' / 'versions.json').read_text())['versions']}


def licensee_readings(versions: dict) -> list[tuple[str, dict]]:
    """D3's notes that C lacks, its re-strikes, and C's notes that D3 lacks, the repetition it ties."""
    in_d3 = {n['canonical'] for n in versions['D3']['notes'] if n['canonical']}
    restrikes = [('re-strike', n) for n in versions['D3']['notes'] if not n['canonical']]
    tied = [('tied over', n) for n in versions['C']['notes'] if n['id'] not in in_d3]
    return restrikes + tied


def text_test(matched_path: Path, transcription_path: Path, versions: dict) -> list[dict]:
    knots = np.array(json.loads(matched_path.read_text())['time_map_knots'])
    heard = json.loads(transcription_path.read_text())['notes']

    def reading(kind: str, note: dict) -> dict:
        at = float(np.interp(note['at'], knots[:, 0], knots[:, 1]))
        onsets = [{'offset_s': round(e['onset_time'] - at, 3), 'velocity': e['velocity']} for e in heard
                  if int(e['midi_note']) == note['pitch'] and abs(e['onset_time'] - at) < HEARD_WITHIN]
        return {'kind': kind, 'pitch': note['pitch'], 'mm': note['mm'], 'rec_t': at, 'heard': onsets}

    return [reading(kind, note) for kind, note in licensee_readings(versions)]


@dataclass(frozen=True)
class Onsets:
    mm: np.ndarray
    emu: np.ndarray
    rec: np.ndarray


def matched_onsets(matched_path: Path) -> Onsets:
    rows = sorted((r for r in json.loads(matched_path.read_text())['rows'] if r['rec_t'] is not None), key=lambda r: r['mm'])
    return Onsets(*(np.array([r[key] for r in rows]) for key in ('mm', 'emu_t', 'rec_t')))


def extra_paper(onsets: Onsets, quadratic: np.ndarray, start_mm: float, end_mm: float) -> dict:
    """Recorded time over a span beyond what the quadratic time map predicts, and the paper that time stands for."""
    i, j = (int(np.argmin(np.abs(onsets.mm - place))) for place in (start_mm, end_mm))
    predicted = np.polyval(quadratic, onsets.emu[j]) - np.polyval(quadratic, onsets.emu[i])
    extra = (onsets.rec[j] - onsets.rec[i]) - predicted
    return {'from_mm': float(onsets.mm[i]), 'to_mm': float(onsets.mm[j]), 'extra_s': float(extra),
            'extra_mm': float(extra * (onsets.mm[j] - onsets.mm[i]) / predicted)}


def control_spans(onsets: Onsets, quadratic: np.ndarray) -> np.ndarray:
    """Extra paper over every span from one note to a note 130 to 175 mm later, the length of the Licensee stretches."""
    def from_note(i: int):
        later = np.flatnonzero((onsets.mm - onsets.mm[i] > CONTROL_SPAN_MM[0]) & (onsets.mm - onsets.mm[i] < CONTROL_SPAN_MM[1]))
        return extra_paper(onsets, quadratic, onsets.mm[i], onsets.mm[later[len(later) // 2]])['extra_mm'] if len(later) else None
    return np.array([x for x in map(from_note, range(len(onsets.mm))) if x is not None])


def step_at(onsets: Onsets, k: int) -> dict:
    """Jump between straight lines fitted to the notes before and after note k, in seconds and in paper."""
    before, after, around = slice(k - STEP_WINDOW, k), slice(k, k + STEP_WINDOW), slice(k - STEP_WINDOW, k + STEP_WINDOW)
    at = (onsets.emu[k - 1] + onsets.emu[k]) / 2
    seconds = np.polyval(np.polyfit(onsets.emu[after], onsets.rec[after], 1), at) - np.polyval(np.polyfit(onsets.emu[before], onsets.rec[before], 1), at)
    mm_per_second = np.polyfit(onsets.rec[around], onsets.mm[around], 1)[0]
    return {'index': k, 'between_mm': [float(onsets.mm[k - 1]), float(onsets.mm[k])], 'seconds': float(seconds), 'mm': float(seconds * mm_per_second)}


def largest_steps(onsets: Onsets, count: int = 5) -> list[dict]:
    """The largest jumps in the time map, each at least a window away from those already taken."""
    steps = sorted((step_at(onsets, k) for k in range(STEP_WINDOW, len(onsets.mm) - STEP_WINDOW)), key=lambda s: -abs(s['seconds']))
    return reduce(lambda taken, s: taken + [s] if len(taken) < count and all(abs(s['index'] - t['index']) > STEP_WINDOW for t in taken) else taken,
                  steps, [])


def stretch_test(matched_path: Path) -> dict:
    onsets = matched_onsets(matched_path)
    quadratic = np.polyfit(onsets.emu, onsets.rec, 2)
    control = control_spans(onsets, quadratic)
    return {
        'rec_seconds_per_emulated_second': float(np.polyfit(onsets.emu, onsets.rec, 1)[0]),
        'stretches': {label: extra_paper(onsets, quadratic, *span) for label, span in LICENSEE_STRETCHES.items()},
        'control': {'spans': len(control), 'sd_mm': float(control.std()), 'p1_mm': float(np.percentile(control, 1)),
                    'p99_mm': float(np.percentile(control, 99)), 'max_abs_mm': float(np.abs(control).max())},
        'largest_steps': largest_steps(onsets),
    }


def main():
    versions = versions_by_siglum()
    print(json.dumps({
        'text, Transkun': text_test(TRANS / 'matched_transkun.json', TRANS / 'transkun_rec.json', versions),
        'text, Kong': text_test(TRANS / 'matched.json', TRANS / 'kong.json', versions),
        'timing, Transkun': stretch_test(TRANS / 'matched_transkun.json'),
    }, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
