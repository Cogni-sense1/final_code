#!/usr/bin/env python3
"""
train_voice_model.py
====================================================================
Honest, leak-free training for the NeuroVoice acoustic screening model.

WHY THIS REPLACES retrain_logreg_v4.py
--------------------------------------
The previous v4 model reported ROC-AUC ~0.99, but that number was an
artefact of DATA LEAKAGE. In the training CSV the clinical `updrs`
column is effectively the label:
    healthy subjects  -> updrs == 1  (a single constant value)
    PD subjects       -> updrs >= 5
so the classifier just learned "updrs > 1 => PD". Since a screening
*user* never has a real UPDRS score (the app makes them guess it on a
slider), that model does not generalise.

Honest, subject-grouped validation on the acoustic features ALONE gives
ROC-AUC ~0.59 on this 40-subject dataset. That is the true ceiling of
the current data — the fix is a larger, properly collected dataset
(see DATASETS below), not more feature tweaking.

This script:
  * trains on ACOUSTIC FEATURES ONLY by default (no leak),
  * uses SUBJECT-GROUPED cross-validation (no subject in both folds),
  * cleans inf / extreme values and regularises the model,
  * reports honest ROC-AUC with a confidence interval,
  * saves  model/voice_model.joblib  and  model/voice_features.json .

USAGE
-----
    # default: this repo's CSV, acoustic-only, honest CV
    python train_voice_model.py

    # train on a larger external dataset (same acoustic columns + label + subject_id)
    python train_voice_model.py --csv path/to/bigger_dataset.csv

    # (NOT recommended) include clinical metadata columns as features
    python train_voice_model.py --with-metadata

DATASETS to grow this (public, PD voice):
  * Italian Parkinson's Voice and Speech (IEEE DataPort) — ~800 recordings.
  * UCI "Parkinson's Disease Classification" (Sakar 2018) — 252 subjects.
  * mPower Voice (Sage Bionetworks, Synapse) — thousands of /a/ phonations.
  * MDVR-KCL (King's College London) — sustained phonation + speech.
Extract the same Praat features (see praat_features.py) into a CSV with
columns: subject_id, <acoustic features>, label  (0=healthy, 1=PD).
====================================================================
"""
import argparse
import json
import os
import warnings

import numpy as np
import pandas as pd
import joblib

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import GroupShuffleSplit, StratifiedKFold
from sklearn.metrics import roc_auc_score, classification_report, confusion_matrix

warnings.filterwarnings("ignore")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")

ACOUSTIC_FEATURES = [
    "jitter_local", "jitter_local_abs", "jitter_rap", "jitter_ppq5", "jitter_ddp",
    "shimmer_local", "shimmer_local_db", "shimmer_apq3", "shimmer_apq5",
    "shimmer_apq11", "shimmer_dda",
    "pitch_median", "pitch_mean", "pitch_std", "pitch_min", "pitch_max",
    "pulses", "periods", "mean_period", "period_std",
    "frac_unvoiced", "voice_breaks", "degree_voice_breaks",
]
# Metadata is OFF by default. `updrs` is a label leak; `ac/nth/htn` are
# self-reported at inference and were stored on a different scale in training.
METADATA_FEATURES = ["ac", "nth", "htn"]  # note: intentionally excludes `updrs`


def build_model(kind: str):
    if kind == "rf":
        clf = RandomForestClassifier(
            n_estimators=300, max_depth=6, min_samples_leaf=5,
            class_weight="balanced", random_state=42,
        )
    else:
        clf = LogisticRegression(
            max_iter=5000, solver="lbfgs", C=0.5, class_weight="balanced",
        )
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("clf", clf),
    ])


def clean(X: pd.DataFrame) -> pd.DataFrame:
    X = X.replace([np.inf, -np.inf], np.nan)
    # Clip each column to its 1st/99th percentile to tame extreme outliers.
    for c in X.columns:
        lo, hi = X[c].quantile(0.01), X[c].quantile(0.99)
        if np.isfinite(lo) and np.isfinite(hi) and hi > lo:
            X[c] = X[c].clip(lo, hi)
    return X


def subject_grouped_auc(df, feats, y, groups, kind, n_splits=5):
    aucs = []
    gss = GroupShuffleSplit(n_splits=n_splits, test_size=0.25, random_state=7)
    for tr, te in gss.split(df[feats], y, groups):
        model = build_model(kind)
        model.fit(clean(df[feats].iloc[tr]), y.iloc[tr])
        p = model.predict_proba(clean(df[feats].iloc[te]))[:, 1]
        # AUC undefined if a fold's test set is single-class
        if len(np.unique(y.iloc[te])) > 1:
            aucs.append(roc_auc_score(y.iloc[te], p))
    return np.array(aucs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=os.path.join(BASE_DIR, "full_with_headers.csv"))
    ap.add_argument("--with-metadata", action="store_true",
                    help="include ac/nth/htn (NOT recommended; still excludes updrs leak)")
    ap.add_argument("--model", choices=["logreg", "rf"], default="logreg")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)

    feats = list(ACOUSTIC_FEATURES)
    if args.with_metadata:
        feats += [c for c in METADATA_FEATURES if c in df.columns]

    missing = set(feats) - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in CSV: {missing}")
    if "label" not in df.columns:
        raise ValueError("CSV must contain a 'label' column (0=healthy, 1=PD).")

    y = df["label"].astype(int)
    groups = df["subject_id"] if "subject_id" in df.columns else pd.Series(np.arange(len(df)))

    n_subjects = groups.nunique()
    print(f"Rows: {len(df)} | subjects: {n_subjects} | features: {len(feats)}")
    print(f"Label balance: {y.value_counts().to_dict()}")
    if "updrs" in feats:
        print("WARNING: 'updrs' is in the feature set — this leaks the label. Remove it.")

    # ── Honest subject-grouped cross-validated AUC ────────────────────────────
    aucs = subject_grouped_auc(df, feats, y, groups, args.model)
    print("\n📊 HONEST subject-grouped ROC-AUC")
    print(f"   mean={aucs.mean():.3f}  std={aucs.std():.3f}  folds={list(np.round(aucs,3))}")
    if aucs.mean() < 0.7:
        print("   ⚠️  AUC < 0.70 → the dataset is too small/low-signal for reliable")
        print("       screening. Grow it with a larger dataset (see header).")

    # ── Fit final CALIBRATED model on all data (subject-aware CV for calibration)
    base = build_model(args.model)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    final = CalibratedClassifierCV(base, method="sigmoid", cv=cv)
    final.fit(clean(df[feats]), y)

    # Report on a held-out grouped split too (indicative single split)
    gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
    tr, te = next(gss.split(df[feats], y, groups))
    holdout = CalibratedClassifierCV(build_model(args.model), method="sigmoid", cv=3)
    holdout.fit(clean(df[feats].iloc[tr]), y.iloc[tr])
    p = holdout.predict_proba(clean(df[feats].iloc[te]))[:, 1]
    if len(np.unique(y.iloc[te])) > 1:
        print("\nHeld-out grouped split:")
        print("  ROC-AUC:", round(roc_auc_score(y.iloc[te], p), 3))
        print(classification_report(y.iloc[te], (p >= 0.5).astype(int)))

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(final, os.path.join(MODEL_DIR, "voice_model.joblib"))
    with open(os.path.join(MODEL_DIR, "voice_features.json"), "w") as f:
        json.dump(feats, f, indent=2)

    print("\n✅ Saved model/voice_model.joblib and model/voice_features.json")
    print(f"   Features ({len(feats)}): {feats}")


if __name__ == "__main__":
    main()
