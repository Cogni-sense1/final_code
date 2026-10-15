"""Train and honestly evaluate the voice screening model.

Run from the repo root:  python ml/train_voice.py

The model scores a PERSON from the average of several recordings, not one recording
on its own. Each recording's features are first standardised against other recordings
of the same task ("aaah" or a read sentence), then a person's recordings are averaged
and passed to a regularised logistic regression. Averaging is what lifts accuracy:
one recording carries a lot of noise.

Only the two tasks the app records are used for training, so the numbers below
describe the app as built.

What changed from the original v4 model, and why:
  * `updrs` is NOT a feature. It is a clinician-assigned severity score; in this
    dataset every control has 1 and every patient >= 5, so it leaks the label.
  * `ac`, `nth`, `htn` are acoustic measures (autocorrelation, noise-to-harmonics,
    harmonics-to-noise), not age / neuro history / hypertension flags.
  * Features that depend on recording length, clip trimming, or speaker sex are dropped.
  * Evaluation is leave-one-subject-out, with every statistic (task means, scaler,
    model) fitted without the held-out person.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ml" / "data" / "sakar2013_voice.csv"
OUT_MODEL = ROOT / "packages" / "shared" / "src" / "voice-model.json"
OUT_METRICS = ROOT / "ml" / "voice_metrics.json"

FEATURES = [
    "jitter_local", "jitter_local_abs", "jitter_rap", "jitter_ppq5", "jitter_ddp",
    "shimmer_local", "shimmer_local_db", "shimmer_apq3", "shimmer_apq5", "shimmer_apq11", "shimmer_dda",
    "ac", "nth", "htn",
    "period_std",
]
# Deliberately excluded: frac_unvoiced and degree_voice_breaks. In this dataset the clips
# are tightly trimmed 1.5 s segments, so those two measure a few frames of edge trimming,
# and the groups differ in it (controls' clips run slightly longer). They lift the AUC from
# about 0.69 to 0.75 here, but that is recording procedure, not voice, and it would not
# carry over to the app. The app still tracks both against each person's own baseline.
C = 0.1       # fixed a priori; 40 subjects is too few to tune on
CLIP = 4.0    # one out-of-range recording must not dominate an average
CURVE = [1, 2, 3, 5]


def app_task(row: int) -> str | None:
    """Map the dataset's 26 recordings per person onto the app's tasks.

    Dataset order (UCI description): 1 sustained "a", 2 "o", 3 "u", 4-13 numbers,
    14-17 short sentences, 18-26 words.
    """
    if row == 0:
        return "vowel"
    if 13 <= row <= 16:
        return "reading"
    return None


def task_stats(frame: pd.DataFrame) -> dict[str, dict[str, np.ndarray]]:
    return {
        task: {"mean": g[FEATURES].mean().to_numpy(), "std": g[FEATURES].std().to_numpy() + 1e-9}
        for task, g in frame.groupby("task")
    }


def standardise(frame: pd.DataFrame, stats: dict) -> np.ndarray:
    """Per-recording z-scores against the same task. Missing measures count as typical (0)."""
    z = np.zeros((len(frame), len(FEATURES)))
    for i, (task, values) in enumerate(zip(frame["task"], frame[FEATURES].to_numpy())):
        z[i] = (values - stats[task]["mean"]) / stats[task]["std"]
    return np.clip(np.nan_to_num(z, nan=0.0), -CLIP, CLIP)


def person_means(frame: pd.DataFrame, stats: dict) -> tuple[np.ndarray, np.ndarray]:
    z = pd.DataFrame(standardise(frame, stats), index=frame["subject_id"].to_numpy())
    means = z.groupby(level=0).mean()
    labels = frame.groupby("subject_id")["label"].first().loc[means.index]
    return means.to_numpy(), labels.to_numpy()


def fit(X: np.ndarray, y: np.ndarray) -> tuple[StandardScaler, LogisticRegression]:
    scaler = StandardScaler().fit(X)
    clf = LogisticRegression(C=C, max_iter=5000, class_weight="balanced").fit(scaler.transform(X), y)
    return scaler, clf


def leave_one_subject_out(df: pd.DataFrame, y_by_subject: pd.Series, rng: np.random.Generator, curve: bool):
    subjects = np.sort(df["subject_id"].unique())
    full = np.zeros(len(subjects))
    draws = {k: np.zeros((len(subjects), 40)) for k in CURVE} if curve else {}
    for i, s in enumerate(subjects):
        train = df[df["subject_id"] != s].assign(label=lambda d: d["subject_id"].map(y_by_subject))
        held = df[df["subject_id"] == s]
        stats = task_stats(train)
        scaler, clf = fit(*person_means(train, stats))
        z = standardise(held, stats)
        full[i] = clf.decision_function(scaler.transform(z.mean(axis=0, keepdims=True)))[0]
        for k, out in draws.items():
            for j in range(out.shape[1]):
                pick = rng.choice(len(z), size=min(k, len(z)), replace=False)
                out[i, j] = clf.decision_function(scaler.transform(z[pick].mean(axis=0, keepdims=True)))[0]
    y = y_by_subject.loc[subjects].to_numpy()
    return subjects, y, full, draws


def main() -> None:
    raw = pd.read_csv(DATA)
    # Only the "train" split has both classes; the "test" split is patients only.
    raw = raw[raw["source"] == "train"].reset_index(drop=True)
    raw["task"] = raw.groupby("subject_id").cumcount().map(app_task)
    df = raw.dropna(subset=["task"]).reset_index(drop=True)
    labels = df.groupby("subject_id")["label"].first()
    rng = np.random.default_rng(0)

    subjects, y, scores, draws = leave_one_subject_out(df, labels, rng, curve=True)
    auc = roc_auc_score(y, scores)
    by_recordings = {str(k): round(float(np.mean([roc_auc_score(y, d[:, j]) for j in range(d.shape[1])])), 3) for k, d in draws.items()}

    boots = []
    for _ in range(2000):
        idx = rng.integers(0, len(y), len(y))
        if y[idx].min() != y[idx].max():
            boots.append(roc_auc_score(y[idx], scores[idx]))
    ci = [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))]

    # How often would shuffled labels do this well? Guards against reading noise as signal.
    null = []
    for _ in range(200):
        shuffled = pd.Series(rng.permutation(labels.to_numpy()), index=labels.index)
        _, yp, sp, _ = leave_one_subject_out(df, shuffled, rng, curve=False)
        null.append(roc_auc_score(yp, sp))
    p_value = float((np.sum(np.array(null) >= auc) + 1) / (len(null) + 1))

    # Platt scaling fitted on held-out scores only.
    platt = LogisticRegression(C=1e6, max_iter=1000).fit(scores.reshape(-1, 1), y)

    stats = task_stats(df)
    scaler, clf = fit(*person_means(df, stats))
    metrics = {
        "dataset": "Sakar et al. 2013, Parkinson Speech Dataset with Multiple Types of Sound Recordings (UCI)",
        "subjects": int(len(subjects)),
        "recordings": int(len(df)),
        "recordings_per_subject": int(len(df) / len(subjects)),
        "protocol": "leave-one-subject-out; task statistics, scaler and model refit in every fold",
        "subject_auc": round(float(auc), 3),
        "subject_auc_ci95": [round(ci[0], 3), round(ci[1], 3)],
        "auc_by_recordings_averaged": by_recordings,
        "permutation_p_value": round(p_value, 3),
        "note": "Lab-recorded audio. Not validated on phone or WhatsApp audio.",
    }
    model = {
        "version": f"voice-avg-lr-{date.today().isoformat()}",
        "features": FEATURES,
        "clip": CLIP,
        "tasks": {t: {"mean": s["mean"].tolist(), "std": s["std"].tolist()} for t, s in stats.items()},
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "coef": clf.coef_[0].tolist(),
        "intercept": float(clf.intercept_[0]),
        "calibration": {"a": float(platt.coef_[0][0]), "b": float(platt.intercept_[0])},
        "metrics": metrics,
    }
    OUT_MODEL.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")
    OUT_METRICS.write_text(json.dumps({"model_version": model["version"], **metrics}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"model_version": model["version"], **metrics}, indent=2))


if __name__ == "__main__":
    main()
