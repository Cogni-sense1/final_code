# evaluate_model_v4.py
#
# READ-ONLY evaluation of the DEPLOYED Logistic Regression v4 model.
#
# This script does NOT retrain, modify, or overwrite the model, the training
# code, or any model artifact. It:
#   1. Loads the deployed model (model/logreg_model_v4.joblib).
#   2. Reproduces the EXACT patient-grouped hold-out split used in training
#      (GroupShuffleSplit, test_size=0.2, random_state=42, grouped by
#      subject_id) so evaluation happens on data the model never saw.
#   3. Reports ROC-AUC, precision/recall/F1 at the 0.30 screening threshold,
#      the confusion matrix, and a precision/recall tradeoff table across
#      thresholds 0.2 / 0.3 / 0.4 / 0.5.
#   4. Writes the numbers to model_evaluation.md (dated, labeled with dataset
#      and model version).
#
# Usage:  python evaluate_model_v4.py
#
# Rationale for the scheme: the deployed model is a single fixed artifact, so
# it cannot be "cross-validated" without retraining (which is forbidden here).
# The faithful read-only equivalent is to evaluate it on the same patient-
# grouped hold-out test set the training script carved out — no patient
# appears in both the model's training data and this evaluation set.

import os
import json
import datetime

import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import (
    roc_auc_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    accuracy_score,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "full_with_headers.csv")
MODEL_DIR = os.path.join(BASE_DIR, "model")
MODEL_PATH = os.path.join(MODEL_DIR, "logreg_model_v4.joblib")
FEATURES_PATH = os.path.join(MODEL_DIR, "feature_cols_v4_calibrated.json")
OUTPUT_PATH = os.path.join(BASE_DIR, "..", "..", "model_evaluation.md")

SCREENING_THRESHOLD = 0.30
TRADEOFF_THRESHOLDS = [0.2, 0.3, 0.4, 0.5]
MODEL_VERSION = "Logistic Regression v4 (calibrated, sigmoid)"
DATASET_NAME = "full_with_headers.csv"


def load_holdout():
    """Reproduce the training split and return (X_test, y_test, sizes)."""
    df = pd.read_csv(DATA_PATH)

    with open(FEATURES_PATH) as f:
        features = json.load(f)

    missing = set(features) - set(df.columns)
    if missing:
        raise ValueError(f"Missing feature columns in dataset: {missing}")

    X = df[features]
    y = df["label"]
    groups = df["subject_id"]

    gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_idx, test_idx = next(gss.split(X, y, groups))

    sizes = {
        "total_rows": int(len(df)),
        "total_subjects": int(groups.nunique()),
        "train_rows": int(len(train_idx)),
        "test_rows": int(len(test_idx)),
        "train_subjects": int(groups.iloc[train_idx].nunique()),
        "test_subjects": int(groups.iloc[test_idx].nunique()),
        "test_positives": int(y.iloc[test_idx].sum()),
        "test_negatives": int((y.iloc[test_idx] == 0).sum()),
    }

    # Sanity: no subject leaks across the split.
    overlap = set(groups.iloc[train_idx]) & set(groups.iloc[test_idx])
    sizes["subject_overlap"] = len(overlap)

    return X.iloc[test_idx], y.iloc[test_idx], sizes, len(features)


