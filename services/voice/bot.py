"""Voice bot pipeline: SileroVAD → GroqSTT → GroqLLM → CartesiaTTS via Daily.co.

Creates and runs a Pipecat bot for a single voice session.
Modeled after PRSNL's pipecat bot with Groq LLM for low-latency inference.
"""

from __future__ import annotations

import asyncio
import io
import logging
import struct
import time
from typing import Any, Optional

import aiohttp

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    Frame,
    InputAudioRawFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    TTSSpeakFrame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.groq.stt import GroqSTTService
from pipecat.services.groq.llm import GroqLLMService
from pipecat.services.openai.base_llm import BaseOpenAILLMService

from config import settings
from reflection_manager import ReflectionManager
from metrics_collector import (
    EmotionSnapshot,
    MetricsInputObserver,
    MetricsOutputObserver,
    SessionMetrics,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Daily transport — lazy import for graceful degradation
# ---------------------------------------------------------------------------

_DAILY_IMPORT_ERROR: Optional[str] = None

try:
    from pipecat.transports.daily.transport import DailyParams, DailyTransport
except ImportError as exc:
    _DAILY_IMPORT_ERROR = str(exc)
    DailyTransport = None  # type: ignore[assignment]
    DailyParams = None  # type: ignore[assignment]

# Cartesia TTS — lazy import
try:
    from pipecat.services.cartesia.tts import CartesiaTTSService
except ImportError:
    CartesiaTTSService = None  # type: ignore[assignment]


def get_daily_import_error() -> Optional[str]:
    """Return the Daily transport import error, or None if available."""
    return _DAILY_IMPORT_ERROR


# ---------------------------------------------------------------------------
# Transcript logger — captures text for persistence
# ---------------------------------------------------------------------------


class TranscriptLogger(FrameProcessor):
    """Captures user transcriptions and assistant responses for persistence.

    Also completes pending user turns in SessionMetrics (if wired).
    MetricsOutputObserver cannot do this because context_aggregator.user()
    consumes TranscriptionFrame before it reaches the output observer.
    """

    def __init__(
        self,
        on_user_text: Any = None,
        on_assistant_text: Any = None,
        session_metrics: Optional["SessionMetrics"] = None,
    ) -> None:
        super().__init__()
        self._on_user_text = on_user_text
        self._on_assistant_text = on_assistant_text
        self._session_metrics = session_metrics
        self._current_assistant_text: list[str] = []
        self._in_response = False
        self._reflection_manager: Any = None

    def set_reflection_manager(self, manager: Any) -> None:
        """Set the ReflectionManager after PipelineTask is created."""
        self._reflection_manager = manager

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and frame.finalized and frame.text.strip():
            if self._on_user_text:
                self._on_user_text(frame.text)

            # Complete pending user turn in SessionMetrics.
            # This is the only reliable capture point — TranscriptionFrame
            # gets consumed by context_aggregator.user() downstream.
            if self._session_metrics:
                self._session_metrics.complete_pending_user_turn(frame.text)

            # Check for therapeutic reflection pause
            if self._reflection_manager:
                self._reflection_manager.on_turn_complete(frame.text)
                should, pause_type = self._reflection_manager.should_pause()
                if should:
                    await self._reflection_manager.execute_pause(pause_type)

        elif isinstance(frame, LLMFullResponseStartFrame):
            self._in_response = True
            self._current_assistant_text = []

        elif isinstance(frame, LLMTextFrame) and self._in_response:
            self._current_assistant_text.append(frame.text)

        elif isinstance(frame, LLMFullResponseEndFrame):
            self._in_response = False
            full_text = "".join(self._current_assistant_text)
            if full_text.strip() and self._on_assistant_text:
                self._on_assistant_text(full_text)

        await self.push_frame(frame, direction)


class CrisisCheckProcessor(FrameProcessor):
    """Checks finalized user turns with the backend before they reach Claude."""

    def __init__(
        self,
        moc_session_id: Optional[str],
        on_assistant_text: Any = None,
    ) -> None:
        super().__init__()
        self._moc_session_id = moc_session_id
        self._on_assistant_text = on_assistant_text

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        if (
            not isinstance(frame, TranscriptionFrame)
            or not frame.finalized
            or not frame.text.strip()
            or not self._moc_session_id
        ):
            await self.push_frame(frame, direction)
            return

        verdict = await self._check_turn(frame.text.strip())
        if verdict is None or verdict.get("allow", True):
            await self.push_frame(frame, direction)
            return

        response = verdict.get("response") or {}
        message = response.get(
            "message",
            "I want to pause here and make sure you have immediate support available.",
        )

        logger.warning(
            "[voice-bot] Crisis gate intercepted live turn for moc_session_id=%s",
            self._moc_session_id,
        )
        if self._on_assistant_text and message.strip():
            self._on_assistant_text(message)

        await self.push_frame(LLMFullResponseStartFrame(), direction)
        await self.push_frame(LLMTextFrame(text=message), direction)
        await self.push_frame(LLMFullResponseEndFrame(), direction)

    async def _check_turn(self, text: str) -> Optional[dict[str, Any]]:
        timeout = aiohttp.ClientTimeout(total=5)
        url = f"{settings.MOC_BACKEND_URL}/api/voice/check-turn"

        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    url,
                    json={"sessionId": self._moc_session_id, "text": text},
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()

                    body = await resp.text()
                    logger.error(
                        "[voice-bot] /voice/check-turn failed (%d): %s",
                        resp.status,
                        body[:200],
                    )
        except Exception as exc:
            logger.error("[voice-bot] /voice/check-turn error: %s", exc)

        return None


# ---------------------------------------------------------------------------
# Voice emotion processor — fire-and-forget prosody analysis per user turn
# ---------------------------------------------------------------------------

# Minimum audio duration (seconds) for meaningful emotion analysis.
# The emotion service itself enforces 0.5s, but we skip the HTTP call
# entirely for very short utterances to save round-trips.
_MIN_EMOTION_AUDIO_S = 0.5

# Voice signal weight per CLAUDE.md: face=0.3, voice=0.5, text=0.8
_VOICE_SIGNAL_WEIGHT = 0.5


def _write_wav_bytes(pcm_bytes: bytes, sample_rate: int, num_channels: int = 1) -> bytes:
    """Encode raw PCM-16LE bytes into a WAV file in memory.

    Returns the complete WAV file as bytes (header + data).
    """
    # PCM 16-bit little-endian
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * (bits_per_sample // 8)
    block_align = num_channels * (bits_per_sample // 8)
    data_size = len(pcm_bytes)

    buf = io.BytesIO()
    # RIFF header
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))  # file size - 8
    buf.write(b"WAVE")
    # fmt sub-chunk
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))  # sub-chunk size
    buf.write(struct.pack("<H", 1))  # PCM format
    buf.write(struct.pack("<H", num_channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", bits_per_sample))
    # data sub-chunk
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_bytes)
    return buf.getvalue()


class VoiceEmotionProcessor(FrameProcessor):
    """Buffers raw audio during each user speech turn and sends it to the
    emotion service for prosody analysis when the turn ends.

    Pipeline position: AFTER transport.input(), BEFORE stt.

    The processor is fully transparent — every frame is pushed downstream
    immediately. Emotion analysis runs as a fire-and-forget background task
    so it never delays the voice pipeline.
    """

    def __init__(
        self,
        moc_session_id: Optional[str],
        *,
        session_metrics: Optional[SessionMetrics] = None,
        emotion_service_url: str = settings.EMOTION_SERVICE_URL,
        backend_url: str = settings.MOC_BACKEND_URL,
    ) -> None:
        super().__init__()
        self._moc_session_id = moc_session_id
        self._session_metrics = session_metrics
        self._emotion_url = emotion_service_url.rstrip("/")
        self._backend_url = backend_url.rstrip("/")

        # Per-turn audio buffer (raw PCM bytes)
        self._audio_chunks: list[bytes] = []
        self._sample_rate: int = 16000  # default; updated from first frame
        self._num_channels: int = 1
        self._is_speaking: bool = False

        # Track background tasks so they don't get GC'd
        self._pending_tasks: set[asyncio.Task[None]] = set()

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        # --- Buffer audio during active speech ---
        if isinstance(frame, InputAudioRawFrame):
            if self._is_speaking:
                self._audio_chunks.append(frame.audio)
                # Capture sample rate from the actual transport frames
                self._sample_rate = frame.sample_rate
                self._num_channels = frame.num_channels

        # --- Turn boundaries ---
        elif isinstance(frame, UserStartedSpeakingFrame):
            self._is_speaking = True
            self._audio_chunks.clear()

        elif isinstance(frame, UserStoppedSpeakingFrame):
            self._is_speaking = False
            self._dispatch_emotion_analysis()

        # Always pass every frame through immediately
        await self.push_frame(frame, direction)

    def _dispatch_emotion_analysis(self) -> None:
        """Take a snapshot of the current audio buffer and launch a
        background task to analyze it. Clears the buffer afterwards."""
        if not self._moc_session_id:
            self._audio_chunks.clear()
            return

        if not self._audio_chunks:
            return

        # Concatenate buffered PCM bytes
        pcm_data = b"".join(self._audio_chunks)
        self._audio_chunks.clear()

        # Check minimum duration (PCM 16-bit = 2 bytes per sample per channel)
        bytes_per_sample = 2 * self._num_channels
        num_samples = len(pcm_data) // bytes_per_sample if bytes_per_sample else 0
        duration_s = num_samples / self._sample_rate if self._sample_rate else 0

        if duration_s < _MIN_EMOTION_AUDIO_S:
            logger.debug(
                "[voice-emotion] Skipping analysis: audio too short (%.2fs < %.1fs)",
                duration_s,
                _MIN_EMOTION_AUDIO_S,
            )
            return

        logger.info(
            "[voice-emotion] Dispatching analysis: %.2fs audio (%d bytes) for session=%s",
            duration_s,
            len(pcm_data),
            self._moc_session_id,
        )

        task = asyncio.create_task(
            self._analyze_and_report(pcm_data, self._sample_rate, self._num_channels)
        )
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)

    async def _analyze_and_report(
        self, pcm_data: bytes, sample_rate: int, num_channels: int
    ) -> None:
        """Send audio to emotion service, then report result to backend.

        This runs as a detached coroutine — errors are logged but never
        propagated to the pipeline.
        """
        try:
            # Encode PCM buffer as WAV in memory
            wav_bytes = _write_wav_bytes(pcm_data, sample_rate, num_channels)

            # --- Step 1: POST to emotion service ---
            emotion_result = await self._call_emotion_service(wav_bytes)
            if emotion_result is None:
                return

            emotion_label = emotion_result.get("emotion", "neutral")
            confidence = emotion_result.get("confidence", 0.0)
            prosody = emotion_result.get("prosody")

            logger.info(
                "[voice-emotion] Result: emotion=%s confidence=%.2f session=%s",
                emotion_label,
                confidence,
                self._moc_session_id,
            )

            # --- Step 2: Feed into SessionMetrics (if wired) ---
            if self._session_metrics is not None:
                snapshot = EmotionSnapshot(
                    turn_index=self._session_metrics.current_turn_index(),
                    timestamp=time.time(),
                    emotion_label=emotion_label,
                    confidence=confidence,
                    pitch_mean=prosody.get("pitch_mean", 0.0) if prosody else 0.0,
                    pitch_std=prosody.get("pitch_std", 0.0) if prosody else 0.0,
                    energy_mean=prosody.get("energy_mean", 0.0) if prosody else 0.0,
                    energy_std=prosody.get("energy_std", 0.0) if prosody else 0.0,
                    speaking_rate=prosody.get("speaking_rate", 0.0) if prosody else 0.0,
                    mfcc_summary=prosody.get("mfcc_summary") if prosody else None,
                )
                self._session_metrics.add_emotion(snapshot)

            # --- Step 3: POST to MoC backend ---
            await self._report_to_backend(emotion_label, confidence, prosody)

        except Exception:
            logger.exception("[voice-emotion] Unhandled error in emotion analysis")

    async def _call_emotion_service(self, wav_bytes: bytes) -> Optional[dict[str, Any]]:
        """POST the WAV file to the emotion service's /analyze endpoint."""
        url = f"{self._emotion_url}/analyze"
        timeout = aiohttp.ClientTimeout(total=10)

        try:
            form = aiohttp.FormData()
            form.add_field(
                "file",
                wav_bytes,
                filename="turn.wav",
                content_type="audio/wav",
            )

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, data=form) as resp:
                    if resp.status == 200:
                        return await resp.json()

                    body = await resp.text()
                    logger.warning(
                        "[voice-emotion] Emotion service returned %d: %s",
                        resp.status,
                        body[:200],
                    )
        except asyncio.TimeoutError:
            logger.warning("[voice-emotion] Emotion service timed out")
        except Exception as exc:
            logger.warning("[voice-emotion] Emotion service error: %s", exc)

        return None

    async def _report_to_backend(
        self,
        emotion_label: str,
        confidence: float,
        prosody: Optional[dict[str, Any]],
    ) -> None:
        """POST the emotion reading to the MoC backend's /api/emotions endpoint."""
        url = f"{self._backend_url}/api/emotions"
        timeout = aiohttp.ClientTimeout(total=5)

        payload: dict[str, Any] = {
            "sessionId": self._moc_session_id,
            "channel": "voice",
            "emotionLabel": emotion_label,
            "confidence": confidence,
            "signalWeight": _VOICE_SIGNAL_WEIGHT,
        }

        if prosody:
            payload["prosodyData"] = {
                "pitch_mean": prosody.get("pitch_mean", 0),
                "pitch_std": prosody.get("pitch_std", 0),
                "energy_mean": prosody.get("energy_mean", 0),
                "energy_std": prosody.get("energy_std", 0),
                "speaking_rate": prosody.get("speaking_rate", 0),
                "mfcc_summary": prosody.get("mfcc_summary"),
            }

        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status in (200, 201):
                        logger.debug(
                            "[voice-emotion] Reported to backend: %s (%.2f)",
                            emotion_label,
                            confidence,
                        )
                    else:
                        body = await resp.text()
                        logger.warning(
                            "[voice-emotion] Backend returned %d: %s",
                            resp.status,
                            body[:200],
                        )
        except Exception as exc:
            logger.warning("[voice-emotion] Backend report error: %s", exc)


