"""What the pianist hums: a draft reduction of Träumerei for a bass hummer (about an octave, mostly
F2-G3), written as its own MEI, every sung note pointing (@corresp) to the note of the
transcription it comes from, so the performance (MPM) reaches it.

The draft is a list of choices, read from the score and from Grünfeld's playing: which voice to
follow from where (with an octave shift where the range needs it), sung pedal notes where the
harmony allows, rests to breathe, and a voiceless stream of air in a few places. Where the voice
changes without a rest, the end of the note before is cut for a breath of about 0.45 s at
Grünfeld's tempo there (an amateur's quick breath).

It drafted reduction.mei once; the MEI is the reduction now, edited by hand (the page reads it).
Running this again overwrites those edits.

usage: draft.py <transcription.mei> <performed.json> <out.mei>
  transcription.mei: the site's /mpm/transcription.mei
  performed.json: the performance as notes in ms (research/scripts/render.mjs)
"""
import json, sys
from lxml import etree

MEI = 'http://www.music-encoding.org/ns/mei'
XML = 'http://www.w3.org/XML/1998/namespace'
ns = {'m': MEI}
XID = '{%s}id' % XML
LO, HI = 40, 57            # E2-A3: what an amateur bass hums (mostly F2-G3)
Q, BAR = 720, 2880

# ---------------------------------------------------------------- the draft
# (bar, beat, what, ...) in performance order; each choice lasts until the next one.
#   take   <layer> <semitones> [top|bottom]  sing that voice's notes (chords: top note by default)
#   pedal  <layer> <semitones>               hold the note that voice has there
#   rest                                      silence: a breath
#   air    teeth|lips                         a voiceless stream of air (s, or f)
DRAFT = [
    # A: the opening motif in the low octave, then the tenor's answer, the bass walk
    ('0', 1, 'take', '1.1', -12),               # C3 | F3 . . E3 F3 A3
    ('2', 1, 'rest'),                           # breathe while the melody climbs to F5
    ('2', 2, 'take', '2.1', -12),               # the tenor answers: D3 . C3 Bb2 | A2 Bb2 A2 G2 F2 G2
    ('4', 1, 'take', '2.1', -12),               # A2
    ('4', 2, 'take', '2.2', 0),                 # the bass walk Grünfeld leans on: C3 D3 C3 Bb2 G2 A2
    ('5', 1, 'pedal', '2.2', 0),                # F2 held under the restarting melody
    ('6', 1, 'rest'),
    ('6', 2, 'pedal', '2.2', 0),                # A3
    ('7', 1, 'take', '2.1', 0, 'bottom'),       # the tenor rises: D3 F3 G3 A3
    ('8', 1, 'take', '2.2', 0, 'bottom'),       # G3 C3 D3 Bb2 G2
    # A again: this time the melody itself, two octaves down
    ("1'", 1, 'take', '1.1', -24),              # F2 . . E2 F2 A2 | C3 F3 . E3 D3 | C3 F3 G2 A2 Bb2 D3 F2
    ("3'", 4.5, 'rest'),
    ("4'", 1, 'take', '2.2', 0),                # F3 C3 D3 C3 Bb2 G2 A2
    ("5'", 1, 'pedal', '2.2', 0),               # F2
    ("6'", 1, 'rest'),                          # silent under the climb to A5: the voice listens
    ("7'", 1, 'take', '2.1', 0, 'bottom'),      # D3 F3 G3 A3
    ("8'", 1, 'take', '2.2', 0, 'bottom'),      # G3 C3 D3 Bb2 G2
    # B: the left hand, which Grünfeld plays loudest here
    ('9', 1, 'pedal', '2.2', 0),                # F2
    ('9', 3, 'rest'),
    ('9', 3.5, 'take', '1.1', -12),             # the melody, mf: E3 F3 A3
    ('10', 1, 'rest'),
    ('10', 1.5, 'take', '2.1', 0),              # C3 D3 . F#3 | G3 F#3 G3 Eb3 | D3 D3 G3
    ('12', 2.5, 'air', 'teeth'),                # the quiet turn: a short breath out through the teeth
    ('12', 3.5, 'rest'),
    ('12', 4, 'take', '2.2', 0),                # G2 A2
    ('13', 1, 'pedal', '2.1', 12),              # Bb2, over Grünfeld's low Bb1
    ('14', 1, 'rest'),
    ('14', 2, 'pedal', '2.1', -12),             # A2 under the climax (Bb5), the dominant of D minor
    ('15', 1, 'take', '2.1', -12, 'top'),       # D3 C#3 D3
    ('15', 4.5, 'rest'),
    ('16', 1, 'take', '2.1', -12),              # ritard.: A2 . . Bb2 C3 C3
    # A once more, and the close
    ('17', 1, 'pedal', '2.2', 0),               # F2
    ('18', 1, 'rest'),
    ('18', 2, 'take', '2.1', -12),              # D3 . C3 Bb2 | A2 Bb2 A2 G2 F2
    ('19', 4.5, 'rest'),
    ('20', 1, 'take', '2.2', 0),                # F3 C3 D3 C3 Bb2 G2 A2
    ('21', 1, 'pedal', '2.2', 0),               # F2
    ('22', 1, 'rest'),                          # silent through the fermata
    ('23', 1, 'take', '2.2', -12),              # C3 Bb2 A2 G2
    ('23', 4, 'take', '2.1', 0, 'bottom'),      # Bb2 D3
    ('24', 1, 'take', '2.1', 0, 'bottom'),      # G3 C3
    ('24', 3, 'pedal', '2.2', 0),               # F2, the last note
    ('24', 4, 'air', 'lips'),                   # and out, through lips and teeth, as the chord fades
    ('end',),
]

