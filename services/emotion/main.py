"""MindOverChatter Emotion Service — librosa prosody-based voice emotion analysis.

Extracts prosody features (pitch, energy, speaking rate, MFCCs) from audio
and maps them to emotion labels using rule-based heuristics. Lightweight,
CPU-only, no model downloads required.
"""

from __future__ import annotations

import logging
import math
import tempfile
from pathlib import Path

import librosa
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger("moc.emotion")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MindOverChatter Emotion Service",
    description="Voice emotion detection using librosa prosody analysis",
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
    # Some clients send generic octet-stream for audio uploads
    "application/octet-stream",
}

# Accepted file extensions as fallback when MIME type is unreliable
ACCEPTED_AUDIO_EXTENSIONS: set[str] = {
    ".wav", ".mp3", ".ogg", ".flac", ".webm",
    ".m4a", ".aac", ".mp4", ".opus", ".wma",
}

# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class ProsodyFeatures(BaseModel):
    pitch_mean: float
    pitch_std: float
    energy_mean: float
    energy_std: float
    speaking_rate: float
    mfcc_summary: list[float]


class EmotionResult(BaseModel):
    emotion: str
    confidence: float
    prosody: ProsodyFeatures


# ---------------------------------------------------------------------------
# Prosody extraction
# ---------------------------------------------------------------------------

# Default sample rate for librosa loading
TARGET_SR = 22050

# Minimum audio duration in seconds for meaningful analysis
MIN_DURATION_S = 0.5


def extract_prosody(y: np.ndarray, sr: int) -> ProsodyFeatures:
    """Extract prosody features from an audio signal.

    Parameters
    ----------
    y : np.ndarray
        Audio time series (mono).
    sr : int
        Sample rate.

    Returns
    -------
    ProsodyFeatures
        Extracted pitch, energy, speaking rate, and MFCC summary.
    """
    # --- Pitch (fundamental frequency) via pyin ---
    # pyin returns (f0, voiced_flag, voiced_probs)
    f0, voiced_flag, _ = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),   # ~65 Hz
        fmax=librosa.note_to_hz("C7"),   # ~2093 Hz
        sr=sr,
    )

    # Filter to only voiced frames (where pitch is detected)
    voiced_f0 = f0[voiced_flag] if voiced_flag is not None else f0[~np.isnan(f0)]

    if len(voiced_f0) == 0:
        # No voiced frames detected — return zeros for pitch
        pitch_mean = 0.0
        pitch_std = 0.0
    else:
        pitch_mean = float(np.nanmean(voiced_f0))
        pitch_std = float(np.nanstd(voiced_f0))

    # --- Energy (RMS) ---
    rms = librosa.feature.rms(y=y)[0]
    energy_mean = float(np.mean(rms))
    energy_std = float(np.std(rms))

    # --- Speaking rate (onsets per second) ---
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
    duration_s = len(y) / sr
    speaking_rate = float(len(onset_frames) / duration_s) if duration_s > 0 else 0.0

    # --- MFCCs (13 coefficients, mean across time) ---
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_summary = [float(np.mean(mfccs[i])) for i in range(13)]

    return ProsodyFeatures(
        pitch_mean=pitch_mean,
        pitch_std=pitch_std,
        energy_mean=energy_mean,
        energy_std=energy_std,
        speaking_rate=speaking_rate,
        mfcc_summary=mfcc_summary,
    )


# ---------------------------------------------------------------------------
# Rule-based emotion mapping
# ---------------------------------------------------------------------------

# Thresholds are calibrated for typical speech at 22050 Hz sample rate.
# These are approximate and tuned conservatively — the service is meant
# to provide weak signals (weight=0.5) that the backend combines with
# text sentiment (0.8) and facial emotion (0.3).

# Pitch thresholds (Hz) — typical adult speech ranges
PITCH_LOW = 120.0       # Below this → low pitch
PITCH_HIGH = 220.0      # Above this → high pitch

# Pitch variability thresholds (Hz std)
PITCH_VAR_LOW = 20.0    # Below this → monotone
PITCH_VAR_HIGH = 50.0   # Above this → highly variable

# Energy thresholds (RMS, relative to typical speech)
ENERGY_LOW = 0.01       # Below this → quiet/soft
ENERGY_HIGH = 0.05      # Above this → loud/intense

# Speaking rate thresholds (onsets per second)
RATE_LOW = 2.0          # Below this → slow speech
RATE_HIGH = 6.0         # Above this → fast speech


