"""Final re:Invent video: intro card, full-frame clips timed to the voice-over, end card.

    python video/narration.py <take1> <take2>     # once per new voice-over
    python video/edit.py ["<source.mp4>"]

Reads video/narration.wav, writes video/neurovoice_final.mp4 (1920x1080, 30 fps).
Clips are shown full frame, not cropped. Source 25.7-36.7 s is avoided: the
screen recording freezes there.
"""
import math, pathlib, subprocess, sys
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FF = imageio_ffmpeg.get_ffmpeg_exe()
HERE = pathlib.Path(__file__).parent
TMP = HERE / ".parts"
TMP.mkdir(exist_ok=True)
SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Shambhvi\Downloads\WhatsApp Video 2026-10-19 at 13.59.39.mp4"
OUT = HERE / "neurovoice_final.mp4"
W, H, FPS = 1920, 1080, 30
FONTS = pathlib.Path(r"C:\Windows\Fonts")

INTRO, OUTRO = 6.5, 5.0
# (source start, source end, what the voice-over says over it). Timed to the
# narration with only the 1 s+ pauses shortened (78.3 s).
CLIPS = [
    (4.5, 13.0, "Parkinson's is usually diagnosed years after..."),            #  6.5
    (172.2, 174.1, "a few minutes of daily checks"),                           # 15.0
    (14.0, 15.6, "...on your phone"),                                          # 16.9
    (21.0, 24.4, "First, your voice. You just talk"),                          # 18.5
    (46.6, 48.3, "pitch stability and jitter (voice result)"),                 # 21.9
    (63.0, 67.3, "Then a face check. Blink rate, expressiveness, symmetry"),   # 23.6
    (84.5, 86.2, "measured on the device (face result)"),                      # 27.9
    (87.2, 88.9, "...never leaves your phone (face measures)"),                # 29.6
    (98.0, 100.6, "Finger tapping and spiral drawing"),                        # 31.3
    (119.5, 121.8, "measure speed, rhythm and tremor"),                        # 33.9
    (153.0, 155.6, "And a walking test tracks gait"),                          # 36.2
    (114.0, 115.6, "Every check builds your personal baseline (tap result)"),  # 38.8
    (124.0, 125.6, "(spiral result)"),                                         # 40.4
    (167.0, 168.9, "(walking result)"),                                        # 42.0
    (58.4, 60.0, "not one bad day (risk trend)"),                              # 43.9
    (175.0, 188.4, "LSVT BIG as a game. We built it on AWS..."),               # 45.5
    (189.2, 190.8, "(LSVT session result)"),                                   # 58.9
    (191.0, 195.1, "...nightly baselines and alerts (caregiver dashboard)"),   # 60.5
    (200.0, 209.8, "Caregivers and doctors... Next, we're testing"),           # 64.6
    (214.0, 217.8, "screening aid, not a diagnosis. Thank you"),               # 74.4
]

INK, DIM, ORANGE, BG = (255, 255, 255), (178, 184, 204), (242, 107, 58), (13, 16, 30)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def backdrop():
    img = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(glow)
    d.ellipse([W * 0.18, H * 0.05, W * 0.82, H * 1.05], fill=(70, 34, 30))
    return Image.blend(img, glow.filter(ImageFilter.GaussianBlur(220)), 1.0)


def mark(d, cx, cy, size, phase):
    r = size // 2
    d.rounded_rectangle([cx - r, cy - r, cx + r, cy + r], radius=size // 4, fill=ORANGE)
    n, bw = 7, size // 14
    for i in range(n):
        x = cx - (n - 1) * bw + i * 2 * bw
        h = size * (0.16 + 0.26 * (0.5 + 0.5 * math.sin(phase + i * 0.9)) * (1 - abs(i - 3) / 5))
        d.rounded_rectangle([x - bw // 2, cy - h, x + bw // 2, cy + h], radius=bw // 2, fill=INK)


def centred(d, y, text, f, fill):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)


def card(path, seconds, lines):
    base = backdrop()
    title, sub, small = font("segoeuib.ttf", 150), font("segoeuil.ttf", 50), font("segoeui.ttf", 34)
    p = subprocess.Popen([FF, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "14",
                          "-pix_fmt", "yuv420p", str(path)], stdin=subprocess.PIPE)
    frames = int(seconds * FPS)
    for k in range(frames):
        t = k / FPS
        img = base.copy()
        d = ImageDraw.Draw(img)
        mark(d, W // 2, 330, 190, t * 5)
        centred(d, 455, "NeuroVoice", title, INK)
        for j, (text, fnt, col) in enumerate(lines(sub, small)):
            a = min(1.0, max(0.0, (t - 0.5 - 0.35 * j) / 0.5))   # lines appear one after another
            c = tuple(int(BG[i] + (col[i] - BG[i]) * a) for i in range(3))
            centred(d, 660 + 90 * j, text, fnt, c)
        fade = min(1.0, t / 0.4, (seconds - t) / 0.4)
        if fade < 1:
            img = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), img, max(0.0, fade))
        p.stdin.write(img.tobytes())
    p.stdin.close()
    p.wait()


def clip(path, a, b):
    vf = (f"fps={FPS},scale={W}:{H}:force_original_aspect_ratio=decrease:flags=lanczos,"
          f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1")
    vf += ",format=yuv420p"
    subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{a}", "-t", f"{b - a:.3f}", "-i", SRC, "-vf", vf,
                    "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "14", str(path)], check=True)


def main():
    parts = [TMP / "intro.mp4"]
    card(parts[0], INTRO, lambda sub, small: [
        ("Daily voice, face and movement checks for Parkinson's", sub, DIM),
        ("Shambhvi Sharma  Â·  Yash Aggarwal  Â·  India", small, ORANGE),
    ])
    t = INTRO
    for i, (a, b, note) in enumerate(CLIPS):
        p = TMP / f"c{i:02d}.mp4"
        clip(p, a, b)
        parts.append(p)
        print(f"{t:5.1f}s  {b - a:4.1f}s  src {a:6.1f}-{b:6.1f}  {note}")
        t += b - a
    parts.append(TMP / "outro.mp4")
    card(parts[-1], OUTRO, lambda sub, small: [
        ("A screening aid, not a diagnosis  ·  Built on AWS", sub, DIM),
        ("Shambhvi Sharma   linkedin.com/in/shambhvi-sharma-9514b6324", small, ORANGE),
        ("Yash Aggarwal   linkedin.com/in/yash-aggarwal-cs", small, ORANGE),
    ])
    t += OUTRO
    lst = TMP / "final.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in parts), encoding="utf-8")
    subprocess.run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-i", str(HERE / "narration.wav"), "-filter_complex",
                    f"[1:a]apad,atrim=0:{t:.2f},aformat=channel_layouts=stereo[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-movflags", "+faststart", str(OUT)], check=True)
    print(f"total {t:.1f}s -> {OUT}")


main()
