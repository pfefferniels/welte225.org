"""Pair two transcriptions of the same recording note by note: the lead-in between the two transfers, their speed
ratio, and how far the transcribed velocities agree."""
import json
import sys

import numpy as np


def compare(reference_path: str, other_path: str) -> dict:
    reference = json.load(open(reference_path))['notes']
    other = json.load(open(other_path))['notes']
    ta = np.array([n['onset_time'] for n in reference])
    pa = np.array([n['midi_note'] for n in reference]).astype(int)
    tb = np.array([n['onset_time'] for n in other])
    pb = np.array([n['midi_note'] for n in other]).astype(int)

    def hits(d):
        return sum(1 for t, p in zip(tb, pb) if (m := np.abs(ta[pa == p] - (t + d))).size and m.min() < 0.03)

    first = ta[0] - tb[0]
    shift = max(np.arange(first - 0.5, first + 0.5, 0.001), key=hits)
    pairs = []
    for k, (t, p) in enumerate(zip(tb, pb)):
        idx = np.flatnonzero(pa == p)
        if idx.size:
            j = idx[np.argmin(np.abs(ta[idx] - (t + shift)))]
            if abs(ta[j] - (t + shift)) < 0.05:
                pairs.append((j, k))
    x = np.array([tb[k] for _, k in pairs])
    y = np.array([ta[j] for j, _ in pairs])
    slope, intercept = np.polyfit(x, y, 1)
    va = np.array([reference[j]['velocity'] for j, _ in pairs], dtype=float)
    vb = np.array([other[k]['velocity'] for _, k in pairs], dtype=float)
    return {'notes': [len(reference), len(other)], 'paired': len(pairs), 'lead_in': float(np.median(y - x)),
            'speed_ratio': float(slope), 'onset_residual_sd_ms': float(np.std(y - (slope * x + intercept)) * 1000),
            'velocity_difference_mean': float(np.mean(va - vb)), 'velocity_difference_sd': float(np.std(va - vb)),
            'velocity_r': float(np.corrcoef(va, vb)[0, 1])}


if __name__ == '__main__':
    print(json.dumps(compare(sys.argv[1], sys.argv[2]), indent=1))
