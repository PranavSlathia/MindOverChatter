"""Voice metrics collection — passive observers for session analytics.

Two lightweight FrameProcessors that observe pipeline frames without consuming
them, writing to a shared SessionMetrics data store.  Thread-safe for
concurrent writes from background emotion analysis tasks.

Output format matches the VoiceSessionCompleteSchema defined in
packages/shared/src/validators/voice.ts.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    Frame,
    InterruptionFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class TurnMetrics:
    turn_index: int
    role: str  # "user" or "assistant"
    started_at: float  # time.time()
    ended_at: float
    duration_secs: float
    word_count: int
    text: str
    pause_before_secs: float  # gap since previous turn ended
    was_interrupted: bool


@dataclass
class EmotionSnapshot:
    turn_index: int
    timestamp: float
    emotion_label: str
    confidence: float
    pitch_mean: float
    pitch_std: float
    energy_mean: float
    energy_std: float
    speaking_rate: float
    mfcc_summary: list[float] | None


# ---------------------------------------------------------------------------
# Shared data store
# ---------------------------------------------------------------------------


class SessionMetrics:
    """Thread-safe metrics store shared between pipeline observers and
    background emotion analysis tasks."""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.started_at: float = time.time()
        self.ended_at: float | None = None

        self.turns: list[TurnMetrics] = []
        self.emotions: list[EmotionSnapshot] = []

        self.interruption_count: int = 0
        self.total_user_speech_secs: float = 0.0
        self.total_silence_secs: float = 0.0

        self._lock = threading.Lock()

        # Pending user turn: timing known but text not yet available.
        # Written by MetricsInputObserver, consumed by MetricsOutputObserver.
        # Protected by _lock for thread-safety.
        self._pending_user_turn: _PendingUserTurn | None = None

        # Internal tracking for the current user turn index
        # (monotonically increasing, shared by both observers)
        self._next_turn_index: int = 0

    async def setup(self, *args, **kwargs) -> None:
        """No-op — required by Pipecat PipelineTask for objects in the pipeline graph."""
        pass

    # -- Public mutation methods (thread-safe) --

    def add_turn(self, turn: TurnMetrics) -> None:
        with self._lock:
            self.turns.append(turn)
            if turn.role == "user":
                self.total_user_speech_secs += turn.duration_secs
            self.total_silence_secs += turn.pause_before_secs

    def add_emotion(self, snapshot: EmotionSnapshot) -> None:
        with self._lock:
            self.emotions.append(snapshot)

    def increment_interruptions(self) -> None:
        with self._lock:
            self.interruption_count += 1

    def record_greeting(self, text: str) -> None:
        """Record the AI-initiated opening greeting as the first assistant turn.

        Must be called before any pipeline frames arrive so the greeting
        appears as turn_index=0 in the persisted transcript.
        """
        with self._lock:
            idx = self._next_turn_index
            self._next_turn_index += 1
            now = time.time()
            self.turns.append(TurnMetrics(
                turn_index=idx,
                role="assistant",
                started_at=now,
                ended_at=now,
                duration_secs=0.0,
                word_count=len(text.split()),
                text=text,
                pause_before_secs=0.0,
                was_interrupted=False,
            ))

    def allocate_turn_index(self) -> int:
        with self._lock:
            idx = self._next_turn_index
            self._next_turn_index += 1
            return idx

    def current_turn_index(self) -> int:
        """Return the most recent turn index (0-based). Returns -1 if no
        turns have been allocated yet."""
        with self._lock:
            return self._next_turn_index - 1

    def finalize(self) -> None:
        """Mark the session as ended."""
        self.ended_at = time.time()

    # -- Serialization --

    def get_session_metrics(self) -> dict:
        """Return a JSON-serializable dict matching VoiceSessionCompleteSchema.

        The caller is expected to set ``sessionId`` to the MoC session ID
        (not the voice-service session ID).
        """
        self.finalize()

        with self._lock:
            turns_copy = list(self.turns)
            emotions_copy = list(self.emotions)
            interruptions = self.interruption_count
            user_speech = self.total_user_speech_secs
            silence = self.total_silence_secs

        # -- Build transcript array --
        transcript: list[dict] = []
        for t in turns_copy:
            transcript.append({
                "role": t.role,
                "content": t.text,
                "createdAt": datetime.fromtimestamp(t.started_at, tz=timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
                "turnIndex": t.turn_index,
                "durationSecs": round(t.duration_secs, 3),
                "pauseBeforeSecs": round(t.pause_before_secs, 3),
                "wordCount": t.word_count,
                "wasInterrupted": t.was_interrupted,
            })

        # -- Build emotions array --
        emotions_out: list[dict] = []
        for e in emotions_copy:
            emotions_out.append({
                "turnIndex": e.turn_index,
                "timestamp": datetime.fromtimestamp(e.timestamp, tz=timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
                "emotionLabel": e.emotion_label,
                "confidence": round(e.confidence, 4),
                "pitchMean": round(e.pitch_mean, 4),
                "pitchStd": round(e.pitch_std, 4),
                "energyMean": round(e.energy_mean, 4),
                "energyStd": round(e.energy_std, 4),
                "speakingRate": round(e.speaking_rate, 4),
                "mfccSummary": (
                    [round(v, 4) for v in e.mfcc_summary]
                    if e.mfcc_summary is not None
                    else None
                ),
            })

        # -- Derived metrics --
        user_turns = [t for t in turns_copy if t.role == "user"]
        avg_user_words = (
            sum(t.word_count for t in user_turns) / len(user_turns)
            if user_turns
            else 0.0
        )
        engagement_trajectory = [t.word_count for t in user_turns]
        speech_to_silence = (
            user_speech / silence if silence > 0 else float(user_speech > 0)
        )

        # Emotion arc: (timestamp, label, confidence) ordered by time
        sorted_emotions = sorted(emotions_copy, key=lambda e: e.timestamp)
        emotion_arc: list[list] = [
            [round(e.timestamp, 3), e.emotion_label, round(e.confidence, 4)]
            for e in sorted_emotions
        ]

        return {
            "sessionId": self.session_id,
            "transcript": transcript,
            "emotions": emotions_out,
            "sessionSummary": {
                "totalUserSpeechSecs": round(user_speech, 3),
                "totalSilenceSecs": round(silence, 3),
                "speechToSilenceRatio": round(speech_to_silence, 4),
                "interruptionCount": interruptions,
                "avgUserTurnLengthWords": round(avg_user_words, 2),
                "engagementTrajectory": engagement_trajectory,
                "emotionArc": emotion_arc,
            },
        }


# ---------------------------------------------------------------------------
# MetricsInputObserver — sits BEFORE STT, observes user-side frames
# ---------------------------------------------------------------------------


class MetricsInputObserver(FrameProcessor):
    """Passively observes user speech frames flowing through the input side
    of the pipeline.  Never consumes frames — all are pushed through.

    Tracks:
    - User turn start/end timestamps (from VAD frames for precision,
      with UserStarted/StoppedSpeaking as fallback)
    - Speech duration
    - Silence gaps between turns
    """

    def __init__(self, session_metrics: SessionMetrics, **kwargs) -> None:
        super().__init__(**kwargs)
        self._metrics = session_metrics

        # State for the current user speech turn
        self._user_speaking: bool = False
        self._user_turn_start: float = 0.0
        self._last_turn_end: float = session_metrics.started_at
        self._current_user_turn_index: int = -1

        # We prefer VAD timestamps when available
        self._vad_start: float | None = None
        self._vad_stop: float | None = None

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        # --- VAD precise timing ---
        if isinstance(frame, VADUserStartedSpeakingFrame):
            self._vad_start = frame.timestamp
        elif isinstance(frame, VADUserStoppedSpeakingFrame):
            self._vad_stop = frame.timestamp

        # --- User turn boundaries ---
        elif isinstance(frame, UserStartedSpeakingFrame):
            self._user_speaking = True
            # Use VAD timestamp if we have it, otherwise wall clock
            self._user_turn_start = self._vad_start or time.time()
            self._vad_start = None
            self._current_user_turn_index = self._metrics.allocate_turn_index()

        elif isinstance(frame, UserStoppedSpeakingFrame):
            if self._user_speaking:
                end_time = self._vad_stop or time.time()
                self._vad_stop = None

                duration = max(0.0, end_time - self._user_turn_start)
                pause = max(0.0, self._user_turn_start - self._last_turn_end)

                # We don't have text yet (STT hasn't run); the turn will be
                # completed by MetricsOutputObserver when TranscriptionFrame
                # arrives.  Store a partial turn that OutputObserver will
                # enrich with text.
                with self._metrics._lock:
                    self._metrics._pending_user_turn = _PendingUserTurn(
                        turn_index=self._current_user_turn_index,
                        started_at=self._user_turn_start,
                        ended_at=end_time,
                        duration_secs=duration,
                        pause_before_secs=pause,
                    )

                self._last_turn_end = end_time
                self._user_speaking = False

        # Always pass through
        await self.push_frame(frame, direction)


@dataclass
class _PendingUserTurn:
    """Intermediate state: timing is known but text is not yet available."""

    turn_index: int
    started_at: float
    ended_at: float
    duration_secs: float
    pause_before_secs: float


# ---------------------------------------------------------------------------
# MetricsOutputObserver — sits AFTER context_aggregator.assistant()
# ---------------------------------------------------------------------------


class MetricsOutputObserver(FrameProcessor):
    """Passively observes LLM response frames and finalized transcriptions
    flowing through the output side of the pipeline.  Never consumes frames.

    Tracks:
    - Assistant turn timing (LLMFullResponseStart/End)
    - Assistant text accumulation for word counts
    - Interruption events
    - Finalized user transcription text (to complete pending user turns)
    - Bot speaking timing
    """

    def __init__(self, session_metrics: SessionMetrics, **kwargs) -> None:
        super().__init__(**kwargs)
        self._metrics = session_metrics

        # Assistant turn state
        self._in_response: bool = False
        self._response_start: float = 0.0
        self._response_text_chunks: list[str] = []
        self._assistant_turn_index: int = -1
        self._assistant_interrupted: bool = False

        # Bot speaking state (for accurate end-of-turn timing)
        self._bot_speaking_start: float = 0.0
        self._bot_speaking: bool = False

        # Track last turn end for pause calculation
        self._last_turn_end: float = session_metrics.started_at

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        # --- Finalized user transcription → complete pending user turn ---
        if isinstance(frame, TranscriptionFrame) and frame.finalized and frame.text.strip():
            with self._metrics._lock:
                pending = self._metrics._pending_user_turn
            if pending is not None:
                text = frame.text.strip()
                turn = TurnMetrics(
                    turn_index=pending.turn_index,
                    role="user",
                    started_at=pending.started_at,
                    ended_at=pending.ended_at,
                    duration_secs=pending.duration_secs,
                    word_count=len(text.split()),
                    text=text,
                    pause_before_secs=pending.pause_before_secs,
                    was_interrupted=False,  # Users don't get interrupted
                )
                self._metrics.add_turn(turn)
                with self._metrics._lock:
                    self._metrics._pending_user_turn = None
                self._last_turn_end = pending.ended_at

                logger.debug(
                    "[metrics] User turn %d: %d words, %.1fs",
                    turn.turn_index,
                    turn.word_count,
                    turn.duration_secs,
                )

        # --- LLM response lifecycle ---
        elif isinstance(frame, LLMFullResponseStartFrame):
            self._in_response = True
            self._response_start = time.time()
            self._response_text_chunks = []
            self._assistant_interrupted = False
            self._assistant_turn_index = self._metrics.allocate_turn_index()

        elif isinstance(frame, LLMTextFrame) and self._in_response:
            self._response_text_chunks.append(frame.text)

        elif isinstance(frame, LLMFullResponseEndFrame):
            if self._in_response:
                end_time = time.time()
                full_text = "".join(self._response_text_chunks)
                duration = max(0.0, end_time - self._response_start)
                pause = max(0.0, self._response_start - self._last_turn_end)

                turn = TurnMetrics(
                    turn_index=self._assistant_turn_index,
                    role="assistant",
                    started_at=self._response_start,
                    ended_at=end_time,
                    duration_secs=duration,
                    word_count=len(full_text.split()) if full_text.strip() else 0,
                    text=full_text,
                    pause_before_secs=pause,
                    was_interrupted=self._assistant_interrupted,
                )
                self._metrics.add_turn(turn)
                self._last_turn_end = end_time

                logger.debug(
                    "[metrics] Assistant turn %d: %d words, %.1fs%s",
                    turn.turn_index,
                    turn.word_count,
                    turn.duration_secs,
                    " (interrupted)" if turn.was_interrupted else "",
                )

                self._in_response = False
                self._response_text_chunks = []

        # --- Interruption ---
        elif isinstance(frame, InterruptionFrame):
            self._metrics.increment_interruptions()
            if self._in_response:
                self._assistant_interrupted = True
            logger.debug("[metrics] Interruption detected (total: %d)", self._metrics.interruption_count)

        # --- Bot speaking (for latency measurement / future use) ---
        elif isinstance(frame, BotStartedSpeakingFrame):
            self._bot_speaking = True
            self._bot_speaking_start = time.time()

        elif isinstance(frame, BotStoppedSpeakingFrame):
            if self._bot_speaking:
                self._bot_speaking = False
                # Update last_turn_end to bot stop time for more accurate
                # pause-before calculation on the next user turn
                self._last_turn_end = time.time()

        # Always pass through
        await self.push_frame(frame, direction)