def metrics_at(y_true, y_prob, threshold):
    y_pred = (y_prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {
        "threshold": threshold,
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "f1": f1_score(y_true, y_pred, zero_division=0),
        "accuracy": accuracy_score(y_true, y_pred),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    }


def main():
    model = joblib.load(MODEL_PATH)
    X_test, y_test, sizes, n_features = load_holdout()

    y_prob = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, y_prob)

    primary = metrics_at(y_test, y_prob, SCREENING_THRESHOLD)
    tradeoff = [metrics_at(y_test, y_prob, t) for t in TRADEOFF_THRESHOLDS]

    generated = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    lines = []
    lines.append("# Model Evaluation — v4 Logistic Regression")
    lines.append("")
    lines.append(f"- **Generated:** {generated}")
    lines.append(f"- **Model:** {MODEL_VERSION} (`backend/python/model/logreg_model_v4.joblib`)")
    lines.append(f"- **Dataset:** `{DATASET_NAME}` "
                 f"({sizes['total_rows']} recordings, {sizes['total_subjects']} subjects)")
    lines.append(f"- **Features:** {n_features} (`feature_cols_v4_calibrated.json`)")
    lines.append("- **Evaluation scheme:** patient-grouped hold-out "
                 "(`GroupShuffleSplit`, test_size=0.2, random_state=42, grouped by "
                 "`subject_id`) — identical to the split used in training. The "
                 "deployed model is evaluated on the held-out test subjects it "
                 "was never trained on.")
    lines.append("- **Method:** evaluation only. The model, training code, and "
                 "artifacts were not modified or retrained.")
    lines.append("")
    lines.append("> Note: because the deployed model is a single fixed artifact, "
                 "it cannot be k-fold cross-validated without retraining (which is "
                 "out of scope). The patient-grouped hold-out above is the faithful "
                 "read-only equivalent — no subject appears in both training and test.")
    lines.append("")

    lines.append("## Hold-out test set composition")
    lines.append("")
    lines.append(f"- Test recordings: **{sizes['test_rows']}** "
                 f"(from {sizes['test_subjects']} subjects)")
    lines.append(f"- Positives (PD, label=1): **{sizes['test_positives']}** · "
                 f"Negatives (label=0): **{sizes['test_negatives']}**")
    lines.append(f"- Train recordings: {sizes['train_rows']} "
                 f"(from {sizes['train_subjects']} subjects)")
    lines.append(f"- Subject overlap between train and test: "
                 f"**{sizes['subject_overlap']}** (0 confirms no patient leakage)")
    lines.append("")

    lines.append("## Headline metrics")
    lines.append("")
    lines.append(f"- **ROC-AUC:** {auc:.3f}")
    lines.append(f"- At the **0.30 screening threshold**:")
    lines.append(f"  - Precision (PD): {primary['precision']:.3f}")
    lines.append(f"  - Recall / Sensitivity (PD): {primary['recall']:.3f}")
    lines.append(f"  - F1 (PD): {primary['f1']:.3f}")
    lines.append(f"  - Accuracy: {primary['accuracy']:.3f}")
    lines.append("")

    lines.append("### Confusion matrix @ 0.30 (rows = actual, cols = predicted)")
    lines.append("")
    lines.append("| | Pred Negative | Pred Positive |")
    lines.append("|---|---|---|")
    lines.append(f"| **Actual Negative** | {primary['tn']} (TN) | {primary['fp']} (FP) |")
    lines.append(f"| **Actual Positive** | {primary['fn']} (FN) | {primary['tp']} (TP) |")
    lines.append("")

    lines.append("## Precision / recall tradeoff across thresholds")
    lines.append("")
    lines.append("| Threshold | Precision | Recall | F1 | Accuracy | TP | FP | FN | TN |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for m in tradeoff:
        marker = " (screening)" if abs(m["threshold"] - SCREENING_THRESHOLD) < 1e-9 else ""
        lines.append(
            f"| {m['threshold']:.2f}{marker} | {m['precision']:.3f} | {m['recall']:.3f} | "
            f"{m['f1']:.3f} | {m['accuracy']:.3f} | {m['tp']} | {m['fp']} | {m['fn']} | {m['tn']} |"
        )
    lines.append("")
    lines.append("Lower thresholds favor **recall** (catch more true PD cases at the "
                 "cost of more false positives) — the intended sensitivity-first "
                 "posture for a screening aid. Higher thresholds favor **precision**.")
    lines.append("")

    report = "\n".join(lines)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(report + "\n")

    # Echo to stdout too.
    print(report)
    print(f"\n[written to {os.path.relpath(OUTPUT_PATH, BASE_DIR)}]")


if __name__ == "__main__":
    main()
