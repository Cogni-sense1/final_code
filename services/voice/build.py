"""Assemble the voice Lambda bundle (no Docker needed).

    python services/voice/build.py

Installs Linux wheels for the Lambda runtime regardless of the host OS. The bundle is
written outside the repository, to ~/.cache/neurovoice/voice-lambda (override with
NV_VOICE_BUILD), because file-sync tools such as Dropbox and OneDrive turn large build
folders into cloud placeholders that the AWS CDK cannot read.

For WhatsApp and mobile audio (Ogg, AAC) the function also needs ffmpeg: place a static
Linux x86_64 `ffmpeg` binary at <bundle>/bin/ffmpeg after running this. Browser
recordings are WAV and do not need it.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILD = Path(os.environ.get("NV_VOICE_BUILD") or Path.home() / ".cache" / "neurovoice" / "voice-lambda")


def main() -> None:
    kept_ffmpeg = None
    if (BUILD / "bin" / "ffmpeg").exists():
        kept_ffmpeg = (BUILD / "bin" / "ffmpeg").read_bytes()
    shutil.rmtree(BUILD, ignore_errors=True)
    BUILD.mkdir(parents=True)
    subprocess.run(
        [
            sys.executable, "-m", "pip", "install", "--quiet", "--target", str(BUILD),
            "--platform", "manylinux2014_x86_64", "--implementation", "cp", "--python-version", "3.12",
            "--only-binary=:all:", "-r", str(HERE / "requirements.txt"),
        ],
        check=True,
    )
    shutil.copytree(HERE / "neurovoice_voice", BUILD / "neurovoice_voice", ignore=shutil.ignore_patterns("__pycache__"))
    # pip adds Windows launcher stubs and metadata that the Lambda never uses.
    for junk in list(BUILD.rglob("__pycache__")) + list(BUILD.glob("*.dist-info")) + list(BUILD.rglob("tests")) + [BUILD / "bin"]:
        shutil.rmtree(junk, ignore_errors=True)
    if kept_ffmpeg:
        (BUILD / "bin").mkdir()
        (BUILD / "bin" / "ffmpeg").write_bytes(kept_ffmpeg)
    size = sum(f.stat().st_size for f in BUILD.rglob("*") if f.is_file()) / 1e6
    print(f"built {BUILD} ({size:.0f} MB unzipped; Lambda limit is 250 MB)")


if __name__ == "__main__":
    main()
