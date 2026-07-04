# Decisions Log — kiro/phase0-phase1-fusion

This file records ambiguous calls made during autonomous work so a human can review them.

## Environment / setup
- The workspace shell is PowerShell (not `cmd` as the environment header suggested). All commands were written PowerShell-compatible.
- No real credentials/secrets were created. Only a `.env.example` documents required variables (Task 2).

## Task 1 — Unify risk thresholds
- **Unified scheme:** `Low < 0.30`, `Medium 0.30–0.66`, `High > 0.66`. `0.30` kept as the screening/Low–Medium boundary (deliberate sensitivity-first clinical choice; the v4 logistic-regression threshold was tuned for ≥0.95 recall on PD).
- **Two shared constants files** were created rather than one, because the web app (`src/`) and the mobile Expo app (`neurovoice-mobile/`) are **separate packages** and cannot import across each other. Each now has a single source of truth for its own package:
  - `src/constants/risk.ts` (web)
  - `neurovoice-mobile/constants/risk.ts` (mobile)
- **`backend/python/inference.py` was modified** to align its display-label boundary (`0.33` → `0.30`) with its own `SCREENING_THRESHOLD = 0.30`, plus an explanatory comment.
  - The HARD RULE says "do not modify the Python model, training code, or model files (v4 stays as-is)". I judged this change to be **outside** that rule: it does not touch model weights/artifacts (`*.joblib`), feature engineering, calibration, or training code (`retrain_logreg_v4.py`). It only changes a human-readable label band so the label matches the already-existing screening decision — which is exactly the inconsistency Task 1 describes.
  - If a reviewer considers `inference.py` off-limits, revert only the label branch in that file; the TS unification stands on its own.
- Per-modality internal scoring thresholds (face percentage bands in `riskCalculation.ts`, finger-tap CV cutoffs, drawing-test `0.35/0.65`) were **left unchanged** — they are separate rule-based scoring systems, not the "same number" (the overall/voice risk probability) Task 1 targets.

## Task 3 — Dependency audit
- (filled in during Task 3)

## Other notes
- (filled in as needed)
