"""Sinsy (HMM-based statistical singing synthesis, Nagoya Institute of Technology) with the
NIT SONG070 F001 voice (CC BY 3.0): the pre-neural state of the art, for comparison.

Sinsy reads MusicXML, so Grünfeld's timing is written as a score at 60 bpm with 1000 divisions
per quarter: one division is one millisecond. Every phrase opens on む and continues on う (ん is nearly silent with this voice); gaps (the breaths of
the shared voice model) are rests. Notes crossing a 4/4 barline are tied.
"""
import sys, os
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voicemodel as vm

PAD = 0.6
DIV = 1000           # per quarter; at 60 bpm one division = 1 ms
BAR = 4 * DIV
STEP = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B']
ALTER = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]


def events(notes, mode):
    """(kind, pitch, duration in ms) from time 0, with the 0.6 s lead-in as a rest."""
    ev = []
    t = 0
    def push(kind, pitch, end_ms):
        nonlocal t
        d = int(round(end_ms)) - t
        if d > 0:
            ev.append((kind, pitch, d))
            t += d
    for k, n in enumerate(notes):
        push('rest', None, (n.on + PAD) * 1000)
        # ん comes out nearly silent from this voice (a weak nasal in Japanese speech), so this
        # version is a 'moo' vocalise: む opens each phrase with the closed-lip [m], う follows
        push('む' if n.breath_before else 'う', n.pitch, (n.off + PAD) * 1000)
    push('rest', None, t + 1000)
    return ev


def musicxml(ev):
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<score-partwise version="3.0"><part-list><score-part id="P1"><part-name>Voice</part-name>'
           '</score-part></part-list><part id="P1">']
    pos = 0
    measure = 1
    out.append(f'<measure number="{measure}"><attributes><divisions>{DIV}</divisions><key><fifths>-1</fifths></key>'
               f'<time><beats>4</beats><beat-type>4</beat-type></time></attributes>'
               f'<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>'
               f'<per-minute>60</per-minute></metronome></direction-type><sound tempo="60"/></direction>')
    for kind, pitch, dur in ev:
        first = True
        while dur > 0:
            room = BAR - pos % BAR
            d = min(dur, room)
            dur -= d
            tie_start = dur > 0
            tie_stop = not first
            if kind == 'rest':  # kind is 'rest' or the syllable
                out.append(f'<note><rest/><duration>{d}</duration></note>')
            else:
                p = int(round(pitch))
                ties = (('<tie type="stop"/>' if tie_stop else '') + ('<tie type="start"/>' if tie_start else ''))
                tied = (('<tied type="stop"/>' if tie_stop else '') + ('<tied type="start"/>' if tie_start else ''))
                lyric = f'<lyric><syllabic>single</syllabic><text>{kind}</text></lyric>' if first else ''
                alter = f'<alter>{ALTER[p % 12]}</alter>' if ALTER[p % 12] else ''
                out.append(f'<note><pitch><step>{STEP[p % 12]}</step>{alter}<octave>{p // 12 - 1}</octave></pitch>'
                           f'<duration>{d}</duration>{ties}<voice>1</voice>'
                           f'{"<notations>" + tied + "</notations>" if tied else ""}{lyric}</note>')
            first = False
            pos += d
            if pos % BAR == 0:
                measure += 1
                out.append(f'</measure><measure number="{measure}">')
    if pos % BAR:
        out.append(f'<note><rest/><duration>{BAR - pos % BAR}</duration></note>')
    out.append('</measure></part></score-partwise>')
    return ''.join(out)


def render(out, transpose=0, mode='gruenfeld'):
    import pysinsy
    mel = vm.load_melody('melody.json')
    notes = vm.build_notes(mel, mode=mode, transpose=transpose)
    xml = musicxml(events(notes, mode))
    path = os.path.abspath('sinsy_score.xml')
    open(path, 'w', encoding='utf-8').write(xml)
    s = pysinsy.Sinsy()
    assert s.setLanguages('j', pysinsy.get_default_dic_dir())
    assert s.loadVoices(pysinsy.get_default_htsvoice())
    assert s.loadScoreFromMusicXML(path)
    wav, sr = s.synthesize()
    s.clearScore()
    wav = np.asarray(wav, dtype=float)
    sf.write(out, (wav / (np.abs(wav).max() + 1e-9) * 0.9).astype(np.float32), sr)
    print('sinsy', len(wav) / sr, 's at', sr)


if __name__ == '__main__':
    render(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0)
