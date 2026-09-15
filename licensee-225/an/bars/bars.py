import json, xml.etree.ElementTree as ET
import numpy as np

MEI = '/Users/nielspfeffer/Downloads/Noten/_Kodierungen/MEI/Schumann-Kinderszenen-No.7_Op.15-Dreaming_Trumerei.mei'
NS = '{http://www.music-encoding.org/ns/mei}'
XMLID = '{http://www.w3.org/XML/1998/namespace}id'
STEP = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
ALTER = {'f': -1, 's': 1, 'n': 0, 'ff': -2, 'ss': 2, 'x': 2}

def quarters(el):
    dur = el.get('dur')
    if dur is None: return 0.0
    q = 4.0 / float(dur)
    return q * (1.5 if el.get('dots') == '1' else 1.75 if el.get('dots') == '2' else 1.0)

def midi_pitch(note):
    accid = note.get('accid') or note.get('accid.ges')
    child = note.find(NS + 'accid')
    if child is not None: accid = child.get('accid') or child.get('accid.ges') or accid
    return 12 * (int(note.get('oct')) + 1) + STEP[note.get('pname')] + ALTER.get(accid, 0)

root = ET.parse(MEI).getroot()
continuations = {t.get('endid', '').lstrip('#') for t in root.iter(NS + 'tie')}
measures = list(root.iter(NS + 'measure'))

def notes_of_measure(measure):
    """Attacked notes with their onset in quarters from the start of the measure."""
    out = []
    def walk(el, t, grace=False):
        tag = el.tag[len(NS):]
        if tag in ('note', 'chord'):
            members = [el] if tag == 'note' else list(el.iter(NS + 'note'))
            is_grace = grace or el.get('grace') is not None
            for n in members:
                if n.get(XMLID) not in continuations:
                    out.append({'pitch': midi_pitch(n), 'onset': t, 'grace': is_grace})
            return t if is_grace else t + quarters(el)
        if tag in ('rest', 'space', 'mRest'):
            return t + quarters(el)
        if tag in ('beam', 'tuplet', 'graceGrp'):
            for child in el: t = walk(child, t, grace or tag == 'graceGrp')
            return t
        return t
    for layer in measure.iter(NS + 'layer'):
        t = 0.0
        for child in layer: t = walk(child, t)
    return out

by_n = {int(m.get('n')): m for m in measures}
label = lambda n, repeat: 'Auftakt' if n == 1 else f"{n - 1}{'′' if repeat else ''}"
played = [(1, False)] + [(n, False) for n in range(2, 10)] + [(n, True) for n in range(2, 10)] + [(n, False) for n in range(10, 26)]

score, clock = [], 0.0
for k, (n, repeat) in enumerate(played):
    m = by_n[n]
    notes = notes_of_measure(m)
    length = 1.0 if n in (1,) else 4.0
    for x in notes: score.append({**x, 'bar': k, 'time': clock + x['onset']})
    played[k] = (n, repeat, clock)
    clock += length

V = json.load(open('../versions.json'))
roll = [{'pitch': s['pitch'], 'from': s['from'], 'to': s['to']} for s in V['snapshots']['C'] if s['type'] == 'note']

def chord_order(items, key, gap):
    items = sorted(items, key=key); groups = []
    for it in items:
        if groups and key(it) - key(groups[-1][-1]) <= gap: groups[-1].append(it)
        else: groups.append([it])
    return [x for g in groups for x in sorted(g, key=lambda n: n['pitch'])]

def needleman_wunsch(a, b, band):
    n, m = len(a), len(b); gap = -1.0
    S = np.full((n + 1, m + 1), -1e9); T = np.zeros((n + 1, m + 1), np.int8)
    S[:, 0] = gap * np.arange(n + 1); S[0, :] = gap * np.arange(m + 1); T[1:, 0] = 1; T[0, 1:] = 2
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if abs(i / n - j / m) > band: continue
            ok = a[i - 1]['pitch'] == b[j - 1]['pitch']
            S[i, j], T[i, j] = max((S[i - 1, j - 1] + (3.0 if ok else -2.0), 0), (S[i - 1, j] + gap, 1), (S[i, j - 1] + gap, 2))
    pairs, i, j = [], n, m
    while i > 0 and j > 0:
        t = T[i, j]
        if t == 0:
            if a[i - 1]['pitch'] == b[j - 1]['pitch']: pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif t == 1: i -= 1
        else: j -= 1
    return pairs[::-1]

a = chord_order(score, key=lambda x: x['time'], gap=0.01)
b = chord_order(roll, key=lambda r: r['from'], gap=6.0)
pairs = needleman_wunsch(a, b, band=0.15)
print('score notes played', len(score), 'roll notes', len(roll), 'aligned', len(pairs))

times = sorted({a[i]['time'] for i, _ in pairs})
anchor_mm = {t: float(np.median([b[j]['from'] for i, j in pairs if a[i]['time'] == t])) for t in times}
ts = np.array(times); ms = np.maximum.accumulate(np.array([anchor_mm[t] for t in times]))

rows = []
for k, (n, repeat, start) in enumerate(played):
    beat1 = [b[j]['from'] for i, j in pairs if a[i]['time'] == start and not a[i]['grace']]
    if beat1 and abs(min(beat1) - np.median(beat1)) < 60:
        mm, how = min(beat1), f'beat 1, {len(beat1)} note(s)'
    else:
        mm, how = float(np.interp(start, ts, ms)), 'interpolated'
    rows.append({'label': label(n, repeat), 'mei_measure': n, 'from_mm': round(mm, 1), 'how': how})

json.dump([{'label': r['label'], 'from_mm': r['from_mm']} for r in rows], open('bars.json', 'w'), ensure_ascii=False, indent=1)
with open('bars.txt', 'w') as f:
    f.write('bar       MEI n   from mm   how\n')
    for r in rows: f.write(f"{r['label']:9} {r['mei_measure']:5} {r['from_mm']:9.1f}   {r['how']}\n")
print(open('bars.txt').read())

bar_at = lambda x: max((r for r in rows if r['from_mm'] <= x), key=lambda r: r['from_mm'], default=rows[0])['label']
for what, x in [('c′ ending 2356.9, onset', 2247.9), ('c′ end', 2356.9), ('c♯′′ 6598', 6598.1), ('pedal 6716', 6716.1), ('pedal 6826', 6826.6), ('pedal 6879', 6879.0), ('g 6470', 6470.4), ('pedal release 5370.9', 5370.9), ('D1 c′ 5242', 5242.4), ('D1 c 8871', 8871.5)]:
    print(f'{what:24} -> bar {bar_at(x)}')
unmatched_score = [a[i] for i in range(len(a)) if i not in {p for p, _ in pairs}]
unmatched_roll = [b[j] for j in range(len(b)) if j not in {q for _, q in pairs}]
print('unaligned score notes', [(label(played[x['bar']][0], played[x['bar']][1]), x['pitch'], x['onset']) for x in unmatched_score])
print('unaligned roll notes', [(r['pitch'], round(r['from'], 1)) for r in unmatched_roll])
