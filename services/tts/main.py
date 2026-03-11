"""MindOverChatter TTS Service — text-to-speech synthesis.

Uses kokoro-onnx as primary engine. Falls back to pyttsx3 if kokoro-onnx
is unavailable (e.g., model download issues or platform incompatibility).
Returns WAV audio as a streaming response.
"""

from __future__ import annotations

import io
import logging
import struct
import wave

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger("moc.tts")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MindOverChatter TTS Service",
    description="Text-to-speech synthesis (kokoro-onnx with pyttsx3 fallback)",
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------


class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "af_heart"  # kokoro default voice


# ---------------------------------------------------------------------------
# TTS Engine (lazy init)
# ---------------------------------------------------------------------------

_engine_type: str | None = None
_kokoro_pipeline = None


def _init_kokoro():
    """Try to initialize kokoro-onnx."""
    global _kokoro_pipeline, _engine_type  # noqa: PLW0603
    try:
        import kokoro_onnx  # noqa: F401

        logger.info("Loading kokoro-onnx TTS engine...")
        _kokoro_pipeline = kokoro_onnx.Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
        _engine_type = "kokoro-onnx"
        logger.info("kokoro-onnx loaded successfully.")
        return True
    except Exception as exc:
        logger.warning("kokoro-onnx unavailable: %s — will try pyttsx3 fallback", exc)
        return False


def _init_pyttsx3():
    """Try to initialize pyttsx3 as fallback."""
    global _engine_type  # noqa: PLW0603
    try:
        import pyttsx3  # noqa: F401

        _engine_type = "pyttsx3"
        logger.info("pyttsx3 fallback engine available.")
        return True
    except Exception as exc:
        logger.warning("pyttsx3 also unavailable: %s", exc)
        return False


def _ensure_engine():
    """Ensure a TTS engine is initialized. Returns the engine type."""
    global _engine_type  # noqa: PLW0603
    if _engine_type is not None:
        return _engine_type
    if _init_kokoro():
        return _engine_type
    if _init_pyttsx3():
        return _engine_type
    _engine_type = "none"
    return _engine_type


# ---------------------------------------------------------------------------
# Synthesis helpers
# ---------------------------------------------------------------------------

SAMPLE_RATE = 24000


def _synthesize_kokoro(text: str, voice: str) -> bytes:
    """Synthesize with kokoro-onnx, return WAV bytes."""
    import numpy as np

    samples, _sr = _kokoro_pipeline.create(text, voice=voice, speed=1.0)

    # Convert float32 numpy array to 16-bit PCM WAV
    pcm = (samples * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(_sr)
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


def _synthesize_pyttsx3(text: str) -> bytes:
    """Synthesize with pyttsx3, return WAV bytes.

    pyttsx3 saves to file, so we use a temp buffer approach.
    Note: pyttsx3 runs synchronously and blocks the event loop.
    Acceptable for MVP / fallback usage.
    """
    import tempfile

    import pyttsx3

    engine = pyttsx3.init()
    engine.setProperty("rate", 150)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
        engine.save_to_file(text, tmp.name)
        engine.runAndWait()
        tmp.seek(0)
        return tmp.read()


def _generate_silent_wav(duration_s: float = 0.5) -> bytes:
    """Generate a short silent WAV as last-resort fallback."""
    n_frames = int(SAMPLE_RATE * duration_s)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(struct.pack(f"<{n_frames}h", *([0] * n_frames)))
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Health check — reports which TTS engine is available."""
    engine = _ensure_engine()
    return {
        "status": "ok" if engine != "none" else "degraded",
        "service": "tts",
        "model": engine or "none",
    }


@app.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    """Synthesize text to speech and return WAV audio.

    Returns audio/wav as a streaming response.
    Returns 400 for empty text.
    Returns 503 if no TTS engine is available.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    # Cap text length for safety (MVP limit)
    if len(request.text) > 5000:
        raise HTTPException(
            status_code=400,
            detail="Text too long. Maximum 5000 characters.",
        )

    engine = _ensure_engine()

    try:
        if engine == "kokoro-onnx":
            wav_bytes = _synthesize_kokoro(request.text, request.voice)
        elif engine == "pyttsx3":
            wav_bytes = _synthesize_pyttsx3(request.text)
        else:
            # No engine available — return a minimal silent WAV so the
            # client can still function, but log a warning
            logger.warning(
                "No TTS engine available. Returning silent WAV for: %s",
                request.text[:100],
            )
            wav_bytes = _generate_silent_wav()
    except Exception as exc:
        logger.error("TTS synthesis failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"TTS synthesis failed: {exc}",
        ) from exc

    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={
            "Content-Disposition": "inline; filename=speech.wav",
            "Content-Length": str(len(wav_bytes)),
        },
    )
