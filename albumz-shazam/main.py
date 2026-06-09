"""Tiny FastAPI sidecar that wraps shazamio for Albumz.

Albumz (Node) POSTs a raw audio blob (WebM/opus from browser MediaRecorder) to
POST /identify. We convert to mono 16kHz WAV with ffmpeg, hand it to shazamio,
and respond with {matched, artist, track, album, confidence} or {matched: false}.

Binds to 127.0.0.1 — only Albumz on the same box should reach this.
"""

import asyncio
import logging
import os
import subprocess
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from shazamio import Shazam

log = logging.getLogger("albumz-shazam")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

shazam = Shazam()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("albumz-shazam sidecar starting")
    yield
    log.info("albumz-shazam sidecar stopping")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/identify")
async def identify(request: Request):
    audio = await request.body()
    if len(audio) < 1000:
        return {"matched": False, "reason": "too-short"}

    src_path = wav_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as src:
            src.write(audio)
            src_path = src.name

        wav_path = src_path + ".wav"
        await _ffmpeg_to_wav(src_path, wav_path)

        result = await shazam.recognize(wav_path)
    except Exception:
        log.exception("identification failed")
        return {"matched": False, "reason": "error"}
    finally:
        for p in (src_path, wav_path):
            if p:
                Path(p).unlink(missing_ok=True)

    track = (result or {}).get("track")
    if not track:
        return {"matched": False}

    album = _extract_album(track)
    return {
        "matched": True,
        "artist": track.get("subtitle"),
        "track": track.get("title"),
        "album": album,
        "confidence": None,  # Shazam doesn't expose a numeric score
    }


async def _ffmpeg_to_wav(src: str, dst: str) -> None:
    """Run ffmpeg as an async subprocess. Mono, 16 kHz, 16-bit PCM WAV —
    what shazamio's downstream landmark fingerprinter expects."""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", src,
        "-ac", "1", "-ar", "16000", "-sample_fmt", "s16",
        dst,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {stderr.decode(errors='replace')[:200]}")


def _extract_album(track: dict) -> str | None:
    """The album lives in track.sections[*].metadata where title=='Album'.
    Order varies by track, so search every section."""
    for section in track.get("sections", []) or []:
        for item in section.get("metadata", []) or []:
            if item.get("title") == "Album":
                return item.get("text")
    return None


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "3210"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
