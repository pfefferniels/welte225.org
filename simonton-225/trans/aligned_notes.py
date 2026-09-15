"""The aligned notes the NMF reads, with Transkun's onsets where it heard the note and Kong's otherwise, and Transkun's
velocities by row."""
import json
from pathlib import Path

TRANS = Path(__file__).resolve().parent
HELD = 0.5


def main():
    transkun = json.loads((TRANS / 'matched_transkun.json').read_text())['rows']
    kong = json.loads((TRANS / 'matched.json').read_text())['rows']
    heard = [(k, t if t['rec_t'] is not None else g) for k, (t, g) in enumerate(zip(transkun, kong))]
    aligned = [{'index': k, 'pitch': r['pitch'], 'onset': r['rec_t'], 'offset': r['rec_off'] or r['rec_t'] + HELD}
               for k, r in heard if r['rec_t'] is not None]
    (TRANS / 'rec_aligned.json').write_text(json.dumps(aligned))
    (TRANS / 'transkun_loudness.json').write_text(json.dumps(
        [{'index': k, 'velocity': r['kong_velocity']} for k, r in enumerate(transkun) if r['kong_velocity'] is not None]))
    print(len(aligned), 'aligned notes')


if __name__ == '__main__':
    main()
