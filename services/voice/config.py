"""Voice service configuration — reads from environment variables."""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Daily.co (WebRTC transport)
    DAILY_API_KEY: str = os.getenv("DAILY_API_KEY", "")
    DAILY_API_URL: str = "https://api.daily.co/v1"

    # Groq (STT via Whisper + fast LLM for supervision)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_WHISPER_MODEL: str = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")

    # Cartesia (TTS)
    CARTESIA_API_KEY: str = os.getenv("CARTESIA_API_KEY", "")
    CARTESIA_VOICE_ID: str = os.getenv(
        "CARTESIA_VOICE_ID", "95d51f79-c397-46f9-b49a-23763d3eaa2d"
    )
    CARTESIA_MODEL: str = os.getenv("CARTESIA_MODEL", "sonic-3")

    # Groq LLM (main conversation model)
    GROQ_LLM_MODEL: str = os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")

    # Voice turn detection. Keep start detection conservative enough to avoid
    # the bot hearing its own TTS, but give stop detection more slack so
    # natural mid-sentence pauses are not finalized as complete turns.
    VAD_MIN_VOLUME: float = float(os.getenv("VAD_MIN_VOLUME", "0.6"))
    VAD_START_SECS: float = float(os.getenv("VAD_START_SECS", "0.8"))
    VAD_STOP_SECS: float = float(os.getenv("VAD_STOP_SECS", "0.6"))
    USER_SPEECH_TIMEOUT: float = float(os.getenv("USER_SPEECH_TIMEOUT", "1.2"))
    # Pipecat's controller-level fallback must stay above the speech timeout.
    # The previous 1.0s setting was truncating normal pauses with
    # "User stopped speaking (strategy: None)".
    USER_TURN_STOP_TIMEOUT: float = float(os.getenv("USER_TURN_STOP_TIMEOUT", "3.0"))

    # MindOverChatter backend (for session management)
    MOC_BACKEND_URL: str = os.getenv("MOC_BACKEND_URL", "http://localhost:3000")

    # Emotion analysis service (librosa prosody)
    EMOTION_SERVICE_URL: str = os.getenv("EMOTION_SERVICE_URL", "http://localhost:8002")

    # Service
    PORT: int = int(os.getenv("VOICE_PORT", "8005"))
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # Max concurrent voice sessions
    MAX_SESSIONS: int = int(os.getenv("MAX_VOICE_SESSIONS", "5"))


settings = Settings()
