"""Known texts as MIDI in the recording's time: the onsets Transkun heard, the roll's own durations through the time
map, a version's emulated velocities, and the damper Kong transcribed from the recording."""
import json
import sys
from pathlib import Path

import mido
import numpy as np

matched = json.loads(Path(sys.argv[1]).read_text())
pedals = json.loads(Path(sys.argv[2]).read_text())['pedals']
siglum, out = sys.argv[3], Path(sys.argv[4])
x, y = np.array(matched['time_map_knots']).T
project = lambda t: float(np.interp(t, x, y))

events = []
for r in matched['rows']:
    onset = r['rec_t']
    offset = onset + max(0.05, project(r['emu_off']) - project(r['emu_t']))
    v = int(round(np.clip(r[f'V_{siglum}'], 1, 127)))
    events += [(onset, mido.Message('note_on', note=r['pitch'], velocity=v)), (offset, mido.Message('note_off', note=r['pitch'], velocity=0))]
for p in pedals:
    events += [(p['onset_time'], mido.Message('control_change', control=64, value=127)),
               (p['offset_time'], mido.Message('control_change', control=64, value=0))]
events.sort(key=lambda e: (e[0], e[1].type != 'note_off'))
track, now = mido.MidiTrack([mido.MetaMessage('set_tempo', tempo=1_000_000)]), 0
for at, message in events:
    tick = int(round(at * 1000))
    track.append(message.copy(time=tick - now))
    now = tick
mido.MidiFile(ticks_per_beat=1000, tracks=[track]).save(out)
print(siglum, len(matched['rows']), 'notes', len(pedals), 'damper presses')
