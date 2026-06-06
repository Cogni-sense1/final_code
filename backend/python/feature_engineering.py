# feature_engineering.py
import pandas as pd

def build_feature_vector(praat_feats, feature_cols):
    df = pd.DataFrame([praat_feats])

    # Add missing cols with 0
    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0.0

    # Order EXACTLY like training
    df = df[feature_cols]
    return df