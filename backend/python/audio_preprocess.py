# audio_preprocess.py
import librosa
import numpy as np

def load_audio(audio_path, target_sr=16000):
    y, sr = librosa.load(audio_path, sr=target_sr)
    
    # Remove silence
    y, _ = librosa.effects.trim(y, top_db=20)

    return y, target_sr