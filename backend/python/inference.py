# inference_v4.py
import warnings
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    module="sklearn"
)

import sys
import json
import joblib
import os

# Helpful import error guidance when running outside the project's venv
try:
    from praat_features import extract_praat_features
    from feature_engineering import build_feature_vector
except Exception as e:
    sys.stderr.write(
        "Error importing Python dependencies: {}\n".format(e)
    )
    sys.stderr.write(
        "Make sure you activated the virtualenv and installed requirements:\n"
    )
    sys.stderr.write("  cd backend/python\n")
    sys.stderr.write("  python3 -m venv venv   # if not created\n")
    sys.stderr.write("  source venv/bin/activate\n")
    sys.stderr.write("  pip install -r requirements.txt\n")
    sys.exit(1)

# -------------------------------
# CONFIG
# -------------------------------
SCREENING_THRESHOLD = 0.30

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")

# Prefer the honest, leak-free acoustic model (voice_model.joblib). The old v4
# model reported AUC ~0.99 only because `updrs` leaked the label; it does not
# generalise to real screening. Fall back to v4 only if the honest model is
# missing. See train_voice_model.py for details.
VOICE_MODEL_PATH = os.path.join(MODEL_DIR, "voice_model.joblib")
VOICE_FEATURES_PATH = os.path.join(MODEL_DIR, "voice_features.json")

if os.path.exists(VOICE_MODEL_PATH) and os.path.exists(VOICE_FEATURES_PATH):
    model = joblib.load(VOICE_MODEL_PATH)
    with open(VOICE_FEATURES_PATH) as f:
        feature_cols = json.load(f)
    USES_METADATA = any(c in feature_cols for c in ("ac", "nth", "htn", "updrs"))
else:
    # Legacy fallback (leak-prone) — kept only for backward compatibility.
    model = joblib.load(os.path.join(MODEL_DIR, "logreg_model_v4.joblib"))
    with open(os.path.join(MODEL_DIR, "feature_cols_v4_calibrated.json")) as f:
        feature_cols = json.load(f)
    USES_METADATA = True

# -------------------------------
# DEFAULT METADATA (for CLI demo)
# -------------------------------
DEFAULT_META = {
    "ac": 0,
    "nth": 1,
    "htn": 0,
    "updrs": 0
}

# -------------------------------
# PREDICTION FUNCTION
# -------------------------------
def predict(audio_path, meta=DEFAULT_META):

    # Extract audio features (Praat)
    praat_feats = extract_praat_features(audio_path)

    # Only merge clinical metadata if the loaded model was trained with it.
    # The honest acoustic model ignores metadata (and never uses `updrs`,
    # which would leak the label and cannot be known at screening time).
    if USES_METADATA:
        praat_feats.update({
            "ac": meta["ac"],
            "nth": meta["nth"],
            "htn": meta["htn"],
            "updrs": meta["updrs"],
        })

    # Align features exactly as training
    X = build_feature_vector(praat_feats, feature_cols)

    # Predict probability
    prob = model.predict_proba(X)[0][1]
    prob = max(0.01, min(0.99, prob))

    # Screening decision
    screening_positive = prob >= SCREENING_THRESHOLD

    return {
        "risk_score": round(float(prob), 3),
        "risk_level": (
            "Low" if prob < 0.33 else
            "Medium" if prob < 0.66 else
            "High"
        )
    }

# -------------------------------
# CLI ENTRY POINT
# -------------------------------
if __name__ == "__main__":
    audio_path = sys.argv[1]

    # Optional metadata from CLI
    if len(sys.argv) == 6:
        meta = {
            "ac": int(sys.argv[2]),
            "nth": int(sys.argv[3]),
            "htn": int(sys.argv[4]),
            "updrs": float(sys.argv[5])
        }
    else:
        meta = DEFAULT_META

    result = predict(audio_path, meta)
    print(json.dumps(result, indent=2))