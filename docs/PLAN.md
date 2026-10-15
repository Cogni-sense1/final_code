# NeuroVoice rebuild plan

Target: a re:Invent video submission. Everything in the AIdeas article is built for real,
on a proper AWS foundation, runnable on a laptop first, and good-looking on camera.

## 1. Where the old code stands

| Area | Article says | Old repo has |
|---|---|---|
| Cloud | API Gateway, Lambda, Cognito, S3, DynamoDB, Transcribe, SageMaker, Step Functions, Bedrock, Polly, EventBridge, SES, SNS, Amplify | None. One Express server that shells out to Python. |
| Accounts | Patients, caregivers, doctors | No auth. Role is a localStorage flag. |
| Data | Longitudinal history | localStorage, last 50 tests, per browser. |
| Voice model | 0.65 AUC voice only, 0.96 with UPDRS | Three defects, below. |
| Dashboards, sleep, medication, network | Working modules | Hardcoded arrays. |
| Companion | Bedrock | Not present. |
| Web vs mobile | One product | Two copies of every screen and every formula. |

Voice model defects (all verified against the training CSV):

1. `ac`, `nth`, `htn` are acoustic measures (autocorrelation, noise-to-harmonics,
   harmonics-to-noise). The app sent "age 60+", "neuro history", "hypertension" as 0/1.
2. `updrs` was a feature. Every control has UPDRS 1 and every patient 5 or more, so it
   leaks the label. With it, leave-one-subject-out AUC is 1.00. That is the 0.96.
3. Training jitter/shimmer are in percent; inference produced fractions, about 100x off.

Fixed model: 15 Praat features that do not depend on recording length, clip trimming,
or speaker sex; no clinical inputs. It scores a person from the average of their recent
recordings, trained only on the two tasks the app records ("aaah" and a read sentence).
Leave-one-subject-out on 40 subjects: **AUC 0.685, 95% CI 0.51 to 0.84, permutation
p = 0.055.** From a single recording it is 0.64. See `ml/voice_metrics.json`; reproduce
with `python ml/train_voice.py`.

Two measures were deliberately left out. "Unvoiced time" and "voice breaks" lift the AUC
to 0.75 on this dataset, but the dataset's clips are tightly trimmed 1.5-second segments,
so those measures reflect a few frames of edge trimming that differs between the groups.
That is recording procedure, not voice, and it would not carry to a 6-second phone
recording. The app still tracks both against each person's own baseline, after trimming
silence from the ends of the recording.

The real route to a better model is more data with raw audio, ideally phone-quality,
processed through the same extractor the app uses.

## 2. Product decision that follows from the model

A 0.69 AUC model cannot carry the product as a one-shot "risk score", and the video
should not claim it does. The honest and stronger story is the one the article already
tells: **change against your own baseline over time.**

- Every assessment stores raw features, not just a score.
- After 5 sessions of a modality a personal baseline exists (median and MAD per feature).
- The headline number is a deviation index per modality and a composite across modalities.
- A flag is raised only on sustained drift (most of the last 10 days), never one bad day.
- The population voice model is shown as secondary context, labelled with its real accuracy.
- Wording everywhere is "screening signal, not a diagnosis".

## 3. Architecture

```
apps/web        React + Vite + Tailwind PWA   patient app, caregiver view, clinician dashboard
apps/mobile     Expo                           same API, shared logic
packages/shared TypeScript                     schemas, scoring, baselines, API client
services/api    TypeScript (Hono)              one codebase: Lambda on AWS, Node locally
services/voice  Python (Praat)                 feature extraction and quality checks; Lambda on AWS, subprocess locally
infra           AWS CDK                        everything below as code
ml              Python                         training and evaluation
```

Every cloud dependency sits behind a small interface with an AWS adapter and a local one:

