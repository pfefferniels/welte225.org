import json
import librosa
from piano_transcription_inference import PianoTranscription, sample_rate

audio, _ = librosa.load('yt/rec.wav', sr=sample_rate, mono=True)
transcriptor = PianoTranscription(device='cpu')
result = transcriptor.transcribe(audio, 'trans/kong.mid')
json.dump({
    'notes': [{k: float(v) for k, v in note.items()} for note in result['est_note_events']],
    'pedals': [{k: float(v) for k, v in pedal.items()} for pedal in result['est_pedal_events']],
}, open('trans/kong.json', 'w'))
print('notes', len(result['est_note_events']))
