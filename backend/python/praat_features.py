# praat_features.py
import numpy as np
import parselmouth
from parselmouth.praat import call


def extract_praat_features(audio_path):
    snd = parselmouth.Sound(audio_path)

    # =======================
    # Pitch
    # =======================
    pitch = call(snd, "To Pitch", 0.0, 75, 600)
    pitch_values = pitch.selected_array['frequency']
    pitch_values_voiced = pitch_values[pitch_values > 0]

    pitch_mean = float(np.mean(pitch_values_voiced)) if len(pitch_values_voiced) else 0.0
    pitch_std = float(np.std(pitch_values_voiced)) if len(pitch_values_voiced) else 0.0
    pitch_min = float(np.min(pitch_values_voiced)) if len(pitch_values_voiced) else 0.0
    pitch_max = float(np.max(pitch_values_voiced)) if len(pitch_values_voiced) else 0.0
    pitch_median = float(np.median(pitch_values_voiced)) if len(pitch_values_voiced) else 0.0

    # =======================
    # Point Process
    # =======================
    point_process = call(snd, "To PointProcess (periodic, cc)", 75, 600)

    # =======================
    # Jitter
    # =======================
    jitter_local = float(call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3))
    jitter_local_abs = float(call(point_process, "Get jitter (local, absolute)", 0, 0, 0.0001, 0.02, 1.3))
    jitter_rap = float(call(point_process, "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3))
    jitter_ppq5 = float(call(point_process, "Get jitter (ppq5)", 0, 0, 0.0001, 0.02, 1.3))
    jitter_ddp = float(call(point_process, "Get jitter (ddp)", 0, 0, 0.0001, 0.02, 1.3))

    # =======================
    # Shimmer
    # =======================
    shimmer_local = float(call([snd, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6))
    shimmer_local_db = float(call([snd, point_process], "Get shimmer (local_dB)", 0, 0, 0.0001, 0.02, 1.3, 1.6))
    shimmer_apq3 = float(call([snd, point_process], "Get shimmer (apq3)", 0, 0, 0.0001, 0.02, 1.3, 1.6))
    shimmer_apq5 = float(call([snd, point_process], "Get shimmer (apq5)", 0, 0, 0.0001, 0.02, 1.3, 1.6))
    shimmer_apq11 = float(call([snd, point_process], "Get shimmer (apq11)", 0, 0, 0.0001, 0.02, 1.3, 1.6))
    shimmer_dda = float(call([snd, point_process], "Get shimmer (dda)", 0, 0, 0.0001, 0.02, 1.3, 1.6))

    # =======================
    # Periodicity
    # =======================
    pulses = int(call(point_process, "Get number of points"))
    periods = pulses - 1 if pulses > 1 else 0

    duration = snd.get_total_duration()
    mean_period = float(duration / pulses) if pulses > 0 else 0.0

    if pulses > 2:
        times = [
            call(point_process, "Get time from index", i + 1)
            for i in range(pulses)
        ]
        period_std = float(np.std(np.diff(times)))
    else:
        period_std = 0.0

    # =======================
    # Voicing (manual & robust)
    # =======================
    pitch_full = pitch.selected_array['frequency']
    total_frames = len(pitch_full)

    if total_frames > 0:
        unvoiced_frames = int(np.sum(pitch_full == 0))
        frac_unvoiced = float(unvoiced_frames / total_frames)
    else:
        frac_unvoiced = 0.0

    voice_breaks = 0
    for i in range(1, total_frames):
        if pitch_full[i - 1] > 0 and pitch_full[i] == 0:
            voice_breaks += 1

    degree_voice_breaks = float(voice_breaks / total_frames) if total_frames > 0 else 0.0

    # =======================
    # Final feature dict
    # =======================
    return {
        "jitter_local": jitter_local,
        "jitter_local_abs": jitter_local_abs,
        "jitter_rap": jitter_rap,
        "jitter_ppq5": jitter_ppq5,
        "jitter_ddp": jitter_ddp,

        "shimmer_local": shimmer_local,
        "shimmer_local_db": shimmer_local_db,
        "shimmer_apq3": shimmer_apq3,
        "shimmer_apq5": shimmer_apq5,
        "shimmer_apq11": shimmer_apq11,
        "shimmer_dda": shimmer_dda,

        "pitch_median": pitch_median,
        "pitch_mean": pitch_mean,
        "pitch_std": pitch_std,
        "pitch_min": pitch_min,
        "pitch_max": pitch_max,

        "pulses": pulses,
        "periods": periods,
        "mean_period": mean_period,
        "period_std": period_std,

        "frac_unvoiced": frac_unvoiced,
        "voice_breaks": float(voice_breaks),
        "degree_voice_breaks": degree_voice_breaks
    }