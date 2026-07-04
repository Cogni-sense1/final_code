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
# Unified risk thresholds (single scheme shared with the web/mobile apps,
# see src/constants/risk.ts). One 0-1 probability drives BOTH the binary
# screening decision and the Low/Medium/High label:
#
#   Low     : prob  <  0.30
#   Medium  : 0.30 <= prob <= 0.66
#   High    : prob  >   0.66
#
# 0.30 is a deliberate sensitivity-first clinical choice: the v4 model
# threshold was tuned for >=0.95 recall on Parkinson's, so the tool errs
# toward catching possible cases rather than missing them. Previously the
# label boundary was 0.33 while screening used 0.30, so a 0.31 score was
# flagged "at risk" yet displayed as "Low"; the label boundary is now 0.30
# to match the screening cutoff.
SCREENING_THRESHOLD = 0.30
MEDIUM_HIGH_THRESHOLD = 0.66

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")

# Load v4-lite model
model = joblib.load(
    os.path.join(MODEL_DIR, "logreg_model_v4.joblib")
)

# Load v4-lite feature list (IMPORTANT)
with open(os.path.join(MODEL_DIR, "feature_cols_v4_calibrated.json")) as f:
    feature_cols = json.load(f)

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

    # Merge clinical metadata
    praat_feats.update({
        "ac": meta["ac"],
        "nth": meta["nth"],
        "htn": meta["htn"],
        "updrs": meta["updrs"]
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
            "Low" if prob < SCREENING_THRESHOLD else
            "Medium" if prob <= MEDIUM_HIGH_THRESHOLD else
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