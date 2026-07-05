# Model Evaluation — v4 Logistic Regression

- **Generated:** 2026-07-05 14:55
- **Model:** Logistic Regression v4 (calibrated, sigmoid) (`backend/python/model/logreg_model_v4.joblib`)
- **Dataset:** `full_with_headers.csv` (1208 recordings, 40 subjects)
- **Features:** 27 (`feature_cols_v4_calibrated.json`)
- **Evaluation scheme:** patient-grouped hold-out (`GroupShuffleSplit`, test_size=0.2, random_state=42, grouped by `subject_id`) — identical to the split used in training. The deployed model is evaluated on the held-out test subjects it was never trained on.
- **Method:** evaluation only. The model, training code, and artifacts were not modified or retrained.

> Note: because the deployed model is a single fixed artifact, it cannot be k-fold cross-validated without retraining (which is out of scope). The patient-grouped hold-out above is the faithful read-only equivalent — no subject appears in both training and test.

## Hold-out test set composition

- Test recordings: **250** (from 8 subjects)
- Positives (PD, label=1): **172** · Negatives (label=0): **78**
- Train recordings: 958 (from 32 subjects)
- Subject overlap between train and test: **0** (0 confirms no patient leakage)

## Headline metrics

- **ROC-AUC:** 0.984
- At the **0.30 screening threshold**:
  - Precision (PD): 0.950
  - Recall / Sensitivity (PD): 0.994
  - F1 (PD): 0.972
  - Accuracy: 0.960

### Confusion matrix @ 0.30 (rows = actual, cols = predicted)

| | Pred Negative | Pred Positive |
|---|---|---|
| **Actual Negative** | 69 (TN) | 9 (FP) |
| **Actual Positive** | 1 (FN) | 171 (TP) |

## Precision / recall tradeoff across thresholds

| Threshold | Precision | Recall | F1 | Accuracy | TP | FP | FN | TN |
|---|---|---|---|---|---|---|---|---|
| 0.20 | 0.925 | 1.000 | 0.961 | 0.944 | 172 | 14 | 0 | 64 |
| 0.30 (screening) | 0.950 | 0.994 | 0.972 | 0.960 | 171 | 9 | 1 | 69 |
| 0.40 | 0.977 | 0.983 | 0.980 | 0.972 | 169 | 4 | 3 | 74 |
| 0.50 | 0.976 | 0.930 | 0.952 | 0.936 | 160 | 4 | 12 | 74 |

Lower thresholds favor **recall** (catch more true PD cases at the cost of more false positives) — the intended sensitivity-first posture for a screening aid. Higher thresholds favor **precision**.

