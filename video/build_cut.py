"""Cut the re:Invent video from the existing NeuroVoice demo recording.

    python video/build_cut.py [--narration <audio>] ["<source.mp4>"] [out.mp4]

Produces a 1920x1080, 30 fps, H.264 cut. Without --narration it is silent and
timed to video/SCRIPT.md, for recording over. With --narration the clips are
retimed to the recorded voice-over (NARRATED below) and the audio is mixed in. Crop boxes are
fractions of the source frame, so the same script works on a higher-resolution
original of the recording.

Left out on purpose: the health-profile form (asks for UPDRS, the input that
leaked the label in the old model), every "% risk" result screen, and the
walking test's "Risk: High" panel.
"""
import pathlib, subprocess, sys
import imageio_ffmpeg

args = sys.argv[1:]
NARRATION = None
if args[:1] == ["--narration"]:
    NARRATION, args = args[1], args[2:]

FF = imageio_ffmpeg.get_ffmpeg_exe()
HERE = pathlib.Path(__file__).parent
SRC = args[0] if args else r"C:\Users\Shambhvi\Downloads\WhatsApp Video 2026-10-19 at 13.59.39.mp4"
OUT = pathlib.Path(args[1] if len(args) > 1 else HERE / ("neurovoice_final.mp4" if NARRATION else "neurovoice_cut.mp4"))
W, H, FPS = 1920, 1080, 30
REF_W, REF_H = 832, 464  # crop boxes below were measured on the 832x464 WhatsApp copy

PHONE = (282, 0, 270, 464)          # Android screen recording
PHONE_WIDE = (270, 0, 296, 464)     # finger-tap screen, slightly wider
PHONE_IOS = (308, 0, 218, 464)      # spiral drawing (iPhone recording)
CAMERA_WALK = (226, 90, 484, 272)   # camera view only; hides the "Risk" panel
CAMERA_BIG = (226, 80, 527, 296)

# (start s, end s, crop, kind, tag)
CLIPS = [
    (4.5, 12.5, PHONE, "phone", None),      # home screen
    (21.0, 35.0, PHONE, "phone", None),     # voice check: name, how are you feeling
    (36.0, 40.0, PHONE, "phone", None),     # voice check: "Nice and steady"
    (63.0, 70.5, PHONE, "phone", None),     # face check recording
    (87.0, 89.5, PHONE, "phone", None),     # face measures: blink rate, motion, symmetry
    (98.0, 104.0, PHONE_WIDE, "phone", None),  # finger tapping with hand tracking
    (119.5, 122.0, PHONE_IOS, "phone", None),  # spiral drawing
    (153.0, 160.0, CAMERA_WALK, "full", None),  # walking test, pose tracking
    (175.0, 186.0, CAMERA_BIG, "full", None),   # LSVT BIG game
    (191.0, 198.0, PHONE, "phone", "Demo data"),  # caregiver dashboard
    (200.0, 209.0, PHONE, "phone", "Demo data"),  # clinician dashboard
    (214.0, 217.5, PHONE, "phone", "HOLD"),   # profile, held for the sign-off
]

