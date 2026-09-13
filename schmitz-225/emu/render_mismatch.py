"""MIDI for a version emulated under another instrument and pushed through a non-linear velocity map."""
import json
import numpy as np
from to_midi import midi_of

CASES = [('B', '1478', lambda v: 35 + 55 * np.clip((v - 35) / 55, 0, None) ** 0.6, 'compressive'),
         ('C', '3309', lambda v: 35 + 55 * np.clip((v - 35) / 55, 0, None) ** 1.6, 'expansive')]

versions = {v['siglum']: v for v in json.load(open('versions.json'))}
runs = json.load(open('hybrids.json'))['runs']
for siglum, instrument, velocity_map, map_name in CASES:
    run = next(r for r in runs if r['kind'] == 'version' and r['siglum'] == siglum and r['instrument'] == instrument)
    velocity = {note_id: v for note_id, _, _, v in run['notes']}
    version = dict(versions[siglum])
    version['notes'] = [{**n, 'velocity': float(velocity_map(velocity[n['id']]))} for n in versions[siglum]['notes']]
    midi_of(version).save(f'mismatch_{siglum}_{instrument}_{map_name}.mid')
    print(siglum, instrument, map_name)
