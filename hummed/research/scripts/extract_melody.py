"""Extract the melody of Träumerei (staff 1, layer 1, top note of chords) as Grünfeld plays it.

Reads the MEI for voice membership and slurs, the espressivo rendering of performance.mpm
for performed onsets/offsets/velocities, and the sustain-pedal stream for what the piano
keeps sounding after the key is released.
"""
import json, sys, re
from lxml import etree

DATA = sys.argv[1]      # dir with transcription.mei
RENDER = sys.argv[2]    # dir with performed.json, dynamics_curve.json
OUT = sys.argv[3]

ns = {'m': 'http://www.music-encoding.org/ns/mei'}
XMLID = '{http://www.w3.org/XML/1998/namespace}id'
tree = etree.parse(f'{DATA}/transcription.mei', etree.XMLParser(recover=True, huge_tree=True))

info = {}
for measure in tree.iterfind('.//m:measure', ns):
    mn = measure.get('n')
    for staff in measure.iterfind('m:staff', ns):
        for layer in staff.iterfind('m:layer', ns):
            for note in layer.iterfind('.//m:note', ns):
                grace = note.get('grace') is not None or any(
                    a.tag.endswith('graceGrp') for a in note.iterancestors())
                info[note.get(XMLID)] = dict(measure=mn, staff=staff.get('n'), layer=layer.get('n'),
                                             grace=grace)
slur_starts, slur_ends = set(), set()
for slur in tree.iterfind('.//m:slur', ns):
    if slur.get('startid'): slur_starts.add(slur.get('startid').lstrip('#'))
    if slur.get('endid'): slur_ends.add(slur.get('endid').lstrip('#'))
fermatas = set()
for f in tree.iterfind('.//m:fermata', ns):
    if f.get('startid'): fermatas.add(f.get('startid').lstrip('#'))

perf = json.load(open(f'{RENDER}/performed.json'))
notes = [n for p in perf['parts'] for n in p['notes']]
sustain = next(c for c in perf['parts'][0]['controlChanges'] if c.get('controller') == 'sustain')['points']
curve = json.load(open(f'{RENDER}/dynamics_curve.json'))

def base(i): return re.sub(r'-rend\d+$', '', i)

mel = []
for n in notes:
    b = base(n['id'])
    i = info.get(b)
    if i is None:
        print('no MEI info for', n['id']); continue
    if i['staff'] == '1' and i['layer'] == '1' and not i['grace']:
        mel.append(n)

# top note of chords: group by symbolic date
by_date = {}
for n in mel:
    by_date.setdefault(n['date'], []).append(n)
mel = [max(g, key=lambda n: n['pitch']) for d, g in sorted(by_date.items())]

def pedal_at(ms):
    v = 0
    for p in sustain:
        if p['milliseconds'] <= ms: v = p['value']
        else: break
    return v

def pedal_release_after(ms, thresh=40):
    for p in sustain:
        if p['milliseconds'] > ms and p['value'] < thresh: return p['milliseconds']
    return None

out = []
for k, n in enumerate(mel):
    b = base(n['id'])
    on, off = n['milliseconds']['date'], n['milliseconds']['end']
    nxt = mel[k + 1]['milliseconds']['date'] if k + 1 < len(mel) else None
    sounding = off
    if pedal_at(off) >= 40:
        rel = pedal_release_after(off)
        sounding = max(off, rel if rel is not None else off)
    if nxt is not None:
        sounding = min(sounding, nxt)
    out.append(dict(
        id=n['id'], pitch=n['pitch'], date=n['date'], duration=n['duration'],
        onset_ms=on, key_off_ms=off, sounding_off_ms=sounding, velocity=n['velocity'],
        measure=info[b]['measure'], rend2=n['id'] != b,
        slur_start=b in slur_starts, slur_end=b in slur_ends, fermata=b in fermatas,
        ornamented=n['ornamented']))

json.dump(dict(notes=out, dynamics_curve=curve,
               sustain=[[p['milliseconds'], p['value']] for p in sustain]),
          open(OUT, 'w'), indent=1)
print(len(out), 'melody notes')
for k, n in enumerate(out):
    nxt = out[k + 1]['onset_ms'] if k + 1 < len(out) else n['key_off_ms']
    print(f"{k:3d} m{n['measure']:>3}{'*' if n['rend2'] else ' '} {n['pitch']:3d} on {n['onset_ms']:9.1f} keyoff {n['key_off_ms']:9.1f} "
          f"snd {n['sounding_off_ms']:9.1f} ioi {nxt - n['onset_ms']:7.1f} vel {n['velocity']:5.1f} "
          f"{'S' if n['slur_start'] else ' '}{'E' if n['slur_end'] else ' '}{'F' if n['fermata'] else ' '}{'o' if n['ornamented'] else ' '}")