# Timed to "Standard recording 48" (82.6 s). Each cut lands just before the
# word that introduces the clip: "First, your voice" 8 s, "face check" 24.6 s,
# "Finger tapping" 33.2 s, "spiral" 34.3, "walking" 37.9, "LSVT" 46.4,
# caregiver dashboard under the AWS alerts line, "Caregivers and doctors" 67.9.
NARRATED = [
    (4.5, 12.5, PHONE, "phone", None),       #  0.0  intro
    (21.0, 35.0, PHONE, "phone", None),      #  8.0  problem, daily check-ins
    (36.0, 38.4, PHONE, "phone", None),      # 22.0  "you just talk"
    (63.0, 69.0, PHONE, "phone", None),      # 24.4  face check
    (87.0, 89.5, PHONE, "phone", None),      # 30.4  face measures
    (98.0, 101.0, PHONE_WIDE, "phone", None),   # 32.9  finger tapping
    (119.5, 121.3, PHONE_IOS, "phone", None),   # 35.9  spiral
    (153.0, 161.5, CAMERA_WALK, "full", None),  # 37.7  walking, baseline
    (174.5, 187.5, CAMERA_BIG, "full", None),   # 46.2  LSVT BIG, AWS services
    (191.0, 199.4, PHONE, "phone", "Demo data"),  # 59.2  caregiver, nightly alerts
    (200.0, 209.0, PHONE, "phone", "Demo data"),  # 67.6  "Caregivers and doctors", next
    (214.0, 217.5, PHONE, "phone", "HOLD"),  # 76.6  screening aid, thank you
]
if NARRATION:
    CLIPS = NARRATED


def scale_box(box, sw, sh):
    x, y, w, h = box
    fx, fy = sw / REF_W, sh / REF_H
    return int(x * fx) // 2 * 2, int(y * fy) // 2 * 2, int(w * fx) // 2 * 2, int(h * fy) // 2 * 2


def probe_size(path):
    r = subprocess.run([FF, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    import re
    m = re.search(r"Video: .*?, (\d{3,5})x(\d{3,5})", r)
    return int(m.group(1)), int(m.group(2))


def main():
    sw, sh = probe_size(SRC)
    font = HERE / "font.ttf"
    if not font.exists():
        font.write_bytes(pathlib.Path(r"C:\Windows\Fonts\segoeuib.ttf").read_bytes())
    parts, t = [], 0.0
    tmp = HERE / ".parts"
    tmp.mkdir(exist_ok=True)
    for i, (a, b, box, kind, tag) in enumerate(CLIPS):
        x, y, w, h = scale_box(box, sw, sh)
        crop = f"crop={w}:{h}:{x}:{y}"
        if kind == "phone":
            fh = 1000
            vf = (f"[0:v]{crop},split[a][b];"
                  f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=40:2,eq=brightness=-0.18[bg];"
                  f"[b]scale=-2:{fh}:flags=lanczos[fg];"
                  f"[bg][fg]overlay=(W-w)/2:(H-h)/2")
        else:
            vf = f"[0:v]{crop},scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H}"
        hold = 0.0
        if tag == "HOLD":
            tag, hold = None, (3.5 if NARRATION else 6.0)
            vf_hold = f",tpad=stop_mode=clone:stop_duration={hold}"
        else:
            vf_hold = ""
        if tag:
            vf += (f",drawtext=fontfile=video/font.ttf:text='{tag}':x=60:y=60:fontsize=34:"
                   "fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14")
        vf += f"{vf_hold},fps={FPS},format=yuv420p[v]"
        part = tmp / f"p{i:02d}.mp4"
        subprocess.run([FF, "-y", "-loglevel", "error", "-ss", str(a), "-t", str(b - a), "-i", SRC,
                        "-filter_complex", vf, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow",
                        "-crf", "16", str(part)], check=True, cwd=HERE.parent)
        parts.append(part)
        print(f"{t:5.1f}s  {b - a + hold:4.1f}s  source {a:6.1f}-{b:6.1f}")
        t += b - a + hold
    lst = tmp / "list.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in parts), encoding="utf-8")
    if not NARRATION:
        subprocess.run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-c", "copy", "-movflags", "+faststart", str(OUT)], check=True)
    else:
        # Voice: trim rumble, level to -16 LUFS (YouTube-friendly), pad to the video length.
        subprocess.run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-i", NARRATION, "-filter_complex",
                        f"[1:a]highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad,atrim=0:{t:.2f},"
                        f"afade=t=out:st={t - 0.6:.2f}:d=0.6[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                        "-movflags", "+faststart", str(OUT)], check=True)
    print(f"total {t:.1f}s -> {OUT}")


main()
