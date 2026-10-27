"""Join the voice-over takes, cut long pauses, and write word timings.

    python video/narration.py <take1> <take2> ...

Writes video/narration.wav (48 kHz, levelled to -16 LUFS) and
video/narration_words.json with each word's time in the edited audio.
Pauses longer than MAX_GAP are shortened to GAP; leading and trailing silence
is removed.
"""
import json, pathlib, subprocess, sys
import imageio_ffmpeg
from faster_whisper import WhisperModel

FF = imageio_ffmpeg.get_ffmpeg_exe()
HERE = pathlib.Path(__file__).parent
TMP = HERE / ".parts"
TMP.mkdir(exist_ok=True)
MAX_GAP, GAP, PAD = 1.0, 0.5, 0.15   # seconds: only pauses of a second or more are shortened

model = WhisperModel("small", device="cpu", compute_type="int8")
keep, words_out, t_out = [], [], 0.0
for n, take in enumerate(sys.argv[1:]):
    wav = TMP / f"take{n}.wav"
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", take, "-ac", "1", "-ar", "48000", str(wav)], check=True)
    segs, _ = model.transcribe(str(wav), language="en", word_timestamps=True, vad_filter=False)
    words = [w for s in segs for w in s.words]
    # Group words into runs of speech separated by pauses longer than MAX_GAP.
    runs, cur = [], [words[0]]
    for w in words[1:]:
        if w.start - cur[-1].end > MAX_GAP:
            runs.append(cur)
            cur = [w]
        else:
            cur.append(w)
    runs.append(cur)
    for r in runs:
        a, b = max(0.0, r[0].start - PAD), r[-1].end + PAD
        if keep:
            t_out += GAP
        keep.append((n, a, b, t_out))
        for w in r:
            words_out.append({"w": w.word.strip(), "s": round(t_out + w.start - a, 2), "e": round(t_out + w.end - a, 2)})
        t_out += b - a

# One filter graph: trim each run, put a short silence between runs, concatenate.
inputs, chains, labels = [], [], []
for n, take in enumerate(sys.argv[1:]):
    inputs += ["-i", str(TMP / f"take{n}.wav")]
for i, (n, a, b, _) in enumerate(keep):
    chains.append(f"[{n}:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b - a - 0.03:.3f}:d=0.03[s{i}]")
    labels.append(f"[s{i}]")
    if i < len(keep) - 1:
        chains.append(f"anullsrc=r=48000:cl=mono,atrim=0:{GAP}[g{i}]")
        labels.append(f"[g{i}]")
graph = ";".join(chains) + ";" + "".join(labels) + f"concat=n={len(labels)}:v=0:a=1,highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]"
subprocess.run([FF, "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[out]", str(HERE / "narration.wav")], check=True)
(HERE / "narration_words.json").write_text(json.dumps(words_out, indent=0), encoding="utf-8")
print(f"{len(keep)} speech runs, {t_out:.1f} s")
line, start = [], None
for w in words_out:
    start = w["s"] if start is None else start
    line.append(w["w"])
    if w["w"].endswith((".", ",", "?")):
        print(f"{start:5.1f}  {' '.join(line)}")
        line, start = [], None
if line:
    print(f"{start:5.1f}  {' '.join(line)}")
