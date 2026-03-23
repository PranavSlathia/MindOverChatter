"""Voice bot pipeline: SileroVAD → GroqSTT → ClaudeCLI → CartesiaTTS via Daily.co.

Creates and runs a Pipecat bot for a single voice session.
Modeled after PRSNL's pipecat bot with Claude CLI replacing GroqLLM.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import aiohttp

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    TranscriptionFrame,
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

from claude_processor import ClaudeCLIProcessor
from config import settings

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
    """Captures user transcriptions and assistant responses for persistence."""

    def __init__(self, on_user_text: Any = None, on_assistant_text: Any = None) -> None:
        super().__init__()
        self._on_user_text = on_user_text
        self._on_assistant_text = on_assistant_text
        self._current_assistant_text: list[str] = []
        self._in_response = False

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and frame.finalized and frame.text.strip():
            if self._on_user_text:
                self._on_user_text(frame.text)

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
# Bot creation
# ---------------------------------------------------------------------------


async def create_bot(
    room_url: str,
    token: str,
    session_id: str,
    moc_session_id: Optional[str],
    system_prompt: str,
    on_user_text: Any = None,
    on_assistant_text: Any = None,
) -> None:
    """Create and run a Pipecat voice bot for a single session.

    The bot joins the Daily room and runs until the client disconnects.

    Args:
        room_url: Daily.co room URL
        token: Daily.co meeting token
        session_id: Voice service session ID (for logging)
        moc_session_id: MindOverChatter app session ID for turn-level safety checks
        system_prompt: Full system prompt (includes memory blocks, therapy plan, skills)
        on_user_text: Callback for user transcriptions
        on_assistant_text: Callback for assistant responses
    """
    if _DAILY_IMPORT_ERROR or DailyTransport is None or DailyParams is None:
        logger.error("Daily transport not available: %s", _DAILY_IMPORT_ERROR)
        return

    if not settings.GROQ_API_KEY:
        logger.error("GROQ_API_KEY not set")
        return

    if not settings.CARTESIA_API_KEY:
        logger.error("CARTESIA_API_KEY not set")
        return

    if CartesiaTTSService is None:
        logger.error("CartesiaTTSService not available — install pipecat-ai[cartesia]")
        return

    logger.info("[voice-bot] Starting session=%s room=%s", session_id, room_url)

    # ── Services ──────────────────────────────────────────────────────

    stt = GroqSTTService(
        api_key=settings.GROQ_API_KEY,
        model=settings.GROQ_WHISPER_MODEL,
    )

    llm = ClaudeCLIProcessor(model=settings.CLAUDE_MODEL)

    tts = CartesiaTTSService(
        api_key=settings.CARTESIA_API_KEY,
        voice_id=settings.CARTESIA_VOICE_ID,
        model=settings.CARTESIA_MODEL,
        sample_rate=24000,
    )

    # ── Transport ─────────────────────────────────────────────────────

    transport = DailyTransport(
        room_url,
        token,
        "MindOverChatter",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_out_sample_rate=24000,
            audio_in_sample_rate=16000,
        ),
    )

    # ── Context + Aggregators ─────────────────────────────────────────

    messages = [{"role": "system", "content": system_prompt}]
    context = LLMContext(messages=messages)

    user_aggregator_params = LLMUserAggregatorParams(
        vad_analyzer=SileroVADAnalyzer(
            params=VADParams(min_volume=settings.VAD_MIN_VOLUME)
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
    )
    crisis_check = CrisisCheckProcessor(
        moc_session_id=moc_session_id,
        on_assistant_text=on_assistant_text,
    )

    # ── Pipeline ──────────────────────────────────────────────────────

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            transcript_logger,
            crisis_check,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(allow_interruptions=True),
    )

    # ── Event Handlers ────────────────────────────────────────────────

    @transport.event_handler("on_participant_joined")
    async def on_joined(transport: Any, participant: Any) -> None:
        participant_id = participant.get("id", "unknown")
        logger.info("[voice-bot] Participant joined: %s", participant_id)

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
        logger.info("[voice-bot] Session ended: %s", session_id)
