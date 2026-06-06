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

import seaborn as sns
import matplotlib.pyplot as plt

sns.set_theme(
    style="whitegrid",
    palette="Spectral",
    font_scale=1.2
)

plt.rcParams["figure.figsize"] = (8, 6)
plt.rcParams["axes.titleweight"] = "bold"
# ---------------------------------
# LOAD DATA
# ---------------------------------
df = pd.read_csv("full_with_headers.csv")

# ---------------------------------
# LOAD v4 FEATURE LIST
# ---------------------------------
with open("model/feature_cols_v4_calibrated.json") as f:
    VALID_FEATURES = json.load(f)

# ---------------------------------
# SANITY CHECK (IMPORTANT)
# ---------------------------------
missing = set(VALID_FEATURES) - set(df.columns)
if missing:
    raise ValueError(f"❌ Missing columns in CSV: {missing}")

print("✅ All v4 features present")

# ---------------------------------
# PREPARE DATA
# ---------------------------------
X = df[VALID_FEATURES]
y = df["label"]

# ---------------------------------
# TRAIN / TEST SPLIT
# (same as v1 for fair comparison)
# ---------------------------------
from sklearn.model_selection import GroupShuffleSplit

groups = df["subject_id"]

gss = GroupShuffleSplit(
    n_splits=1,
    test_size=0.2,
    random_state=42
)

train_idx, test_idx = next(gss.split(X, y, groups))

X_train = X.iloc[train_idx]
X_test  = X.iloc[test_idx]

y_train = y.iloc[train_idx]
y_test  = y.iloc[test_idx]

# ---------------------------------
# PIPELINE
# ---------------------------------
base_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
    ("clf", LogisticRegression(
        max_iter=2000,
        solver="lbfgs",
        class_weight="balanced"
    ))
])

# ---------------------------------
# CALIBRATED MODEL
# ---------------------------------
model = CalibratedClassifierCV(
    base_pipeline,
    method="sigmoid",
    cv=5
)

# ---------------------------------
# TRAIN
# ---------------------------------
model.fit(X_train, y_train)

# ---------------------------------
# EVALUATION
# ---------------------------------
y_prob = model.predict_proba(X_test)[:, 1]
y_pred = model.predict(X_test)

auc = roc_auc_score(y_test, y_prob)
import numpy as np
from sklearn.metrics import confusion_matrix

print("\n🔍 THRESHOLD TUNING (PD = class 1)")

thresholds = np.arange(0.1, 0.91, 0.05)

best_threshold = None

for t in thresholds:
    y_pred_t = (y_prob >= t).astype(int)

    tn, fp, fn, tp = confusion_matrix(y_test, y_pred_t).ravel()

    recall_pd = tp / (tp + fn) if (tp + fn) > 0 else 0
    precision_pd = tp / (tp + fp) if (tp + fp) > 0 else 0

    print(
        f"Threshold={t:.2f} | "
        f"Recall(PD)={recall_pd:.3f} | "
        f"Precision(PD)={precision_pd:.3f}"
    )

    if recall_pd >= 0.95 and best_threshold is None:
        best_threshold = t

print("\n✅ Recommended screening threshold:", best_threshold)

print("\n📊 V4 VALIDATION RESULTS")
print("ROC-AUC:", round(auc, 3))
print(classification_report(y_test, y_pred))

# ---------------------------------
# SAVE MODEL (SEPARATE FROM v1)
# ---------------------------------
joblib.dump(model, "model/logreg_model_v4.joblib")

print("\n✅ v4 model trained & saved")
print("Features used:", len(VALID_FEATURES))


import shap
import matplotlib.pyplot as plt

# Extract trained pipeline from calibrated model
pipeline = model.calibrated_classifiers_[0].estimator

logreg = pipeline.named_steps["clf"]
imputer = pipeline.named_steps["imputer"]

# Impute only (do NOT scale for SHAP clarity)
X_train_imp = imputer.transform(X_train)
X_test_imp  = imputer.transform(X_test)

explainer = shap.LinearExplainer(
    logreg,
    X_train_imp,
    feature_names=VALID_FEATURES
)

shap_values = explainer.shap_values(X_test_imp)

plt.figure(figsize=(9, 6))

shap.summary_plot(
    shap_values,
    X_test_imp,
    feature_names=VALID_FEATURES,
    plot_type="dot",
    cmap="coolwarm",   # blue → red like your image
    show=True
)