# ---------------------------------------------------------------------------
# Bot creation
# ---------------------------------------------------------------------------


async def create_bot(
    room_url: str,
    token: str,
    session_id: str,
    moc_session_id: Optional[str],
    system_prompt: str,
    opening_greeting: Optional[str] = None,
    on_user_text: Any = None,
    on_assistant_text: Any = None,
) -> Optional[SessionMetrics]:
    """Create and run a Pipecat voice bot for a single session.

    The bot joins the Daily room and runs until the client disconnects.

    Returns:
        The SessionMetrics instance containing all collected voice metrics
        for the session, or None if the bot could not start.

    Args:
        room_url: Daily.co room URL
        token: Daily.co meeting token
        session_id: Voice service session ID (for logging)
        moc_session_id: MindOverChatter app session ID for turn-level safety checks
        system_prompt: Full system prompt (includes memory blocks, therapy plan, skills)
        opening_greeting: AI greeting to speak when user joins the room
        on_user_text: Callback for user transcriptions
        on_assistant_text: Callback for assistant responses
    """
    if _DAILY_IMPORT_ERROR or DailyTransport is None or DailyParams is None:
        logger.error("Daily transport not available: %s", _DAILY_IMPORT_ERROR)
        return None

    if not settings.GROQ_API_KEY:
        logger.error("GROQ_API_KEY not set")
        return None

    if not settings.CARTESIA_API_KEY:
        logger.error("CARTESIA_API_KEY not set")
        return None

    if CartesiaTTSService is None:
        logger.error("CartesiaTTSService not available — install pipecat-ai[cartesia]")
        return None

    logger.info("[voice-bot] Starting session=%s room=%s", session_id, room_url)

    # ── Services ──────────────────────────────────────────────────────

    stt = GroqSTTService(
        api_key=settings.GROQ_API_KEY,
        model=settings.GROQ_WHISPER_MODEL,
    )

    llm = GroqLLMService(
        api_key=settings.GROQ_API_KEY,
        model=settings.GROQ_LLM_MODEL,
        params=BaseOpenAILLMService.InputParams(
            temperature=0.7,
            max_completion_tokens=1024,
        ),
    )

    tts = CartesiaTTSService(
        api_key=settings.CARTESIA_API_KEY,
        voice_id=settings.CARTESIA_VOICE_ID,
        model=settings.CARTESIA_MODEL,
    )

    # ── Transport ─────────────────────────────────────────────────────

    transport = DailyTransport(
        room_url,
        token,
        "MindOverChatter",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            # Tell Daily that the bot is outputting live audio. This enables
            # server-side echo cancellation so the bot's own TTS playback
            # is not picked up by the mic and misinterpreted as user speech.
            # Without this, VAD triggers on the bot's own output causing
            # self-interruptions (~10 per short session at VAD_MIN_VOLUME=0.3).
            audio_out_is_live=True,
        ),
    )

    # ── Context + Aggregators ─────────────────────────────────────────

    messages = [{"role": "system", "content": system_prompt}]
    context = LLMContext(messages=messages)

    user_aggregator_params = LLMUserAggregatorParams(
        vad_analyzer=SileroVADAnalyzer(
            params=VADParams(
                min_volume=settings.VAD_MIN_VOLUME,
                # Require 0.4s of speech before confirming voice start (default 0.2s).
                # This filters out brief noise bursts and echo artifacts that
                # were causing false interruptions.
                start_secs=0.4,
            )
        ),
        user_turn_stop_timeout=settings.USER_TURN_STOP_TIMEOUT,
    )

    context_aggregator = LLMContextAggregatorPair(
        context,
        user_params=user_aggregator_params,
    )

    # ── Transcript Logger ─────────────────────────────────────────────

    transcript_logger = TranscriptLogger(
        on_user_text=on_user_text,
        on_assistant_text=on_assistant_text,
        session_metrics=session_metrics,
    )
    crisis_check = CrisisCheckProcessor(
        moc_session_id=moc_session_id,
        on_assistant_text=on_assistant_text,
    )

    # ── Session Metrics (shared data store for voice analytics) ──────

    session_metrics = SessionMetrics(session_id=moc_session_id or session_id)

    # ── Voice Emotion Processor (fire-and-forget prosody analysis) ─

    voice_emotion = VoiceEmotionProcessor(
        moc_session_id=moc_session_id,
        session_metrics=session_metrics,
    )

    # ── Metrics Observers (passive frame observers) ────────────────

    metrics_input = MetricsInputObserver(session_metrics)
    metrics_output = MetricsOutputObserver(session_metrics)

    # ── Pipeline ──────────────────────────────────────────────────────
    # voice_emotion sits between transport.input() and stt so it can
    # buffer raw InputAudioRawFrame samples. metrics_input sits after
    # voice_emotion to observe user speech timing. metrics_output sits
    # after context_aggregator.assistant() to observe LLM responses,
    # interruptions, and finalized transcriptions. All observers pass
    # every frame through — they never consume.

    pipeline = Pipeline(
        [
            transport.input(),
            voice_emotion,
            metrics_input,
            stt,
            transcript_logger,
            crisis_check,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
            metrics_output,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(allow_interruptions=True),
    )

    # ── Reflection Manager (therapeutic pauses + memory refresh) ──────

    reflection_mgr = ReflectionManager(
        pipeline_task=task,
        moc_session_id=moc_session_id,
        backend_url=settings.MOC_BACKEND_URL,
    )
    transcript_logger.set_reflection_manager(reflection_mgr)

    # ── Event Handlers ────────────────────────────────────────────────

    _greeting_spoken = False  # one-shot guard for opening greeting

    @transport.event_handler("on_participant_joined")
    async def on_joined(transport: Any, participant: Any) -> None:
        nonlocal _greeting_spoken
        participant_id = participant.get("id", "unknown")
        is_bot = participant.get("info", {}).get("isLocal", False)
        logger.info("[voice-bot] Participant joined: %s (isBot=%s)", participant_id, is_bot)

        # Skip greeting for the bot itself and prevent replays on reconnect
        if is_bot or _greeting_spoken or not opening_greeting:
            return

        _greeting_spoken = True
        logger.info("[voice-bot] Speaking opening greeting (%d chars)", len(opening_greeting))

        # Record in metrics so it appears in /voice/session-complete transcript
        session_metrics.record_greeting(opening_greeting)

        await task.queue_frame(
            TTSSpeakFrame(text=opening_greeting, append_to_context=True)
        )
        if on_assistant_text:
            on_assistant_text(opening_greeting)

    @transport.event_handler("on_participant_left")
    async def on_left(transport: Any, participant: Any, reason: str) -> None:
        participant_id = participant.get("id", "unknown")
        logger.info("[voice-bot] Participant left: %s reason=%s", participant_id, reason)
        await task.cancel()

    @transport.event_handler("on_call_state_updated")
    async def on_call_state(transport: Any, state: str) -> None:
        if state == "left":
            logger.info("[voice-bot] Call ended for session=%s", session_id)

    # ── Run ────────────────────────────────────────────────────────────

    runner = PipelineRunner()
    try:
        await runner.run(task)
    except asyncio.CancelledError:
        logger.info("[voice-bot] Session cancelled: %s", session_id)
    except Exception as e:
        logger.error("[voice-bot] Session error: %s — %s", session_id, e)
    finally:
        session_metrics.finalize()
        logger.info("[voice-bot] Session ended: %s", session_id)

    return session_metrics
