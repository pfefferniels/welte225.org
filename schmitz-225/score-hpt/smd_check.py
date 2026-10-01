"""Sanity check of score_hpt.py on the paper's own test set (Saarland Music Data): onset-masked velocity error of the
acoustic estimate v0 and of the editor's output against the ground-truth MIDI, as in the paper's Table 2."""
import json
import sys
from pathlib import Path

import librosa
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score_hpt import FPS, SCALE, load_model, rolls, run  # noqa: E402


def main():
    repo, smd = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    cfg, transcriber = load_model(repo, repo / 'workspaces/checkpoints/hpt+onset+frame+score_note_editor/100000_iterations.pth')
    from utilities import read_midi, original_score_events
    midis = sorted(smd.rglob('*.mid'))[:limit]
    results, all_rows = [], []
    for midi in midis:
        wav = next(iter(sorted(smd.rglob(midi.stem + '.wav'))), None)
        if wav is None:
            continue
        audio, _ = librosa.load(str(wav), sr=cfg.feature.sample_rate, mono=True)
        dur = len(audio) / cfg.feature.sample_rate
        m = read_midi(str(midi), dataset='maestro')  # SMD v2 keeps the tempo first, as MAESTRO does
        events, _ = original_score_events(cfg, np.asarray(m['midi_event_time'], float), [str(e) for e in m['midi_event']], dur)
        notes = [{'pitch': e['midi_note'], 'onset': e['onset_time'], 'offset': e['offset_time'], 'velocity': e['velocity']}
                 for e in events if 21 <= e['midi_note'] <= 108 and e['onset_time'] < dur]
        frames = int(round(dur * FPS)) + 1
        onset_roll, frame_roll = rolls(notes, frames)
        vel0, corr = run(transcriber, audio, onset_roll, frame_roll)
        rows = []
        for n in notes:
            p, f = n['pitch'] - 21, int(np.clip(round(n['onset'] * FPS), 0, len(corr) - 1))
            rows.append((n['velocity'], vel0[f, p] * SCALE, corr[f, p] * SCALE))
        r = np.array(rows)
        all_rows.append(r)
        delta = r[:, 2] - r[:, 1]
        results.append({'piece': midi.stem, 'notes': len(r), 'mae_v0': float(np.abs(r[:, 1] - r[:, 0]).mean()),
                        'mae_editor': float(np.abs(r[:, 2] - r[:, 0]).mean()), 'delta_mean': float(delta.mean()),
                        'delta_sd': float(delta.std()), 'r_v0': float(np.corrcoef(r[:, 0], r[:, 1])[0, 1]),
                        'r_editor': float(np.corrcoef(r[:, 0], r[:, 2])[0, 1])})
        print(json.dumps(results[-1]), flush=True)
    r = np.concatenate(all_rows)
    delta = r[:, 2] - r[:, 1]
    shift = float(np.mean(delta))
    summary = {'pieces': len(results), 'notes': len(r),
               'onset_mae_v0': float(np.mean([x['mae_v0'] for x in results])),
               'onset_mae_editor': float(np.mean([x['mae_editor'] for x in results])),
               'onset_mae_v0_plus_mean_correction': float(np.mean([np.abs(a[:, 1] + shift - a[:, 0]).mean() for a in all_rows])),
               'correction_mean': shift, 'correction_sd': float(delta.std()),
               'correction_sd_within_piece_mean': float(np.mean([x['delta_sd'] for x in results]))}
    print('SUMMARY', json.dumps(summary, indent=1))
    Path(sys.argv[4] if len(sys.argv) > 4 else 'smd_eval.json').write_text(json.dumps({'summary': summary, 'pieces': results}, indent=1))


if __name__ == '__main__':
    main()
