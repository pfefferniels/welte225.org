"""Write each emulated version as a MIDI file a synthesizer can render: notes with their velocities, the damper as CC64."""
import json
import mido
import numpy as np

TICKS_PER_SECOND = 1000


def damper_changes(curve, threshold=0.5):
    down = np.array(curve['travel']) >= threshold
    flips = np.flatnonzero(np.diff(down.astype(int))) + 1
    return [(curve['seconds'][k], 127 if down[k] else 0) for k in flips]


def midi_of(version):
    offsets = {}
    for off in version['offs']:
        offsets.setdefault(off['id'], off['at'])
    damper = next(c for c in version['curves'] if c['name'] == 'damper')
    events = [(n['at'], mido.Message('note_on', note=n['pitch'], velocity=int(round(np.clip(n['velocity'], 1, 127))))) for n in version['notes']]
    events += [(offsets[n['id']], mido.Message('note_off', note=n['pitch'], velocity=0)) for n in version['notes']]
    events += [(at, mido.Message('control_change', control=64, value=value)) for at, value in damper_changes(damper)]
    events.sort(key=lambda event: (event[0], event[1].type != 'note_off'))
    track = mido.MidiTrack([mido.MetaMessage('set_tempo', tempo=1_000_000)])
    now = 0
    for at, message in events:
        tick = int(round(at * TICKS_PER_SECOND))
        track.append(message.copy(time=tick - now))
        now = tick
    return mido.MidiFile(ticks_per_beat=TICKS_PER_SECOND, tracks=[track])


if __name__ == '__main__':
    versions = {v['siglum']: v for v in json.load(open('versions.json'))}
    for siglum in ('A1', 'B', 'B1', 'C'):
        midi_of(versions[siglum]).save(f'version_{siglum}.mid')
    print('ok')
