# CogniSense / NeuroVoice

A multimodal **Parkinson's screening** prototype. A user completes short at-home
tests (voice, face, finger-tap); the app produces a risk score per test, fuses
them into an overall risk figure, and tracks the trend over time.

> ⚠️ **This is a screening aid and research prototype, not a medical device or a
> diagnosis.** Numbers here are decision-support signals, not clinical results.

This README describes **what is actually implemented today** and separates it
from the **planned/aspirational architecture** (see the Roadmap section). The
goal is an honest map of the codebase.

---

## What's implemented today

### Web app (`src/`) — Vite + React + TypeScript + shadcn-ui + Tailwind
- **Voice screening test** — records audio, sends it to the backend, and shows
  the ML model's risk score/level. This is the one modality backed by a trained
  model.
- **Face test** and **finger-tap test** — run in-browser using MediaPipe
  landmarks with **rule-based, hand-tuned** scoring (not ML-trained, not
  clinically validated).
- **Multimodal fusion** (`src/utils/overallRisk.ts`) — averages within each
  modality first (removes test-frequency bias), then combines with confidence
  weights (voice 0.5, face 0.3, finger-tap 0.2), renormalizing when a modality
  is missing. Weights/thresholds live in `src/constants/risk.ts`.
- **Unified risk thresholds** — Low `< 0.30`, Medium `0.30–0.66`, High `> 0.66`;
  `0.30` is a deliberate sensitivity-first screening cutoff.
- **Insights & History** — real data from the user's own tests (localStorage,
  synced to the backend when reachable), including the fusion breakdown UI.
- **Interactive movement exercises** — Walking test and LSVT BIG (gamified
  MediaPipe pose activities).

### Mobile app (`neurovoice-mobile/`) — Expo / React Native
- Parallel implementation of the voice, face, finger-tap, and drawing tests
  with local persistence (`utils/storage.ts`) and the same risk thresholds
  (`constants/risk.ts`). Backend URL via `EXPO_PUBLIC_BACKEND_URL`.

### Backend (`backend/`)
- **Node/Express API** (`backend/node/server.js`):
  - `POST /predict` — accepts audio, converts it with **ffmpeg**, runs the
    Python model, returns `{ risk_score, risk_level }`.
  - `POST /api/results`, `GET /api/results` (filter by modality/date), and
    `GET /api/overall-risk` (server-side fusion). Persisted in **SQLite** via a
    repository interface (`ResultsRepository` → `SqliteResultsRepository`)
    designed so a cloud store can be swapped in later without touching routes.
  - `POST /whatsapp` — a Twilio WhatsApp webhook that screens a voice note.
- **Python inference** (`backend/python/inference.py`) — a **calibrated
  Logistic Regression v4** model over Praat-extracted voice features
  (jitter/shimmer/pitch/etc.). Model + feature list live in
  `backend/python/model/`.
- **Model evaluation** — `backend/python/evaluate_model_v4.py` (read-only)
  reproduces the patient-grouped hold-out and reports metrics to
  `model_evaluation.md`.

### Demo / placeholder UI (uses mock data — not wired to real data yet)
Clearly flagged so nobody mistakes these for working features:
- **Doctor dashboard**, **Caregiver dashboard** — mock patient lists.
- **Medication tracking**, **Sleep monitoring**, **Patient network** — seeded
  with sample data for UI demonstration.

### Containerization prep
- `backend/Dockerfile` + `backend/.dockerignore` bundle Node + Python + ffmpeg +
  model files into one image. **Authored but not yet built/verified.**

---

## Running locally

**Prerequisites:** Node.js + npm, Python 3.11, and `ffmpeg` on your PATH.

```sh
# 1. Web app
npm install
npm run dev            # dev server
npm run build          # production build
npm run test           # unit tests (vitest)

# 2. Backend — Python model deps
cd backend/python
pip install -r requirements.txt

# 3. Backend — Node API (serves /predict and /api/*)
cd ../node
npm install
npm start              # listens on PORT (default 5050)
npm test               # backend tests (node --test)
```

Configure the web app's backend URL with `VITE_API_BASE_URL` (defaults to
`http://localhost:5050`). See `.env.example`. If the backend is unreachable the
web app falls back to localStorage so it still works in demo mode.

### Mobile (Expo)
```sh
cd neurovoice-mobile
npm install            # (use --legacy-peer-deps if peer versions conflict)
npm start
```

---

## Tech stack

| Layer | Stack |
|---|---|
| Web | Vite, React, TypeScript, shadcn-ui, Tailwind CSS |
| Mobile | Expo, React Native |
| Backend API | Node.js, Express |
| Inference | Python, scikit-learn (calibrated LogisticRegression), Praat/parselmouth, librosa |
| Storage | SQLite (better-sqlite3), browser localStorage |
| Messaging | Twilio (WhatsApp webhook) |

---

## Planned architecture / Roadmap (NOT implemented)

Everything in this section is **aspirational / future work**. None of it is
wired up in the current codebase — it is recorded here to capture the intended
direction, not to describe existing behavior.

- **Cloud model serving:** a **SageMaker** ensemble (beyond the single
  Logistic Regression) for multimodal scoring.
- **Serverless pipeline:** **AWS Lambda** + **Step Functions** to orchestrate
  ingestion → feature extraction → inference → persistence.
- **Generative assistance:** **Amazon Bedrock** for patient/clinician-facing
  natural-language summaries and guidance.
- **Federated learning:** on-device training so raw audio/video never leaves
  the user's device.
- **Managed, cloud-scale persistence:** replace SQLite with a cloud store
  (e.g. DynamoDB) behind the existing `ResultsRepository` interface, plus real
  user authentication (the current `userId` is a fixed `"local-user"`
  placeholder).
- **Compliance:** **HIPAA** (US) and **DPDP** (India) alignment — data
  handling, audit, consent, and retention controls.
- **Clinical validation:** validate the face and finger-tap rule-based scores
  (currently heuristic) and expand the voice dataset beyond its current small
  subject count.

---

## Repository layout

```
src/                     Web app (React)
neurovoice-mobile/       Mobile app (Expo)
backend/node/            Express API + results persistence (SQLite)
backend/python/          v4 model, inference, training, evaluation
backend/Dockerfile       Backend container image (unbuilt)
model_evaluation.md      Read-only v4 model metrics
DECISIONS.md             Log of engineering decisions/judgment calls
SUMMARY.md               Session-by-session change summary
```