| Concern | AWS | Local |
|---|---|---|
| HTTP | API Gateway HTTP API -> Lambda | Node server |
| Auth | Cognito user pool, groups = roles | Dev JWT issuer (disabled in prod) |
| Data | DynamoDB single table + 1 GSI | JSON file behind the same five-method interface |
| Audio | S3, presigned uploads, SSE, lifecycle expiry | Local folder |
| Voice analysis | Python Lambda (Praat + ffmpeg); scoring in the API from recent recordings | Python subprocess |
| Companion, summaries | Amazon Bedrock, Converse API. The model is a setting: Amazon Nova Pro by default, Claude once the account's Anthropic form is submitted | The same Bedrock call when AWS credentials exist; otherwise it says plainly that it is offline |
| Hearing the user | Amazon Transcribe (streaming) | Same, with credentials |
| Speaking | Amazon Polly (neural, Indian English and Hindi) | Same, with credentials; otherwise the device voice |
| Daily consolidation | Step Functions (fan out per user) | Direct function call |
| Schedules | EventBridge rules: nightly consolidation, missed-dose sweep, monthly reports | `npm run job` |
| Alerts | SNS (SMS) + SES (email) | Written to the alerts feed and console |
| Hosting | Amplify Hosting | Vite dev server |
| WhatsApp | Twilio webhook -> API Gateway (AWS End User Messaging is the native option later) | Same route via tunnel |

Why not SageMaker endpoints: the voice model is a 15-coefficient logistic regression.
It runs inside the API at no extra cost. SageMaker belongs in the
story for training and for the heavier pose model later, and the plan keeps that seam.

### Data model (DynamoDB single table)

| PK | SK | Item |
|---|---|---|
| `USER#id` | `PROFILE` | profile, role, consent, Hoehn & Yahr stage |
| `USER#id` | `ASSESS#ts#id` | one assessment: type, features, score, quality, channel |
| `USER#id` | `BASELINE#type` | per-feature median and MAD |
| `USER#id` | `DAY#date` | consolidated daily profile and flags |
| `USER#id` | `MED#id`, `DOSE#ts#id` | medications, dose logs with on/off state |
| `USER#id` | `SLEEP#date`, `DYST#ts` | sleep entries, dystonia episodes |
| `USER#id` | `CHAT#ts`, `CHECKIN#date` | companion messages, extracted daily context |
| `USER#id` | `MEM#ts#id` | what the companion remembers, and questions saved for the doctor |
| `USER#id` | `LINK#otherId` | consented care link (both directions) |
| `USER#id` | `ALERT#ts`, `REPORT#month` | alerts, monthly summaries |
| `GROUP#id` | `MSG#ts#id` | peer group messages |
| GSI1 | | phone number -> user (WhatsApp), invite code -> patient |

### Privacy and safety built in

- Explicit consent recorded with version and timestamp before any capture (DPDP Act 2023).
- Caregivers and clinicians see a patient only through an invite the patient accepts,
  and the patient can revoke it. Enforced in the API, not the UI.
- Face, hand, and pose video never leaves the device. Only derived numbers are uploaded.
- Audio is encrypted at rest and auto-deleted after 30 days; features are kept.
- Export-my-data and delete-my-account endpoints.
- The companion is instructed not to diagnose or advise on medication changes.
- Everything the companion remembers is listed in the app and can be deleted one item at
  a time. It can delete a note only when the person's own message asks it to. Personal
  notes stay private; only questions saved for the doctor are visible to a linked clinician.

## 4. Feature map

| Module | Capture | Where scored | Status after rebuild |
|---|---|---|---|
| Voice | Sustained "aah" + sentence, WAV in browser | Python Lambda | real |
| Face | 30 s MediaPipe: blink rate, expressivity, asymmetry | on device, validated server-side | real |
| Finger tapping | MediaPipe hands: rate, rhythm, amplitude decay, fatigue | on device | real |
| Spiral, wave, clock | Touch/pointer strokes | on device | real |
| Gait walking test | MediaPipe pose vs own baseline | on device | real |
| LSVT BIG | Pose amplitude, live feedback, game score | on device | real |
| Medication | Schedule, dose log, on/off timeline, off-period detection, caregiver alert | API | real |
| Sleep and physiology | Manual log + CSV import, RBD indicators, dystonia log | API | real (no wearable integration; import only) |
| Companion | Spoken or typed conversation, long-term memory, answers questions, looks up the person's own data, saves doctor questions and the day's check-in | Bedrock + Transcribe + Polly | real |
| Peer network | Groups by Hoehn & Yahr stage, pseudonymous chat | API | real (polling; WebSocket later) |
| Caregiver, clinician | Linked patients, trends, alerts, monthly summary written from the data, questions the patient saved for the doctor | API | real |
| WhatsApp | Voice note in, result and trend out, consent first | API | real (Twilio sandbox) |

## 5. Build order

