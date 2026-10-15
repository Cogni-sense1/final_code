"""Acoustic feature extraction.

Features are read from the Praat "Voice report", the same source and units
(jitter/shimmer/unvoiced in percent, pitch in Hz, periods in seconds) as the
Sakar et al. 2013 training data, so training and inference stay aligned.
"""
from __future__ import annotations

import re

import numpy as np
import parselmouth
from parselmouth.praat import call

PITCH_FLOOR = 75.0
PITCH_CEILING = 600.0

# Voice report label -> feature name.
_REPORT_FIELDS = {
    "Median pitch": "pitch_median",
    "Mean pitch": "pitch_mean",
    "Standard deviation": "pitch_std",
    "Minimum pitch": "pitch_min",
    "Maximum pitch": "pitch_max",
    "Number of pulses": "pulses",
    "Number of periods": "periods",
    "Mean period": "mean_period",
    "Standard deviation of period": "period_std",
    "Fraction of locally unvoiced frames": "frac_unvoiced",
    "Number of voice breaks": "voice_breaks",
    "Degree of voice breaks": "degree_voice_breaks",
    "Jitter (local)": "jitter_local",
    "Jitter (local, absolute)": "jitter_local_abs",
    "Jitter (rap)": "jitter_rap",
    "Jitter (ppq5)": "jitter_ppq5",
    "Jitter (ddp)": "jitter_ddp",
    "Shimmer (local)": "shimmer_local",
    "Shimmer (local, dB)": "shimmer_local_db",
    "Shimmer (apq3)": "shimmer_apq3",
    "Shimmer (apq5)": "shimmer_apq5",
    "Shimmer (apq11)": "shimmer_apq11",
    "Shimmer (dda)": "shimmer_dda",
    "Mean autocorrelation": "ac",
    "Mean noise-to-harmonics ratio": "nth",
    "Mean harmonics-to-noise ratio": "htn",
}

_NUMBER = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")


def parse_voice_report(report: str) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for line in report.splitlines():
        label, sep, rest = line.strip().partition(":")
        name = _REPORT_FIELDS.get(label)
        if not sep or name is None or name in out:
            continue
        m = _NUMBER.search(rest)
        # Praat prints "--undefined--" when a measure cannot be computed.
        out[name] = None if (m is None or "undefined" in rest) else float(m.group(0))
    for name in _REPORT_FIELDS.values():
        out.setdefault(name, None)
    return out


def _pitch(snd: parselmouth.Sound):
    return call(snd, "To Pitch (cc)", 0.0, PITCH_FLOOR, 15, "no", 0.03, 0.45, 0.01, 0.35, 0.14, PITCH_CEILING)


def _trim_to_speech(snd: parselmouth.Sound) -> parselmouth.Sound:
    """Cut silence before the first and after the last voiced frame."""
    pitch = _pitch(snd)
    voiced = pitch.xs()[pitch.selected_array["frequency"] > 0]
    if voiced.size < 2 or voiced[-1] - voiced[0] < 0.5:
        return snd
    start = max(snd.xmin, float(voiced[0]) - 0.03)
    end = min(snd.xmax, float(voiced[-1]) + 0.03)
    return snd.extract_part(from_time=start, to_time=end, preserve_times=False)


def extract_features(wav_path: str) -> dict:
    """Return {"features": {...}, "quality": {...}} for a WAV file."""
    snd = parselmouth.Sound(wav_path)
    if snd.n_channels > 1:
        snd = snd.convert_to_mono()

    samples = snd.values[0]
    duration = float(snd.get_total_duration())
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    rms = float(np.sqrt(np.mean(samples**2))) if samples.size else 0.0
    clipped = float(np.mean(np.abs(samples) >= 0.99)) if samples.size else 0.0

    # Analyse from the first voiced moment to the last, so the pause before someone starts
    # speaking does not count as "unvoiced time" or change from one day to the next.
    speech = _trim_to_speech(snd)
    speech_seconds = float(speech.get_total_duration())
    snd = speech

    pitch = _pitch(snd)
    pulses = call([snd, pitch], "To PointProcess (cc)")
    report = call(
        [snd, pitch, pulses], "Voice report", 0.0, 0.0, PITCH_FLOOR, PITCH_CEILING, 1.3, 1.6, 0.03, 0.45
    )
    features = parse_voice_report(str(report))

    frac_unvoiced = features["frac_unvoiced"]
    voiced_seconds = speech_seconds * (1 - frac_unvoiced / 100) if frac_unvoiced is not None else 0.0

    problems: list[str] = []
    if duration < 2.0:
        problems.append("too_short")
    if voiced_seconds < 1.0:
        problems.append("not_enough_voice")
    if rms < 0.005:
        problems.append("too_quiet")
    if clipped > 0.01:
        problems.append("clipping")

    return {
        "features": features,
        "quality": {
            "duration_s": round(duration, 3),
            "speech_s": round(speech_seconds, 3),
            "voiced_s": round(voiced_seconds, 3),
            "rms": round(rms, 5),
            "peak": round(peak, 5),
            "clipped_fraction": round(clipped, 5),
            "sample_rate": int(snd.sampling_frequency),
            "problems": problems,
            "usable": not problems,
        },
    }
