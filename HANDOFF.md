# Handoff

Where the NeuroVoice rebuild stands on 15 Oct 2026, and what to pick up next. Read this
first, then [docs/PLAN.md](docs/PLAN.md) (architecture, decisions, what the video may
claim) and [README.md](README.md) (how to run it).

## Get it running locally

```bash
npm install
pip install -r ml/requirements.txt
npm run seed      # prints the demo accounts and their password
npm run dev       # API on :8787, web app on :5173
npm test
```

Everything runs locally without AWS. Only the companion (Bedrock, Transcribe, Polly)
needs AWS credentials. Without them it says plainly that it is offline.

## What is live on AWS

| | |
|---|---|
| Web app | https://main.d1mgnzefjdf9gr.amplifyapp.com |
| API | https://sd4q4s5ss3.execute-api.ap-south-1.amazonaws.com |
| Account / region | 615143732705, ap-south-1 (the companion's model is called in us-east-1) |
| Stack | `NeuroVoice` (CDK, `infra/stack.ts`) |

Checked live: the API health check, Cognito mode, unauthenticated requests refused, the
voice-analysis Lambda on a test recording, and the web app loading on Amplify.

Deploys are done by the IAM user `neurovoice`, which can only use the CDK deployment
roles and publish to this one Amplify app. Its key is **not** in this repository. To
deploy yourself, ask Shambhvi for your own IAM access, then follow "Live deployment" in
docs/PLAN.md.

## To do before the video (in order)

1. **Demo data in AWS.** The live site has no users. Sign up on it, or write a
   `seed:aws` script that creates the synthetic demo accounts in Cognito and DynamoDB
   (the local `npm run seed` story in `services/api/src/seed.ts` is the template). Keep
   everything labelled "Demo data".
2. **Test the companion end to end on the live site.** It works locally against
   Bedrock but has not had an authenticated call through the deployed Lambda yet.
3. **ffmpeg in the voice Lambda.** Browser WAV recordings work on AWS today. AAC (mobile)
   and Ogg (WhatsApp voice notes) need an ffmpeg binary added to the bundle built by
   `services/voice/build.py`.
4. **Real-device checks.** Face, finger tapping, gait and LSVT BIG (camera) and the
   voice recording screen have not been run on a real phone or laptop camera.
5. **Alerts.** Verify an SES sender address and set up SNS SMS so alerts leave the
   system (today they go to the in-app alerts feed).
6. **WhatsApp.** Point a Twilio WhatsApp sandbox at `<API>/webhooks/whatsapp`. The handler
   is built and tested; it has never been connected.
7. **Claude or Nova.** The companion runs on Amazon Nova Pro because the Anthropic use-case
   form has not been submitted in the Bedrock console. Submit it and set
   `BEDROCK_MODEL_ID` if we want Claude.
8. **Mobile on AWS.** The Expo app (`apps/mobile`) supports local sign-in only. Cognito
   sign-in, camera checks, spoken companion, trends, medication and sleep screens are not
   on mobile yet.
9. **Video shot list and script.** Not started. Stick to what PLAN.md section 6 says we
   can truthfully claim.

## Things that will bite you

- **Voice model accuracy is AUC 0.685** (0.64 from one recording). Do not put 0.96 or
  anything higher than 0.69 in the app, README or video; the old 0.96 came from label
  leakage. Details and reproduction: `ml/train_voice.py`, `ml/voice_metrics.json`.
- Monthly clinician summaries are written by code on purpose, not by the LLM.
- After changing dependencies, if the web app shows a blank page with "504 Outdated
  Optimize Dep", delete `apps/web/node_modules/.vite` and restart.
- The whole repo is pinned to one React version through root `overrides`; use
  `npx expo install` for Expo packages.
- The voice Lambda bundle is built to `~/.cache/neurovoice/voice-lambda`, outside the repo.
- The older code (Express + Python, no AWS) is on `main` of this repository. This rebuild
  shares no history with it.
