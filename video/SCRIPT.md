# re:Invent video: script and cut

The cut is `video/neurovoice_cut.mp4`: 88 seconds, 1920x1080, landscape, no sound. It is
made from the existing demo recording by `video/build_cut.py`. Read the lines below over
it with your webcam in the corner.

Speaker: Yash (the email is addressed to him, and the app on screen says "yash").
At a relaxed pace this script is about 205 words, roughly 85 seconds.

| Time | On screen | Say |
|---|---|---|
| 0:00 – 0:08 | Home screen | Hi, I'm Yash Aggarwal from Patiala, India. With my teammate Shambhvi Sharma, I built NeuroVoice. |
| 0:08 – 0:26 | Voice check | Parkinson's is usually diagnosed years after the first changes in someone's voice, face and movement, because nobody measures them between doctor visits. NeuroVoice is a few minutes of daily checks on your phone. First, your voice: you just talk, and we measure things like pitch stability and jitter. |
| 0:26 – 0:36 | Face check | Then a face check: blink rate, expressiveness and symmetry. It's measured on the device, so the video never leaves your phone. |
| 0:36 – 0:51 | Finger tapping, spiral, walking | Finger tapping and a spiral drawing measure speed, rhythm and tremor, and a walking test tracks gait. Every check builds your personal baseline, so we flag a lasting change from your own normal, not one bad day. |
| 0:51 – 1:02 | LSVT BIG game | There's LSVT BIG physiotherapy as a game, too. We built it on AWS: Cognito for sign-in, API Gateway and Lambda, DynamoDB and S3 for the data, |
| 1:02 – 1:18 | Caregiver, then doctor dashboard ("Demo data") | Amazon Bedrock, Transcribe and Polly for a companion you can actually talk to, and Step Functions and EventBridge for nightly baselines and alerts. Caregivers and doctors see the trends, but only for patients who invite them. |
| 1:18 – 1:28 | Profile (held) | Next, we're testing with real users and collecting phone recordings to make the voice model better. It's a screening aid, not a diagnosis. Find me on LinkedIn, Yash Aggarwal. Thanks! |

Check before recording:

- **Location.** "Patiala" assumes Thapar; change it if Yash is somewhere else.
- **Kiro.** The repo has `kiro/...` branches. If you did use Kiro, the email asks you to say so. Add
  "We planned and built the first version with Kiro" at 0:51, and cut "too" to make room.
- **Social link.** Swap in the handle you actually want people to follow.

## What was left out of the old footage, and why

- **The health-profile form (0:13–0:20 in the original).** It asks for UPDRS score and
  hypertension. UPDRS was the input that leaked the answer into the old model.
- **Every "% / High risk" result screen** (the 89%, 26%, 60%, 50%), the "consult a
  neurologist" message, and the walking test's "Risk: High" panel, which is cropped out. These
  came from the old model and would read as a diagnosis.
- **The dashboards show made-up patients,** so they carry a "Demo data" label.

Nothing in the script claims an accuracy figure, a diagnosis, or clinical validation.

## Recording it (pick one)

**A. OBS, one take (simplest).**
1. Create a 1920x1080 scene.
2. Add the cut as a Media Source, full screen.
3. Add your webcam as a Video Capture Device, about 400x225 in the bottom-right corner. Keep
   the phone screens clear; they sit in the middle.
4. Add your mic. In Settings, set Output to mp4 and Video to 1920x1080.
5. Start recording, start the media, and read along.

**B. Record yourself separately.**
Record the webcam and voice in the Windows Camera app while the cut plays on another screen.
Send me that file and I'll put it in the corner, line the audio up, and export one mp4. The
email says separate tracks are welcome, so also keep the raw webcam file.

## Before you send it

- **Resolution.** The WhatsApp copy is only 832x464, so the cut is upscaled and looks soft.
  If whoever edited the original demo still has the full-resolution export, rerun the cut on it:
  `python video/build_cut.py "<original.mp4>"`. The crops scale automatically.
- Good light on your face, a quiet room, and a headset mic if you have one.
- Upload to YouTube as Unlisted and reply to the email with the link. Keep the original file;
  they'll ask for it later through Box.

## Narrated version

`neurovoice_final.mp4` (83.6 s, 1080p, voice at -16 LUFS) is the cut retimed to the recorded
voice-over "Standard recording 48". Rebuild it with:
`python video/build_cut.py --narration "<recording>"`. The retimed clip list is `NARRATED`
in `build_cut.py`.