def classify_emotion(prosody: ProsodyFeatures) -> tuple[str, float]:
    """Map prosody features to an emotion label and confidence score.

    Returns a tuple of (emotion_label, confidence). Confidence is
    deliberately conservative (0.3-0.7) because rule-based heuristics
    are inherently limited compared to trained models.

    The mapping logic:
    - High energy + high pitch → "excited" or "angry" (check variability)
    - Low energy + low pitch → "sad"
    - Medium energy + medium pitch + low variability → "neutral"
    - High pitch variability + high energy → "anxious"
    - Low energy + moderate pitch → "calm"
    """
    pitch = prosody.pitch_mean
    pitch_var = prosody.pitch_std
    energy = prosody.energy_mean
    rate = prosody.speaking_rate

    # No voiced frames — can't determine emotion from pitch
    if pitch == 0.0:
        return "neutral", 0.3

    # --- High energy + high pitch ---
    if energy > ENERGY_HIGH and pitch > PITCH_HIGH:
        if pitch_var > PITCH_VAR_HIGH:
            # High variability + high energy + high pitch → angry
            return "angry", 0.55
        else:
            # Stable high pitch + high energy → excited
            return "excited", 0.55

    # --- High pitch variability + elevated energy → anxious ---
    if pitch_var > PITCH_VAR_HIGH and energy > ENERGY_LOW:
        if rate > RATE_HIGH:
            # Fast speech + variable pitch + energy → more likely anxious
            return "anxious", 0.6
        return "anxious", 0.5

    # --- Low energy + low pitch → sad ---
    if energy < ENERGY_LOW and pitch < PITCH_LOW:
        if rate < RATE_LOW:
            # Slow + quiet + low pitch — stronger sad signal
            return "sad", 0.6
        return "sad", 0.5

    # --- Low energy + moderate pitch → calm ---
    if energy < ENERGY_LOW and PITCH_LOW <= pitch <= PITCH_HIGH:
        if pitch_var < PITCH_VAR_LOW:
            # Monotone + quiet → calm with higher confidence
            return "calm", 0.6
        return "calm", 0.5

    # --- Medium energy + medium pitch + low variability → neutral ---
    if (ENERGY_LOW <= energy <= ENERGY_HIGH
            and PITCH_LOW <= pitch <= PITCH_HIGH
            and pitch_var < PITCH_VAR_HIGH):
        return "neutral", 0.5

    # --- Fast speech with high energy (but not high pitch) ---
    if rate > RATE_HIGH and energy > ENERGY_HIGH:
        return "excited", 0.45

    # --- Default fallback ---
    return "neutral", 0.35


# ---------------------------------------------------------------------------
# Audio validation helper
# ---------------------------------------------------------------------------

def _is_valid_audio(content_type: str | None, filename: str | None) -> bool:
    """Check if the upload looks like an audio file.

    Uses both MIME type and file extension as signals. Accepts
    application/octet-stream since some clients send that for audio.
    """
    # Check MIME type
    if content_type and content_type.lower() in ACCEPTED_AUDIO_TYPES:
        return True

    # Fallback: check file extension
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
    """Health check — verifies librosa is importable."""
    return {
        "status": "ok",
        "service": "emotion",
        "model": "librosa-prosody-v1",
    }


@app.post("/analyze", response_model=EmotionResult)
async def analyze(file: UploadFile = File(...)):
    """Analyze voice emotion from an uploaded audio file.

    Extracts prosody features using librosa and maps them to
    an emotion label via rule-based heuristics.

    Returns 422 for invalid (non-audio) file types.
    Returns 400 for audio that is too short to analyze.
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

    # --- Load audio with librosa ---
    # Write to a temp file because librosa.load works best with file paths
    # (handles format detection via soundfile/audioread).
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
            tmp.write(content)
            tmp.flush()
            y, sr = librosa.load(tmp.name, sr=TARGET_SR, mono=True)
    except Exception as exc:
        logger.error("Failed to load audio: %s", exc)
        raise HTTPException(
            status_code=422,
            detail=f"Could not decode audio file: {exc}",
        ) from exc

    # --- Check minimum duration ---
    duration_s = len(y) / sr
    if duration_s < MIN_DURATION_S:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Audio too short ({duration_s:.2f}s). "
                f"Minimum duration is {MIN_DURATION_S}s for meaningful analysis."
            ),
        )

    # --- Extract prosody features ---
    try:
        prosody = extract_prosody(y, sr)
    except Exception as exc:
        logger.error("Prosody extraction failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Prosody extraction failed: {exc}",
        ) from exc

    # --- Classify emotion ---
    emotion, confidence = classify_emotion(prosody)

    # --- Sanitize any NaN/Inf values before JSON serialization ---
    def sanitize(v: float) -> float:
        if math.isnan(v) or math.isinf(v):
            return 0.0
        return round(v, 6)

    return EmotionResult(
        emotion=emotion,
        confidence=round(confidence, 3),
        prosody=ProsodyFeatures(
            pitch_mean=sanitize(prosody.pitch_mean),
            pitch_std=sanitize(prosody.pitch_std),
            energy_mean=sanitize(prosody.energy_mean),
            energy_std=sanitize(prosody.energy_std),
            speaking_rate=sanitize(prosody.speaking_rate),
            mfcc_summary=[sanitize(v) for v in prosody.mfcc_summary],
        ),
    )