# ---------------------------------------------------------------- the score
PC = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
ACC = {'s': 1, 'f': -1, 'ss': 2, 'ff': -2, 'n': 0, '': 0}


def bar_start(label):
    if label == '0':
        return 0
    rend = label.endswith("'"); b = int(label.rstrip("'"))
    return Q + BAR * ((b - 1) + (8 if rend else 0) + (8 if (not rend and b >= 9) else 0))


def tick(label, beat):
    return bar_start(label) + round((beat - 1) * Q)


def load(mei_path, perf_path):
    t = etree.parse(mei_path, etree.XMLParser(recover=True, huge_tree=True))
    pn = {n['id']: n for p in json.load(open(perf_path))['parts'] for n in p['notes']}
    notes, measures = [], []
    for meas in t.iterfind('.//m:measure', ns):
        bar = int(meas.get('n')) - 1
        label = f"{bar}{chr(39) if '-rend2' in (meas.get(XID) or '') else ''}"
        measures.append((label, meas.get(XID)))
        key_acc = {}
        for st in meas.iterfind('m:staff', ns):
            for ly in st.iterfind('m:layer', ns):
                for n in ly.iterfind('.//m:note', ns):
                    p = pn.get(n.get(XID))
                    if not p:
                        continue
                    acc = n.get('accid') or n.get('accid.ges') or ''
                    if not acc:
                        for a in n.iterfind('m:accid', ns):
                            acc = a.get('accid') or a.get('accid.ges') or ''
                    notes.append(dict(id=n.get(XID), layer=f"{st.get('n')}.{ly.get('n')}", date=p['date'], dur=p['duration'],
                                      pitch=p['pitch'], pname=n.get('pname'), oct=int(n.get('oct')), accid=acc,
                                      ms=p['milliseconds']['date'], bar=label))
    return notes, measures, pn


def fold(p):
    while p < LO: p += 12
    while p > HI: p -= 12
    return p


