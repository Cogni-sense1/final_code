# NeuroVoice

Multimodal Parkinson's screening and monitoring. Short daily checks of voice, face, and
movement build a personal baseline, so a sustained change stands out early. A screening
and monitoring aid, not a diagnosis.

AIdeas finalist (Social Impact). Built by Yash Aggarwal and Shambhvi Sharma.

The full rebuild plan, architecture, and what the project can truthfully claim are in
[docs/PLAN.md](docs/PLAN.md).

## Run it locally

Needs Node 20+ and Python 3.11+. No AWS account, Docker, or ffmpeg required.

```bash
npm install
pip install -r ml/requirements.txt
npm run seed
npm run dev
```

Open http://localhost:5173. `npm run seed` prints four demo accounts (two patients, a
caregiver, a clinician) and their password. All seeded data is synthetic and is labelled
"Demo data" in the app.

| Command | What it does |
|---|---|
| `npm run dev` | API on :8787 and web app on :5173 |
| `npm test` | Shared-logic tests and end-to-end API tests (including the real voice pipeline) |
| `npm run typecheck` | Type-check every package |
| `npm run seed` | Reset local data to the demo story |
| `npm run job -- nightly` | Run a scheduled job locally: `nightly`, `sweep`, or `monthly [YYYY-MM]` |
| `npm run train` | Retrain the voice model and rewrite `ml/voice_metrics.json` |
| `npm run synth` | Synthesise the CloudFormation template (after `python services/voice/build.py`) |

The companion needs AWS: Bedrock for the conversation, Transcribe to hear, Polly to speak.
If AWS credentials are configured on your machine it uses them automatically, including
when running locally. Without them it says plainly that it is offline. Set `NV_AWS_AI=false`
to force that. See [.env.example](.env.example).

The mobile app: `npm run dev:mobile`, then open it in Expo Go or press `w` for the browser.
On a phone, set `EXPO_PUBLIC_API_URL` to your computer's address (for example
`http://192.168.1.20:8787`), because `localhost` on a phone is the phone.

## Layout

```
apps/web         React + Vite + Tailwind. Patient app, caregiver view, clinician dashboard.
apps/mobile      Expo (React Native). Voice and drawing checks, companion, today view.
packages/shared  Schemas, scoring, baselines, capture maths, typed API client. Used by every client.
services/api     Hono API. Runs on Lambda in AWS and as a Node server locally.
services/voice   Python: Praat features and recording quality. Lambda in AWS, subprocess locally.
infra            AWS CDK stack.
ml               Training script, dataset, and honest metrics.
docs             Plan and architecture.
```

## How it works

1. Each check produces plain numbers. Voice is measured by Praat on the server. Face,
   hands, and walking are measured in the browser with MediaPipe, and the video never
   leaves the device.
2. After five sessions of a check, a personal baseline exists (median and spread per
   measure).
3. Every later session is expressed as distance from that baseline, in the direction
   that means "worse". Sessions roll up into a daily index across checks.
4. An alert goes to the person and their care team only when most of the last ten active
   days sit above the baseline. One bad day never triggers it.
5. The companion is a real conversation on Amazon Bedrock. It remembers what the person
   tells it (they can see and delete every note), answers questions, looks up their own
   data, saves questions for the doctor, and can talk out loud through Transcribe and Polly.
   It does not diagnose or advise on medication.

## Deploying to AWS

```bash
python services/voice/build.py
cd infra
npx cdk bootstrap
npx cdk deploy -c webOrigin=https://YOUR_WEB_URL
```

`build.py` writes the voice Lambda bundle to `~/.cache/neurovoice/voice-lambda`, outside
the repository, so file-sync tools cannot interfere with it.

The stack creates the DynamoDB table, S3 audio bucket (encrypted, 30-day expiry), Cognito
user pool, HTTP API, the API and voice Lambdas, a Step Functions nightly workflow,
EventBridge schedules, and an Amplify app. Outputs include the API URL and Cognito IDs.
Build the web app with `VITE_API_URL` set to the API URL and upload `apps/web/dist` to the
Amplify app.

Before the first deploy, check these:

- **Bedrock**: the companion defaults to Amazon Nova Pro (`-c bedrockModel=...` to change).
  To use Claude, first submit the Anthropic use-case form under Model access in the
  Bedrock console; until then AWS refuses those models.
- **SES**: pass `-c sesFrom=you@yourdomain` with a verified sender, or email is skipped.
- **SMS**: SNS needs SMS enabled for India in your account (sandbox by default).
- **WhatsApp**: create a Secrets Manager secret `neurovoice/twilio` with keys `sid`,
  `token`, `from`, deploy with `-c whatsapp=true`, and point the Twilio sandbox webhook at
  the `WhatsAppWebhook` output.
- **Non-WAV audio** (WhatsApp, the mobile app): place a static Linux x86_64 `ffmpeg` at
  `~/.cache/neurovoice/voice-lambda/bin/ffmpeg` before deploying.

## The voice model, honestly

Logistic regression on 15 Praat features, trained on the public Sakar et al. 2013 dataset
(40 people, lab recordings). It scores a person from the average of their recent
recordings. Leave-one-subject-out AUC is **0.685 (95% CI 0.51 to 0.84)**, and 0.64 from a
single recording. That is modest, and it has not been validated on phone or WhatsApp
audio. The app treats it as secondary context and leads with change against the personal
baseline.

Two things this project got wrong before, both documented in `ml/train_voice.py`:

- An earlier version reported 0.96. That came from including the clinician-assigned UPDRS
  score as an input, which gives away the answer.
- Including "unvoiced time" and "voice breaks" gives 0.75, but in this dataset those two
  measure how tightly the clips were trimmed, which differs between the groups. They are
  left out.

## Data and privacy

- Consent is recorded with a version and timestamp before any health data is stored.
- A caregiver or clinician can see a person's data only through an invite code that
  person creates, and access can be revoked at any time. This is enforced in the API.
- Voice recordings are deleted after analysis unless the user opts in to keeping them.
- Users can export or permanently delete everything from the account page.
- Dataset: Sakar, B.E. et al. (2013), "Collection and Analysis of a Parkinson Speech
  Dataset with Multiple Types of Sound Recordings", UCI Machine Learning Repository,
  CC BY 4.0.
