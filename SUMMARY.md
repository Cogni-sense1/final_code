# Summary — kiro/phase0-phase1-fusion

Work completed autonomously on branch `kiro/phase0-phase1-fusion`. `main` was never touched. See `DECISIONS.md` for the reasoning behind every ambiguous call.

## What was completed

### Task 1 — Unified risk thresholds ✅
- One scheme now drives both the screening decision and the display labels: **Low < 0.30, Medium 0.30–0.66, High > 0.66**. `0.30` (the sensitivity-first clinical cutoff) is kept, with an explanatory comment.
- New single sources of truth:
  - `src/constants/risk.ts` (web) — `RISK_THRESHOLDS`, `getRiskLevel()`, `isScreeningPositive()`.
  - `neurovoice-mobile/constants/risk.ts` (mobile) — mirror (separate package, can't cross-import).
- Updated every consumer: web `Insights.tsx` (was `33/66`), mobile `caregiver.tsx` and `app/(tabs)/insights.tsx` (were `33/66`), and `backend/python/inference.py` (label boundary `0.33` → `0.30` to match its own `SCREENING_THRESHOLD`).

### Task 2 — API base URL via env var ✅
- `src/utils/voiceAnalysisAPI.ts` now reads `import.meta.env.VITE_API_BASE_URL`, falling back to `http://localhost:5050`.
- Added typing in `src/vite-env.d.ts` and a documented `.env.example` at the repo root (web, node backend, and mobile vars — no secrets).
- The mobile app already used `process.env.EXPO_PUBLIC_BACKEND_URL`; documented it in `.env.example`.

### Task 3 — Dependency audit ✅
- **Removed `@google/genai`** (never imported) via `npm uninstall`.
- Listed other *candidate* unused deps for human review in `DECISIONS.md` (`zod`, `@hookform/resolvers`, `fast-check`, `@tailwindcss/typography`, `@testing-library/react`) and flagged depcheck false positives (`postcss`, `autoprefixer`). Nothing else was removed.

### Task 4 — Multimodal fusion ✅
- `src/utils/overallRisk.ts` → `calculateOverallRisk(tests)`:
  1. Averages within each modality first (kills frequency bias).
  2. Combines modality averages with confidence weights (voice 0.5, face 0.3, fingerTap 0.2) defined in `src/constants/risk.ts` (`MODALITY_WEIGHTS`).
  3. Renormalizes weights over the modalities that have data.
  4. Returns `{ overallScore, riskLevel, breakdown }` where `breakdown` gives each modality's average, effective weight, contribution %, and count.
- Unit tests in `src/utils/overallRisk.test.ts` (10 tests, all passing) cover single-modality input, uneven test frequency (5× vs 1× — confirms no dominance), missing-modality renormalization, the empty case, plus fast-check properties (weights sum to 1, score stays within input range, weights never below nominal).

### Task 5 — Fusion breakdown UI ✅
- `src/pages/Insights.tsx` now shows the fused "OVERALL RISK (7D)" and a new **Risk Breakdown** card with per-modality bars ("Voice 50%", etc.), test counts, and averages. Matches existing shadcn/Tailwind styling; no new dependencies.

### Task 6 — Wrap-up ✅
- Web production build: **passing** (`npm run build`).
- Web test suite: **passing** (`npm run test` → 11/11).
- Web lint on all changed files: **clean**.
- Docs written: `DECISIONS.md`, this `SUMMARY.md`.
- Incremental commits pushed to `kiro/phase0-phase1-fusion` throughout.

## What was skipped / not done, and why
- **Mobile build (`expo`) was not run** — it requires a device/emulator bundler and is not meaningfully "buildable" headless here.
- **2 pre-existing mobile test failures were left as-is.** `voice-test.test.tsx` and `permissions.test.ts` fail because they import Expo native modules that error under `jest-expo` in this environment (`Platform.select` undefined) — not caused by my changes (which none of those suites import). Mobile pure-logic suites pass. Details in `DECISIONS.md`.
- **Other candidate-unused dependencies were not removed** — task said list-only.
- **Python model / training / model artifacts** were not touched (only the label-threshold branch in `inference.py`; the v4 model stays as-is). The Twilio/WhatsApp webhook was not touched.

## Needs human review
1. Whether modifying `backend/python/inference.py`'s label boundary (`0.33` → `0.30`) is acceptable under the "don't modify Python model" rule. It changes serving labels for scores in [0.30, 0.33) from "Low" to "Medium" (see `DECISIONS.md` for full rationale; the TS unification stands alone if this is reverted).
2. The candidate unused-dependency list (Task 3).
3. `backend/python/not/` — a checked-in virtualenv that looks accidental and bloats the repo.
4. Pre-existing mobile `react` / `react-test-renderer` peer-version mismatch and the `jest-expo` native-module test setup.

## Verification commands
```powershell
# Web (from repo root)
npm install
npm run build
npm run test

# Mobile (from neurovoice-mobile/) — note the peer-dep workaround
npm install --legacy-peer-deps
npm test   # storage/riskCalculation/voiceAnalysisAPI pass; voice-test & permissions fail pre-existing
```
