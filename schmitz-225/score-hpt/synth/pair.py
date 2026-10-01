"""Transcribed velocities of a rendering, row by row of the matched file whose onsets it was rendered from."""
import json, sys
import numpy as np
rows = json.load(open(sys.argv[1]))['rows']
notes = json.load(open(sys.argv[2]))['notes']
used, out = set(), []
for k, r in enumerate(rows):
    cands = [(abs(n['onset_time'] - r['rec_t']), j) for j, n in enumerate(notes) if int(n['midi_note']) == r['pitch'] and j not in used]
    if cands and min(cands)[0] < 0.05:
        j = min(cands)[1]; used.add(j); out.append({'index': k, 'velocity': notes[j]['velocity']})
json.dump(out, open(sys.argv[3], 'w'))
print(sys.argv[2], 'paired', len(out), 'of', len(rows))