def build(notes, pn):
    """the draft -> a list of events (start, end in ticks): notes, rests, air"""
    ms_at = sorted({(n['date'], n['ms']) for n in notes})
    def ms_per_tick(t):                                 # Grünfeld's local tempo at x1
        before = [x for x in ms_at if x[0] <= t][-6:] or ms_at[:2]
        after = [x for x in ms_at if x[0] > t][:6] or ms_at[-2:]
        a, b = before[0], after[-1]
        return (b[1] - a[1]) / max(1, b[0] - a[0])
    choices = [(c[0], c[1], c[2], c[3:]) if c[0] != 'end' else None for c in DRAFT]
    end_tick = max(n['date'] + n['dur'] for n in notes)
    events = []
    for k, c in enumerate(choices[:-1]):
        label, beat, what, args = c
        a = tick(label, beat)
        b = tick(choices[k + 1][0], choices[k + 1][1]) if choices[k + 1] else end_tick
        if what == 'rest':
            events.append(dict(kind='rest', start=a, end=b, breath=True)); continue
        if what == 'air':
            events.append(dict(kind='air', start=a, end=b, through=args[0])); continue
        layer, semis = args[0], int(args[1])
        pick = args[2] if len(args) > 2 else 'top'
        cands = [n for n in notes if n['layer'] == layer and a <= n['date'] < b]
        if what == 'pedal':                             # the voice's note at (or sounding at) a, held to b
            here = [n for n in notes if n['layer'] == layer and n['date'] <= a < n['date'] + n['dur']] or cands[:1]
            src = (max if pick == 'top' else min)(here, key=lambda n: n['pitch'])
            events.append(dict(kind='note', type='pedal', src=src, start=max(a, src['date']), end=b, semis=semis, layer=layer))
            continue
        by = {}
        for n in cands: by.setdefault(n['date'], []).append(n)
        dates = sorted(by)
        for i, d in enumerate(dates):
            src = (max if pick == 'top' else min)(by[d], key=lambda n: n['pitch'])
            e = min(b, d + src['dur'], dates[i + 1] if i + 1 < len(dates) else b)
            events.append(dict(kind='note', type='take', src=src, start=d, end=e, semis=semis, layer=layer))
    for e in events:
        if e['kind'] == 'note':
            e['pitch'] = fold(e['src']['pitch'] + e['semis'])
            e['octave'] = (e['pitch'] - e['src']['pitch']) // 12
    def breath_cut(p, seconds=0.45):                  # a breath of ~0.45 s at the tempo there, in note values
        want = seconds * 1000 / ms_per_tick(p['end'])
        cut = max([g for g in (180, 360, 720) if g <= max(180, want)])   # a 16th at least
        return min(cut, (p['end'] - p['start']) // 2 // 180 * 180)
    # a breath where the voice changes without a rest: cut the end of the note before
    out = [events[0]]
    for e in events[1:]:
        p = out[-1]
        if p['kind'] == 'note' and e['kind'] == 'note' and (p['layer'], p['semis']) != (e['layer'], e['semis']):
            cut = breath_cut(p)
            if cut >= 180:
                p['end'] -= cut
                out.append(dict(kind='rest', start=p['end'], end=p['end'] + cut, breath=True))
        out.append(e)
    events = out
    # an amateur cannot hum for more than ~8 s: breathe at the longest note of a longer stretch
    while True:
        run, start, worst = 0.0, 0, None
        for i, e in enumerate(events):
            if e['kind'] == 'note':
                run += (e['end'] - e['start']) * ms_per_tick(e['start']) / 1000
                if run > 8.0:
                    worst = (start, i); break
            else:
                if (e['kind'] == 'rest' and e['breath']) or e['kind'] == 'air':
                    run, start = 0.0, i + 1
        if not worst:
            break
        stretch = [j for j in range(worst[0], worst[1]) if events[j]['kind'] == 'note']
        j = max(stretch, key=lambda j: (events[j]['end'] - events[j]['start']) * ms_per_tick(events[j]['start']))
        p = events[j]; cut = breath_cut(p, 0.5)
        if cut < 180:
            break
        p['end'] -= cut
        events.insert(j + 1, dict(kind='rest', start=p['end'], end=p['end'] + cut, breath=True))
    # fill silent gaps (detached notes) with plain rests
    out = []
    for e in events:
        if out and e['start'] > out[-1]['end']:
            out.append(dict(kind='rest', start=out[-1]['end'], end=e['start'], breath=False))
        out.append(e)
    return out, ms_per_tick


# ---------------------------------------------------------------- MEI
DURS = [(2880, '1', 0), (2160, '2', 1), (1440, '2', 0), (1080, '4', 1), (720, '4', 0), (540, '8', 1), (360, '8', 0),
        (270, '16', 1), (180, '16', 0), (90, '32', 0)]


def pieces(a, b):
    """split a span into note values that fit the bars and the beat"""
    out = []
    while a < b:
        bar_end = bar_start_of(a) + (Q if a < Q else BAR)
        lim = min(b, bar_end)
        for t, d, dots in DURS:
            if a + t <= lim and ((a - bar_start_of(a)) % min(t, Q) == 0 or t < Q):
                out.append((a, t, d, dots)); a += t; break
        else:
            out.append((a, lim - a, '32', 0)); a = lim
    return out


def bar_start_of(t):
    return 0 if t < Q else Q + (t - Q) // BAR * BAR


def write_mei(events, measures, path, transcription='transcription.mei'):
    root = etree.Element('{%s}mei' % MEI, nsmap={None: MEI}, meiversion='5.1'); root.set(XID, 'hum')
    head = etree.SubElement(root, '{%s}meiHead' % MEI)
    fd = etree.SubElement(head, '{%s}fileDesc' % MEI)
    ts = etree.SubElement(fd, '{%s}titleStmt' % MEI)
    etree.SubElement(ts, '{%s}title' % MEI).text = 'Träumerei (Schumann), as Grünfeld might hum it while playing: a bass reduction'
    ps = etree.SubElement(fd, '{%s}pubStmt' % MEI)
    etree.SubElement(ps, '{%s}p' % MEI).text = ('A draft reduction for an amateur bass hummer (about an octave). Every sung note points '
        f'(@corresp) to the note of {transcription} it comes from; rests are breaths; notes with x heads are a voiceless '
        'stream of air (@type: air-teeth, air-lips); @type="pedal" marks a note held on while the piano moves.')
    srd = etree.SubElement(fd, '{%s}sourceDesc' % MEI)
    src = etree.SubElement(srd, '{%s}source' % MEI); src.set('target', transcription)
    music = etree.SubElement(root, '{%s}music' % MEI); body = etree.SubElement(music, '{%s}body' % MEI)
    mdiv = etree.SubElement(body, '{%s}mdiv' % MEI); score = etree.SubElement(mdiv, '{%s}score' % MEI)
    sd = etree.SubElement(score, '{%s}scoreDef' % MEI, {'meter.count': '4', 'meter.unit': '4', 'keysig': '1f'})
    sg = etree.SubElement(sd, '{%s}staffGrp' % MEI)
    etree.SubElement(sg, '{%s}staffDef' % MEI, {'n': '1', 'lines': '5', 'clef.shape': 'F', 'clef.line': '4', 'label': 'hummed'})
    section = etree.SubElement(score, '{%s}section' % MEI)
    layers = {}
    for label, mid in measures:
        a = bar_start(label)
        m = etree.SubElement(section, '{%s}measure' % MEI, {'n': str(int(label.rstrip("'")) + 1), 'label': label,
                                                             'corresp': f'{transcription}#{mid}'})
        if label == '0': m.set('metcon', 'false')
        m.set(XID, 'm' + label.replace("'", 'r'))
        st = etree.SubElement(m, '{%s}staff' % MEI, n='1'); ly = etree.SubElement(st, '{%s}layer' % MEI, n='1')
        layers[a] = (m, ly)
    count = 0
    for e in events:
        ps_ = pieces(e['start'], e['end'])
        for j, (a, t, d, dots) in enumerate(ps_):
            m, ly = layers[bar_start_of(a)]
            if e['kind'] == 'rest':
                r = etree.SubElement(ly, '{%s}rest' % MEI, dur=d)
                if dots: r.set('dots', str(dots))
                if e['breath'] and j == 0:
                    r.set('type', 'breath')
                    b = etree.SubElement(m, '{%s}breath' % MEI, staff='1', tstamp=f"{(a - bar_start_of(a)) / Q + 1:g}")
                continue
            n = etree.SubElement(ly, '{%s}note' % MEI, dur=d)
            if dots: n.set('dots', str(dots))
            count += 1; n.set(XID, f'h{count}')
            if e['kind'] == 'air':
                n.set('pname', 'd'); n.set('oct', '3'); n.set('head.shape', 'x'); n.set('type', 'air-' + e['through'])
                n.set('stem.visible', 'false')
            else:
                s = e['src']
                n.set('pname', s['pname']); n.set('oct', str(s['oct'] + e['octave']))
                if s['accid'] in ('s', 'n') or (s['accid'] == 'f' and s['pname'] != 'b'):
                    n.set('accid', s['accid'])
                elif s['accid'] == 'f':
                    n.set('accid.ges', 'f')
                if j == 0: n.set('corresp', f"{transcription}#{s['id']}")
                if e['type'] == 'pedal': n.set('type', 'pedal')
            if len(ps_) > 1:
                n.set('tie', 'i' if j == 0 else ('t' if j == len(ps_) - 1 else 'm'))
    etree.ElementTree(root).write(path, xml_declaration=True, encoding='UTF-8', pretty_print=True)


if __name__ == '__main__':
    notes, measures, pn = load(sys.argv[1], sys.argv[2])
    events, mpt = build(notes, pn)
    write_mei(events, measures, sys.argv[3])
    sung = [e for e in events if e['kind'] == 'note']
    NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    print(len(sung), 'sung notes,', sum(e['kind'] == 'rest' and e['breath'] for e in events), 'breaths,',
          sum(e['kind'] == 'air' for e in events), 'air; range',
          min(e['pitch'] for e in sung), '-', max(e['pitch'] for e in sung))
    # the longest stretch without a breath, in seconds at x1
    run, longest, where = 0.0, 0.0, None
    for e in events:
        if e['kind'] == 'note':
            run += (e['end'] - e['start']) * mpt(e['start']) / 1000
            if run > longest: longest, where = run, e['src']['bar']
        elif e['kind'] == 'rest' and e['breath'] or e['kind'] == 'air':
            run = 0.0
    print(f'longest stretch without a breath: {longest:.1f} s (ending in bar {where})')
