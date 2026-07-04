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

## Other notes
- (filled in as needed)
