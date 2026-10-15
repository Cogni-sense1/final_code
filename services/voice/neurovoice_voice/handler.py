"""Entry points: AWS Lambda handler and a command-line runner used in local development.

    python -m neurovoice_voice.handler path/to/audio.wav
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from .features import extract_features


def _ffmpeg() -> str | None:
    return os.environ.get("FFMPEG_PATH") or shutil.which("ffmpeg")


def _is_wav(path: str) -> bool:
    with open(path, "rb") as f:
        head = f.read(12)
    return head[:4] == b"RIFF" and head[8:12] == b"WAVE"


def to_wav(path: str, workdir: str) -> str:
    """Decode anything that is not already WAV (WhatsApp sends Ogg/Opus, phones send M4A)."""
    if _is_wav(path):
        return path
    ffmpeg = _ffmpeg()
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to decode non-WAV audio")
    out = str(Path(workdir) / "decoded.wav")
    subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", "44100", out],
        check=True, timeout=30,
    )
    return out


def analyze(path: str) -> dict:
    with tempfile.TemporaryDirectory() as workdir:
        result = extract_features(to_wav(path, workdir))
    # Drop measures Praat could not compute so the payload is plain numbers.
    result["features"] = {k: v for k, v in result["features"].items() if v is not None}
    return result


def lambda_handler(event: dict, _context: object) -> dict:
    """Event: {"bucket": "...", "key": "..."}"""
    import boto3  # provided by the Lambda runtime

    with tempfile.TemporaryDirectory() as workdir:
        local = str(Path(workdir) / "input")
        boto3.client("s3").download_file(event["bucket"], event["key"], local)
        return analyze(local)


if __name__ == "__main__":
    try:
        print(json.dumps(analyze(sys.argv[1])))
    except Exception as exc:  # surfaced to the API as a clean error
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
