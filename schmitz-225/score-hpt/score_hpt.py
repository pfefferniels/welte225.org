"""Per-note velocities of the aligned roll notes by Score-HPT (He, Togneri and Huang, arXiv:2508.07757), run as the
authors' inference code runs it: 10 s windows at a 5 s hop, onset and frame rolls at 100 frames per second, the
checkpoint hpt+onset+frame+score_note_editor/100000_iterations.pth. Each note gets the acoustic estimate v0 of the
HPT branch and the editor's corrected value, both read at the onset frame (the paper's onset-masked measure) and
as the maximum over the note's frames (the default of the authors' inference.py)."""
import argparse
import json
import sys
from pathlib import Path

import librosa
import numpy as np
import torch

FPS = 100
SCALE = 128


def load_model(repo: Path, checkpoint: Path):
    repo, checkpoint = repo.resolve(), checkpoint.resolve()
    sys.path.insert(0, str(repo))
    sys.path.insert(0, str(repo / 'pytorch'))
    from hydra import compose, initialize_config_dir
    with initialize_config_dir(config_dir=str(repo / 'pytorch' / 'config'), version_base=None):
        cfg = compose(config_name='config', overrides=[
            'model.type=hpt', 'score_informed.method=note_editor', 'model.input2=onset', 'model.input3=frame',
            'exp.cuda=false'])
    from inference import VeloTranscription
    return cfg, VeloTranscription(checkpoint_path=str(checkpoint), cfg=cfg)


def time_map(knots):
    x, y = np.array(knots).T
    return lambda t: np.interp(t, x, y, left=y[0] + (t - x[0]), right=y[-1] + (t - x[-1]))


def score_notes(matched: dict, onsets: str, jitter: float, rng) -> list[dict]:
    """The roll's notes in the recording's time: onsets heard by the transcription or projected by the time map."""
    project = time_map(matched['time_map_knots'])
    notes = []
    for k, r in enumerate(matched['rows']):
        onset = r['rec_t'] if onsets == 'heard' and r['rec_t'] is not None else float(project(r['emu_t']))
        offset = float(project(r['emu_off'])) - float(project(r['emu_t'])) + onset
        onset += rng.normal(0, jitter) if jitter else 0.0
        notes.append({'index': k, 'pitch': r['pitch'], 'onset': onset, 'offset': max(offset, onset + 0.05)})
    # A key struck again before its release: the earlier note ends where the next begins, as in a MIDI file.
    by_pitch = {}
    for note in sorted(notes, key=lambda n: n['onset']):
        previous = by_pitch.get(note['pitch'])
        if previous and previous['offset'] > note['onset'] - 1 / FPS:
            previous['offset'] = max(previous['onset'] + 1 / FPS, note['onset'] - 1 / FPS)
        by_pitch[note['pitch']] = note
    return notes


def rolls(notes, frames):
    onset = np.zeros((frames, 88), dtype=np.float32)
    frame = np.zeros((frames, 88), dtype=np.float32)
    for n in notes:
        p = n['pitch'] - 21
        start, stop = int(round(n['onset'] * FPS)), int(round(n['offset'] * FPS))
        frame[max(start, 0):stop + 1, p] = 1
        if 0 <= start < frames:
            onset[start, p] = 1
    return onset, frame


def run(transcriber, audio, onset_roll, frame_roll):
    """The authors' segmentation, keeping both the acoustic estimate and the editor's output."""
    t = transcriber
    n = audio.shape[0]
    segments = int(np.ceil(n / t.segment_samples))
    audio_seg = t.enframe(np.pad(audio[None, :], ((0, 0), (0, segments * t.segment_samples - n))), is_audio=True)

    def frames_of(roll):
        return t.enframe(np.pad(roll, ((0, segments * t.segment_frames - roll.shape[0]), (0, 0))), is_audio=False)

    from score_inf.io_types import dict_to_acoustic, dict_to_cond
    on_seg, fr_seg = frames_of(onset_roll), frames_of(frame_roll)
    vel0, corr = [], []
    model = t.model.eval()
    with torch.no_grad():
        for k in range(len(audio_seg)):
            wav = torch.from_numpy(audio_seg[k:k + 1]).float()
            cond = {'onset': torch.from_numpy(on_seg[k:k + 1]), 'frame': torch.from_numpy(fr_seg[k:k + 1])}
            acoustic = dict_to_acoustic(model.base_adapter(wav))
            cond_io = dict_to_cond(cond)
            model._align_time(acoustic, cond_io)
            out = model.post(acoustic, cond_io)
            vel0.append(acoustic.vel.numpy())
            corr.append(out['vel_corr'].numpy())
    vel0 = t.deframe(np.concatenate(vel0))
    corr = t.deframe(np.concatenate(corr))
    return vel0, corr


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('audio', type=Path)
    parser.add_argument('matched', type=Path)
    parser.add_argument('out', type=Path)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--checkpoint', type=Path)
    parser.add_argument('--lead-in', type=float, default=0.0, help='seconds of silence to prepend to the audio')
    parser.add_argument('--onsets', choices=['heard', 'mapped'], default='heard')
    parser.add_argument('--shift', type=float, default=0.0, help='seconds added to every score onset and offset')
    parser.add_argument('--jitter', type=float, default=0.0, help='sd in seconds of random onset displacement')
    parser.add_argument('--seed', type=int, default=225)
    args = parser.parse_args()
    checkpoint = args.checkpoint or args.repo / 'workspaces/checkpoints/hpt+onset+frame+score_note_editor/100000_iterations.pth'

    cfg, transcriber = load_model(args.repo, checkpoint)
    sr = cfg.feature.sample_rate
    audio, _ = librosa.load(str(args.audio), sr=sr, mono=True)
    audio = np.concatenate([np.zeros(int(round(args.lead_in * sr)), dtype=np.float32), audio.astype(np.float32)])

    matched = json.loads(args.matched.read_text())
    notes = score_notes(matched, args.onsets, args.jitter, np.random.default_rng(args.seed))
    for n in notes:
        n['onset'] += args.shift
        n['offset'] += args.shift
    frames = int(round(len(audio) / sr * FPS)) + 1
    onset_roll, frame_roll = rolls(notes, frames)

    vel0, corr = run(transcriber, audio, onset_roll, frame_roll)
    out = []
    for n in notes:
        p, start = n['pitch'] - 21, int(np.clip(round(n['onset'] * FPS), 0, len(corr) - 1))
        stop = min(max(start + 1, int(round(n['offset'] * FPS))), len(corr))
        out.append({'index': n['index'], 'onset': n['onset'],
                    'v0_onset': float(vel0[start, p] * SCALE), 'v0_max': float(vel0[start:stop, p].max() * SCALE),
                    'onset_velocity': float(corr[start, p] * SCALE), 'max_velocity': float(corr[start:stop, p].max() * SCALE)})
    args.out.write_text(json.dumps(out))
    delta = np.array([o['onset_velocity'] - o['v0_onset'] for o in out])
    print(f'{len(out)} notes; editor correction at onsets: mean {delta.mean():+.2f}, sd {delta.std():.2f}, '
          f'|max| {np.abs(delta).max():.1f} (velocity units)')


if __name__ == '__main__':
    main()
