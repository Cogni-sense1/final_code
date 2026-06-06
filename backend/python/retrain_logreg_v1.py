# retrain_logreg_clean.py
import json
import joblib
import pandas as pd

from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, classification_report

# 🔹 LOAD DATA
df = pd.read_csv("full_with_headers.csv")

# 🔹 VALID, INFERENCE-SAFE FEATURES ONLY
VALID_FEATURES = [
    "jitter_local", "jitter_local_abs", "jitter_rap",
    "jitter_ppq5", "jitter_ddp",

    "shimmer_local", "shimmer_local_db", "shimmer_apq3",
    "shimmer_apq5", "shimmer_apq11", "shimmer_dda",

    "pitch_median", "pitch_mean", "pitch_std",
    "pitch_min", "pitch_max",

    "pulses", "periods", "mean_period", "period_std",
    "frac_unvoiced", "voice_breaks", "degree_voice_breaks"
]

X = df[VALID_FEATURES]
y = df["label"]

# 🔹 TRAIN / TEST SPLIT (CRITICAL)
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    stratify=y,
    random_state=42
)

# 🔹 BASE PIPELINE
base_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
    ("clf", LogisticRegression(
        max_iter=1000,
        solver="lbfgs",
        class_weight="balanced"
    ))
])

# 🔹 CALIBRATED MODEL (Platt scaling)
model = CalibratedClassifierCV(
    base_pipeline,
    method="sigmoid",
    cv=5
)

# 🔹 FIT ONLY ON TRAINING DATA
model.fit(X_train, y_train)

# 🔹 VALIDATION (THIS IS WHAT YOU QUOTE)
y_prob = model.predict_proba(X_test)[:, 1]
y_pred = model.predict(X_test)

auc = roc_auc_score(y_test, y_prob)

print("\n📊 VALIDATION RESULTS")
print("ROC-AUC:", round(auc, 3))
print(classification_report(y_test, y_pred))

# 🔹 SAVE MODEL + FEATURES
joblib.dump(model, "model/logreg_model.joblib")
json.dump(VALID_FEATURES, open("model/feature_columns.json", "w"))

print("\n✅ Model retrained & saved successfully")
print("Features used:", VALID_FEATURES)

print("\n📊 V4 VALIDATION RESULTS")
print("ROC-AUC:", round(auc, 3))
print(classification_report(y_test, y_pred))

# ---------------------------------
# SAVE MODEL (SEPARATE FROM v1)
# ---------------------------------
joblib.dump(model, "model/logreg_model_v4.joblib")

print("\n✅ v4 model trained & saved")
print("Features used:", len(VALID_FEATURES))