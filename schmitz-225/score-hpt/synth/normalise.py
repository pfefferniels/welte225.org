"""A rendering, mono, at the peak level of the recording it imitates."""
import sys

import numpy as np
import soundfile as sf

audio, sr = sf.read(sys.argv[1])
audio = audio.mean(axis=1) if audio.ndim > 1 else audio
reference, _ = sf.read(sys.argv[2])
sf.write(sys.argv[3], audio * np.abs(reference).max() / np.abs(audio).max(), sr, subtype='PCM_16')
