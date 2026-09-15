import json
import sys
import librosa
from piano_transcription_inference import PianoTranscription, sample_rate

source, stem = sys.argv[1], sys.argv[2]
audio, _ = librosa.load(source, sr=sample_rate, mono=True)
result = PianoTranscription(device='cpu').transcribe(audio, f'{stem}.mid')
json.dump({
    'notes': [{k: float(v) for k, v in note.items()} for note in result['est_note_events']],
    'pedals': [{k: float(v) for k, v in pedal.items()} for pedal in result['est_pedal_events']],
}, open(f'{stem}.json', 'w'))
print('notes', len(result['est_note_events']))
