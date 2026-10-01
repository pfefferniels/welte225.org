"""What the released editor does with made-up notes in one 10 s window: its correction as the acoustic estimate v0
rises for every note, with v0 drawn at random note by note, and as the window fills."""
import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score_hpt import SCALE, load_model  # noqa: E402

FRAMES, SUSTAIN = 1001, 30


def corrections(post, v0, pitches, onsets):
    from score_inf.io_types import AcousticIO, CondIO
    vel, onset, frame = (torch.zeros(1, FRAMES, 88) for _ in range(3))
    for v, p, f in zip(v0, pitches, onsets):
        vel[0, f:f + SUSTAIN, p] = v
        frame[0, f:f + SUSTAIN, p] = 1
        onset[0, f, p] = 1
    with torch.no_grad():
        out = post(AcousticIO(vel=vel), CondIO(onset=onset, frame=frame))['vel_corr']
    return np.array([(out[0, f, p] - vel[0, f, p]).item() * SCALE for p, f in zip(pitches, onsets)])


def main():
    repo = Path(sys.argv[1]).resolve()
    _, transcriber = load_model(repo, repo / 'workspaces/checkpoints/hpt+onset+frame+score_note_editor/100000_iterations.pth')
    post = transcriber.model.post.eval()
    rng = np.random.default_rng(225)

    def window(n):
        return rng.integers(25, 70, n), np.sort(rng.choice(np.arange(960), n, replace=False))

    pitches, onsets = window(40)
    levels = {}
    for v in (0.2, 0.35, 0.5, 0.65, 0.8):
        d = corrections(post, np.full(40, v), pitches, onsets)
        levels[f'{v * SCALE:.1f}'] = {'mean': float(d.mean()), 'sd': float(d.std())}
    v0 = rng.uniform(0.25, 0.75, 40)
    d = corrections(post, v0, pitches, onsets)
    random_v0 = {'r_correction_v0': float(np.corrcoef(d, v0 * SCALE)[0, 1]), 'slope': float(np.polyfit(v0 * SCALE, d, 1)[0]),
                 'sd': float(d.std())}
    density = {}
    for n in (5, 20, 80, 200):
        d = corrections(post, np.full(n, 0.45), *window(n))
        density[str(n)] = {'mean': float(d.mean()), 'sd': float(d.std())}
    result = {'all_notes_at_v0': levels, 'random_v0': random_v0, 'notes_in_window_at_v0_57.6': density}
    (Path(__file__).resolve().parent / 'editor_probe.json').write_text(json.dumps(result, indent=1))
    print(json.dumps(result, indent=1))


if __name__ == '__main__':
    main()
