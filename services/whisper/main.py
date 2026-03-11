"""MindOverChatter Whisper Service — speech-to-text using faster-whisper.

Uses the CTranslate2 backend with the 'base' model for efficient CPU-based
transcription. Supports multilingual audio (English + Hindi/Hinglish).
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel

logger = logging.getLogger("moc.whisper")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MindOverChatter Whisper Service",
    description="Speech-to-text using faster-whisper (CTranslate2)",
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# Accepted audio MIME types
# ---------------------------------------------------------------------------

ACCEPTED_AUDIO_TYPES: set[str] = {
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/ogg",
    "audio/flac",
    "audio/webm",
    "audio/aac",
    "audio/x-m4a",
    "audio/m4a",
    "application/octet-stream",
}

ACCEPTED_AUDIO_EXTENSIONS: set[str] = {
    ".wav", ".mp3", ".ogg", ".flac", ".webm",
    ".m4a", ".aac", ".mp4", ".opus", ".wma",
}

# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------


class TranscribeResult(BaseModel):
    text: str
    language: str
    duration: float


# ---------------------------------------------------------------------------
# Model loading (lazy singleton)
# ---------------------------------------------------------------------------

_model = None


def get_model():
    """Load the faster-whisper model lazily on first request."""
    global _model  # noqa: PLW0603
    if _model is None:
        from faster_whisper import WhisperModel

        logger.info("Loading faster-whisper 'base' model (CTranslate2 backend)...")
        _model = WhisperModel(
            "base",
            device="cpu",
            compute_type="int8",
            download_root="/app/models",
        )
        logger.info("Model loaded successfully.")
    return _model


# ---------------------------------------------------------------------------
# Audio validation helper
# ---------------------------------------------------------------------------

def _is_valid_audio(content_type: str | None, filename: str | None) -> bool:
    """Check if the upload looks like an audio file."""
    if content_type and content_type.lower() in ACCEPTED_AUDIO_TYPES:
        return True
    if filename:
        ext = Path(filename).suffix.lower()
        if ext in ACCEPTED_AUDIO_EXTENSIONS:
            return True
    return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Health check — verifies service is running."""
    return {
        "status": "ok",
        "service": "whisper",
        "model": "faster-whisper-base-ct2",
    }


@app.post("/transcribe", response_model=TranscribeResult)
async def transcribe(file: UploadFile = File(...)):
    """Transcribe audio to text using faster-whisper.

    Accepts multipart audio file upload. Returns transcribed text,
    detected language, and audio duration.

    Returns 422 for invalid (non-audio) file types.
    Returns 400 for empty files.
    """
    # --- Validate file type ---
    if not _is_valid_audio(file.content_type, file.filename):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Invalid file type: {file.content_type or 'unknown'}. "
                "Expected an audio file (wav, mp3, ogg, flac, webm, m4a)."
            ),
        )

    # --- Read file content ---
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    # --- Write to temp file for faster-whisper ---
    # faster-whisper works with file paths, not raw bytes
    suffix = Path(file.filename).suffix if file.filename else ".wav"
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(content)
            tmp.flush()

            model = get_model()
            segments, info = model.transcribe(
                tmp.name,
                beam_size=5,
                language=None,  # auto-detect language
                vad_filter=True,  # filter out non-speech
            )

            # Collect all segment texts
            texts: list[str] = []
            for segment in segments:
                texts.append(segment.text.strip())

            full_text = " ".join(texts).strip()
            detected_language = info.language if info.language else "unknown"
            duration = round(info.duration, 3)

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Transcription failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {exc}",
        ) from exc

    return TranscribeResult(
        text=full_text,
        language=detected_language,
        duration=duration,
    )
