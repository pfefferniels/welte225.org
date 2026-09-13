"""A transcription's MIDI file as the note list the alignment reads."""
import json
import sys

import mido


def notes_of(path: str) -> list[dict]:
    midi = mido.MidiFile(path)
    sounding, notes, now = {}, [], 0.0
    for message in midi:
        now += message.time
        if message.type == 'note_on' and message.velocity > 0:
            sounding.setdefault(message.note, []).append((now, message.velocity))
        elif message.type in ('note_off', 'note_on') and sounding.get(message.note):
            onset, velocity = sounding[message.note].pop(0)
            notes.append({'onset_time': onset, 'offset_time': now, 'midi_note': message.note, 'velocity': velocity})
    return sorted(notes, key=lambda note: note['onset_time'])


if __name__ == '__main__':
    notes = notes_of(sys.argv[1])
    json.dump({'notes': notes, 'pedals': []}, open(sys.argv[2], 'w'))
    print(len(notes), 'notes')
