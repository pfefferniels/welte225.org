"""Places Phillips's Licensee e-roll of 225 on the edition axis through the notes of his standard file, which is the same reading."""
import json, mido
import numpy as np

BASE = '/private/tmp/claude-501/-Users-nielspfeffer-Projects-measuring-early-records/b3fcaa9b-5098-45c5-9d78-739ba6a01268/scratchpad/'
SHIFT = 1274
OFFSET = 15
BAR = {1: ('MezzoforteOff', 'bass'), 2: ('MezzoforteOn', 'bass'), 3: ('SlowCrescendoOff', 'bass'), 4: ('SlowCrescendoOn', 'bass'),
       5: ('ForzandoOff', 'bass'), 6: ('ForzandoOn', 'bass'), 7: ('SoftPedalOff', 'bass'), 8: ('SoftPedalOn', 'bass'),
       89: ('Rewind', 'treble'), 90: ('ElectricCutOff', 'treble'), 91: ('SustainPedalOn', 'treble'), 92: ('SustainPedalOff', 'treble'),
       93: ('ForzandoOn', 'treble'), 94: ('ForzandoOff', 'treble'), 95: ('SlowCrescendoOn', 'treble'), 96: ('SlowCrescendoOff', 'treble'),
       97: ('MezzoforteOn', 'treble'), 98: ('MezzoforteOff', 'treble')}

def holes(path):
    midi = mido.MidiFile(path); t = 0; open_ = {}; out = []
    for msg in mido.merge_tracks(midi.tracks):
        t += msg.time
        if msg.type == 'note_on' and msg.velocity > 0: open_.setdefault(msg.note, []).append(t)
        elif msg.type in ('note_off', 'note_on') and open_.get(msg.note):
            out.append({'number': msg.note, 'on': open_[msg.note].pop(0), 'off': t})
    return sorted(out, key=lambda h: (h['on'], h['number']))

def paper_of(notes):
    """Tick of the standard file to edition mm, piecewise linear through every note's start and end."""
    anchors = sorted([(n['on'], n['x_on']) for n in notes] + [(n['off'], n['x_off']) for n in notes])
    ticks = np.array([a for a, _ in anchors], float); xs = np.maximum.accumulate(np.array([x for _, x in anchors]))
    head = np.polyfit(ticks[:20], xs[:20], 1); tail = np.polyfit(ticks[-20:], xs[-20:], 1)
    def at(tick):
        if tick < ticks[0]: return float(np.polyval(head, tick))
        if tick > ticks[-1]: return float(np.polyval(tail, tick))
        return float(np.interp(tick, ticks, xs))
    return at

def reading_of(hole):
    if 24 <= hole['number'] <= 103: return {'type': 'note', 'pitch': hole['number']}
    expression_type, scope = BAR[hole['number'] - OFFSET]
    return {'type': 'expression', 'expressionType': expression_type, 'scope': scope, 'track': hole['number'] - OFFSET}

placed_standard = json.load(open(BASE + 'an/placed_dp.json'))['phillipsL']['notes']
at = paper_of(placed_standard)
placed = [{**reading_of(h), 'from': at(h['on'] - SHIFT), 'to': at(h['off'] - SHIFT), 'tick': h['on']}
          for h in holes(BASE + 'eroll/Traumerei (Schumann) Grunfeld LW e.mid')]
json.dump(placed, open(BASE + 'eroll/placed.json', 'w'), indent=1)
print(len(placed), 'holes placed;', sum(p['type'] == 'expression' for p in placed), 'expression')
