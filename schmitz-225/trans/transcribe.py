import json
import sys
import librosa
from piano_transcription_inference import PianoTranscription, sample_rate

transcriptor = PianoTranscription(device='cpu')
for audio_path, out_path in zip(sys.argv[1::2], sys.argv[2::2]):
    audio, _ = librosa.load(audio_path, sr=sample_rate, mono=True)
    result = transcriptor.transcribe(audio, out_path.replace('.json', '.mid'))
    json.dump({'notes': [{k: float(v) for k, v in note.items()} for note in result['est_note_events']],
               'pedals': [{k: float(v) for k, v in pedal.items()} for pedal in result['est_pedal_events']]}, open(out_path, 'w'))
    print(audio_path, 'notes', len(result['est_note_events']), flush=True)