| # | Step | Status (12 Oct 2026) |
|---|---|---|
| 1 | Foundation: monorepo, shared package, corrected voice service | Done, tested |
| 2 | API: auth, data layer, every module, jobs | Done, 26 end-to-end tests |
| 3 | Infrastructure: CDK stack | Deployed 15 Oct 2026 to account 615143732705, ap-south-1, by the `neurovoice` IAM user. API, Cognito, DynamoDB, S3, Lambdas (voice analysis checked live), Step Functions, schedules, Amplify web app. |
| 4 | Web app: patient flows, all eight checks, dashboards | Built. Sign-in, home, trends, medication, all three drawing checks, companion (typed and spoken), and clinician dashboard verified in a browser. Camera checks and the voice-check recording screen still need a run on a real device. |
| 5 | Companion: real conversation, memory, lookups, voice | Done and verified live against Bedrock, Transcribe, and Polly. A spoken turn takes about 4 to 5 seconds. |
| 6 | WhatsApp: consent flow, voice notes, TREND / LINK / DELETE | Built, tested at the handler. Not yet connected to Twilio. |
| 7 | Demo data: synthetic accounts with a six-week story | Done (`npm run seed`) |
| 8 | Mobile: Expo app (SDK 57) on the shared package | Started. Sign-in, consent, today, checks list, spiral / wave / clock drawing, voice check, companion chat with read-aloud, account. Bundles for Android and web. Sign-in, today, companion, and the spiral check verified in a browser build; nothing has run on a physical phone yet. Not on mobile yet: camera checks, Cognito sign-in, spoken conversation, trends, medication and sleep screens. |
| 9 | Sign in through Cognito on the live site, seed demo data in AWS, tune thresholds on real captures | Not started |
| 10 | Video shot list | Not started |

Decisions made along the way:

- **Monthly summaries are written by code, not by a language model.** A clinician reads
  them, and in testing the model twice filed a check under the wrong heading. The AI is
  used only in the companion, where the person is in the conversation.
- **Impossible readings are refused by the API** (for example a drawing error larger than
  the canvas), so a capture fault on any client cannot reach someone's trend.
- **Build outputs live outside the repository** (`~/.cache/neurovoice`), because Dropbox
  turned the Lambda bundle into cloud placeholders that the AWS CDK could not read.
  The repository was moved out of Dropbox to `C:\Users\Shambhvi\Neurovoice rebuild`
  for development (Desktop shortcut). It goes back to Dropbox, source only, when the
  project is finished.

Known limits of the companion today:

- The Anthropic use-case form has not been submitted on the AWS account, so Claude models
  are refused; the companion runs on Amazon Nova Pro. To switch, submit the form in the
  Bedrock console and set `BEDROCK_MODEL_ID`.
- Speech is transcribed after the person stops talking, not live. Streaming from the
  browser straight to Transcribe would cut about two seconds per turn.
- SageMaker from the article is not used. See the note above.

## 6. What the video can truthfully claim

- Runs on the AWS services listed, deployed from code.
- Multimodal capture with on-device privacy for video.
- Personal-baseline trend tracking across modalities.
- A companion that converses, remembers, and answers questions, on Bedrock, Transcribe, and Polly.
- Voice model: 0.69 AUC on public lab data (0.64 from one recording), not yet validated on phone audio.

What it must not claim: diagnosis, clinical validation, the 0.96 figure, a voice AUC above
0.69, or HIPAA compliance.

## Live deployment

| | |
|---|---|
| Web app | https://main.d1mgnzefjdf9gr.amplifyapp.com |
| API | https://sd4q4s5ss3.execute-api.ap-south-1.amazonaws.com |
| Region | ap-south-1 (Mumbai); the companion's model is called in us-east-1 |
| Deploys as | IAM user `neurovoice`, local AWS profile `neurovoice`. It can only assume the CDK deployment roles and publish to this one Amplify app. |

Redeploy the backend:

```bash
cd infra
npx cdk deploy --profile neurovoice -c webOrigin=https://main.d1mgnzefjdf9gr.amplifyapp.com
```

Republish the web app: build `apps/web` with `VITE_API_URL` set to the API address, zip
`dist`, then `aws amplify create-deployment` / upload / `start-deployment` with
`--profile neurovoice --app-id d1mgnzefjdf9gr --branch-name main`.

Everything in the stack is pay-per-use. The DynamoDB table, audio bucket and user pool are
kept if the stack is deleted, so data is not lost by accident.
