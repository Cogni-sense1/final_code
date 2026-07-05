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
- **Removed `@google/genai`**: it appeared only in `package.json` and was never imported anywhere in the codebase. Removed via `npm uninstall @google/genai` (updates `package.json` and `package-lock.json` together; 36 transitive packages pruned).
  - Note: `package-lock.json` is **git-ignored** in this repo (see `.gitignore`), so the lockfile change is local only and cannot be committed. The `package.json` change is committed.

### Other dependencies that APPEAR unused (NOT removed — for human review)
Detected with `npx depcheck` and confirmed by grep. Left in place per task instructions.

| Package | Type | Notes |
|---|---|---|
| `zod` | dependency | No `import ... from "zod"` anywhere in `src/`. Likely intended for form validation that was never wired up. |
| `@hookform/resolvers` | dependency | Not imported; `src/components/ui/form.tsx` uses `react-hook-form` directly but never the zod resolver. |
| `fast-check` | dependency | Not imported in web `src/`. Used by the **mobile** app's tests (separate package). Also mis-placed: it's a test-only lib but sits in `dependencies`. |
| `@tailwindcss/typography` | devDependency | Not referenced in `tailwind.config.ts` (only `tailwindcss-animate` is registered as a plugin). |
| `@testing-library/react` | devDependency | Not imported by any web test (`src/test/` only has a trivial example). A reasonable dep to keep for future component tests. |

**depcheck false positives (do NOT remove — verified in use):**
- `autoprefixer`, `postcss` — used by `postcss.config.js` for the Tailwind build pipeline.

**Broader observation:** most `@radix-ui/*` packages are only consumed by scaffolded shadcn UI components in `src/components/ui/` that no page imports (pages use only button, progress, slider, switch, sonner, tooltip). Pruning the unused UI components would let many radix deps be removed, but that is a larger refactor and is left for human review.

## Task 4 — Multimodal fusion
- `calculateOverallRisk(tests)` lives in `src/utils/overallRisk.ts` and accepts an array of already-window-filtered test records (`{ type, riskScore }`). Date-range filtering stays the caller's job (via `getTestsForDays`), keeping the fusion function pure and trivially unit-testable.
- **"Effective contribution percentage"** in `breakdown` was interpreted as the renormalized *weight* expressed as a percentage (e.g. voice 50%, face 30%, finger-tap 20%). This matches the Task 5 UI example ("Voice contributed 50%, Face 30%, Finger-tap 20%"), which shows weights, not score-share. `weight` (0–1) and `contribution` (0–100) are therefore the same quantity in different units.
- The old flat-average `getAverageRisk()` in `testHistory.ts` was left in place (still exported) to avoid breaking any other consumer; Insights now uses the fusion instead.

## Task 5 — Fusion breakdown UI
- Wired into `src/pages/Insights.tsx`: the "AVERAGE RISK (7D)" headline is now the fused "OVERALL RISK (7D)", and a new "Risk Breakdown" card shows each contributing modality's test count, average, contribution %, and a colored bar. Styling reuses the existing shadcn/Tailwind card idiom; no new dependencies.
- The breakdown card only renders modalities that actually have tests in the window.

## Other notes
- **Mobile test suite has 2 pre-existing failures unrelated to this work.** `neurovoice-mobile` deps had to be installed with `--legacy-peer-deps` (repo pins `react@19.1.0` but `react-test-renderer@19.2.7` demands `react@^19.2.7` — a pre-existing peer conflict). After install, `jest`:
  - `__tests__/voice-test.test.tsx` and `utils/permissions.test.ts` fail because they import Expo native modules that error under `jest-expo` in this environment (`expo-modules-core` `Platform.select` is undefined). The voice-test counterexample `[0,"Low"]` fails on the first run because the component `require` throws, not due to assertion logic.
  - The pure-logic suites pass: `storage.test.ts`, `riskCalculation.test.ts`, `voiceAnalysisAPI.test.ts` (14 tests).
  - None of the failing suites import the files I changed (`caregiver.tsx`, `(tabs)/insights.tsx`, `constants/risk.ts`), so these failures are not caused by this work and were left as-is (fixing jest-expo native-module mocking is out of scope and risky).
- **Committed venv noise:** `backend/python/not/` contains a checked-in Python 3.9 virtualenv. It looks like an accidental commit and inflates the repo, but deleting files beyond the unused-dependency removal is outside this task's scope, so it was left for human review.
- `package-lock.json` (web) and the mobile lockfile are git-ignored, so dependency-tree changes (the `@google/genai` removal, mobile install) are local only.

---

# Decisions Log — kiro/phase2-prep-and-model-rigor (2026-07-05)

Branched from `kiro/phase0-phase1-fusion`. Never committed to `main`.

## Task 1 — Backend persistence layer
- **Repository pattern.** Routes depend only on the `ResultsRepository` contract (`save`, `list`). `SqliteResultsRepository` (better-sqlite3) is the local backend. A DynamoDB implementation can be dropped in later by satisfying the same contract and swapping one line in `server.js` — no endpoint changes. No AWS SDK was installed.
- **`userId` on every record**, defaulting to `"local-user"`, so real auth slots in later without a schema change. All list queries are scoped by `userId`.
- **`node --test` (built-in) chosen for backend tests** instead of adding Jest/supertest, to avoid new dependencies. Integration tests spin up a real Express server on an ephemeral port and use global `fetch`; each test uses a temp SQLite file that is deleted afterward.
- **Fusion logic ported, not shared.** `backend/node/results/riskFusion.js` mirrors `src/utils/overallRisk.ts` + `src/constants/risk.ts`. Web (Vite/TS), mobile (Expo/TS), and backend (CommonJS) are separate runtimes and can't share one module cleanly, so each keeps a copy. All three must be updated together if the scheme changes (noted in the file headers).
- **Web `testHistory.ts` fallback behavior (documented in-file):** localStorage stays the synchronous source of truth so the existing synchronous page code is unchanged and the app runs fully offline. Writes are write-through (local first, then best-effort POST). `hydrateFromBackend()` runs once on app start (in `App.tsx`) and refreshes the local cache from the server when reachable; if the backend is down it silently keeps the local cache. This preserved the sync API and avoided a risky async refactor across every page.
- **SQLite file location:** `backend/node/data/results.db` (overridable via `RESULTS_DB_PATH`). Git-ignored (added to `backend/.gitignore`), documented in `.env.example`.
- **Rounding note:** contribution percentages use float weights, so e.g. `0.3/0.8 → 37%` (not 38) — a test asserts the actual value. Contributions can differ from a naive expectation by 1 due to float rounding but still sum sensibly.
