import mido, json, sys

def events(path):
    m = mido.MidiFile(path)
    tempos = []
    t = 0
    notes, open_, pedal, soft = [], {}, [], []
    for msg in mido.merge_tracks(m.tracks):
        t += msg.time
        if msg.type == 'set_tempo': tempos.append((t, msg.tempo))
        elif msg.type == 'note_on' and msg.velocity > 0:
            if msg.note in open_: notes.append({**open_.pop(msg.note), 'off': t, 'restruck': True})
            open_[msg.note] = {'pitch': msg.note, 'on': t, 'vel': msg.velocity}
        elif msg.type in ('note_off', 'note_on'):
            if msg.note in open_: notes.append({**open_.pop(msg.note), 'off': t})
        elif msg.type == 'control_change' and msg.control in (64, 67):
            (pedal if msg.control == 64 else soft).append({'t': t, 'value': msg.value})
    notes.sort(key=lambda n: (n['on'], n['pitch']))
    return {'tpq': m.ticks_per_beat, 'tempos': tempos, 'notes': notes, 'pedal': pedal, 'soft': soft, 'dangling': len(open_)}

files = {
  'gourlin': '../midi/gourlin_trachtman.mid',
  'phillipsL': '../midi/phillips_LW.mid',
  'phillipsR': '../midi/phillips_RW.mid',
  'chaseEmR': '/Users/nielspfeffer/Downloads/Noten/_Kodierungen/MIDI/W225emR.mid',
}
out = {k: events(p) for k, p in files.items()}
json.dump(out, open('midi_events.json', 'w'))
for k, e in out.items():
    ons = [p for p in e['pedal'] if p['value'] >= 64]; offs = [p for p in e['pedal'] if p['value'] < 64]
    vals = sorted(set(p['value'] for p in e['pedal']))
    print(k, 'tpq', e['tpq'], 'tempos', e['tempos'][:3], len(e['tempos']), 'notes', len(e['notes']), 'restruck-while-open', sum(1 for n in e['notes'] if n.get('restruck')),
          'pedal on/off', len(ons), len(offs), 'pedal values', vals[:6], 'soft', e['soft'][:3], 'dangling', e['dangling'],
          'pitch range', min(n['pitch'] for n in e['notes']), max(n['pitch'] for n in e['notes']),
          'vel range', min(n['vel'] for n in e['notes']), max(n['vel'] for n in e['notes']))
