import json, sys
import librosa
from piano_transcription_inference import PianoTranscription, sample_rate
audio, _ = librosa.load(sys.argv[1], sr=sample_rate, mono=True)
result = PianoTranscription(device='cpu').transcribe(audio, sys.argv[2] + '.mid')
json.dump({'notes': [{k: float(v) for k, v in n.items()} for n in result['est_note_events']],
           'pedals': [{k: float(v) for k, v in p.items()} for p in result['est_pedal_events']]}, open(sys.argv[2] + '.json', 'w'))
print('notes', len(result['est_note_events']))
