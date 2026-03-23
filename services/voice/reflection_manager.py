"""Adaptive therapeutic reflection pauses for voice sessions.

Manages AI-driven pauses that serve a dual purpose:
1. Give the user a legitimate therapeutic intervention (breathing exercise
   or reflection prompt) — grounded in CBT/mindfulness practice.
2. Background: refresh Mem0 memories and inject them into the conversation
   context so the LLM has fresher recall for subsequent turns.

The ReflectionManager is instantiated after the PipelineTask is created
(it needs the task reference for queue_frame), and called from the
TranscriptLogger when a finalized user transcription arrives.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import TYPE_CHECKING

import aiohttp
from pipecat.frames.frames import LLMMessagesAppendFrame, TTSSpeakFrame

if TYPE_CHECKING:
    from pipecat.pipeline.task import PipelineTask

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Therapeutic content pools
# ---------------------------------------------------------------------------

# Long pauses (~90s when spoken) — grounding / breathing exercises.
# Used for high-emotion turns where the user needs somatic regulation.
BREATHING_EXERCISES: list[str] = [
    (
        "Let's take a moment together. "
        "Breathe in slowly through your nose for four counts... one, two, three, four. "
        "Hold gently for four... one, two, three, four. "
        "Now breathe out through your mouth for six counts... one, two, three, four, five, six. "
        "Let's do that once more. Breathe in... two, three, four. "
        "Hold... two, three, four. "
        "And out... two, three, four, five, six. "
        "Good. Take a moment to notice how your body feels."
    ),
    (
        "I'd like us to pause here for a moment. "
        "If you're comfortable, let your eyes close or soften your gaze. "
        "Take a deep breath in... and let it out slowly. "
        "Now notice five things you can see or picture in your mind. "
        "Four things you can feel right now, like the weight of your body or the air on your skin. "
        "Three things you can hear. "
        "Two things you can smell, or imagine smelling. "
        "And one thing you can taste, even if it's just the air. "
        "Take one more breath. You're right here."
    ),
    (
        "Let's slow down for a moment together. "
        "Breathe in through your nose for four counts... one, two, three, four. "
        "Hold for four... one, two, three, four. "
        "Out through your mouth for four... one, two, three, four. "
        "And again. In... two, three, four. "
        "Hold... two, three, four. "
        "Out... two, three, four. "
        "One more time. In... hold... and out. "
        "Notice the steadiness in that rhythm. You can come back to it any time."
    ),
    (
        "I want to pause here and check in with your body. "
        "Take a breath in, and as you breathe out, let your shoulders drop. "
        "Notice your feet on the ground. The surface beneath you. "
        "Scan from the top of your head down to your toes. "
        "Where are you holding tension? Just notice it, you don't need to fix anything. "
        "Breathe into that spot gently. "
        "And let it go with the exhale. "
        "Take one more breath at your own pace."
    ),
]

# Short pauses (~30s when spoken) — reflective micro-moments.
# Used for periodic context refreshes or after meaningful disclosures.
REFLECTION_PROMPTS: list[str] = [
    "Take a moment to sit with what you just shared. There's no rush.",
    "Let that thought settle. Notice what comes up for you.",
    "That sounds important. Let it breathe for a moment before we continue.",
    (
        "Sometimes our body knows things before our mind catches up. "
        "What are you noticing in your body right now?"
    ),
    "There's something meaningful in what you just said. Let's give it a moment.",
    "Pause here with me for a second. What feels most true about what you just shared?",
    (
        "You've shared something that matters. "
        "Before we move on, take a breath and notice what's present for you."
    ),
    "Let's hold that for a moment. There's no need to figure it out right away.",
]

# Emotions that warrant a grounding / long pause when confidence is high.
_HIGH_EMOTION_LABELS = frozenset({
    "sad", "angry", "fearful", "anxious", "distressed",
})


# ---------------------------------------------------------------------------
# ReflectionManager
# ---------------------------------------------------------------------------


class ReflectionManager:
    """Manages adaptive reflection pauses during voice sessions.

    Decides WHEN to pause (AI-driven heuristics, not a fixed timer) and
    WHAT to do during the pause (short reflection vs long breathing exercise).

    During the pause the manager also fires a background memory refresh so
    the LLM has fresher Mem0 context for subsequent turns.
    """

    def __init__(
        self,
        pipeline_task: PipelineTask,
        moc_session_id: str | None,
        backend_url: str,
    ) -> None:
        self._task = pipeline_task
        self._moc_session_id = moc_session_id
        self._backend_url = backend_url.rstrip("/")

        # Counters
        self._turn_count: int = 0
        self._last_refresh_turn: int = 0
        self._last_pause_turn: int = 0

        # Last observed emotion for the most recent user turn
        self._last_emotion: str | None = None
        self._last_emotion_confidence: float = 0.0

        # Rolling window of recent user turn texts (for Mem0 query)
        self._recent_topics: list[str] = []

        # Track background tasks so they aren't garbage-collected
        self._pending_tasks: set[asyncio.Task[None]] = set()

    # ------------------------------------------------------------------
    # Public API — called from TranscriptLogger
    # ------------------------------------------------------------------

    def on_turn_complete(
        self,
        turn_text: str,
        emotion: str | None = None,
        confidence: float = 0.0,
    ) -> None:
        """Called after each finalized user transcription.

        Updates internal counters and caches the turn text for topic
        extraction during memory refresh.
        """
        self._turn_count += 1
        self._last_emotion = emotion
        self._last_emotion_confidence = confidence

        # Keep last 3 user turns for topic extraction
        self._recent_topics.append(turn_text)
        if len(self._recent_topics) > 3:
            self._recent_topics.pop(0)

    def should_pause(self) -> tuple[bool, str]:
        """Decide whether to trigger a therapeutic pause.

        Returns:
            (should_pause, pause_type) where pause_type is ``"short"``
            (30 s reflection) or ``"long"`` (90 s breathing exercise).

        Decision logic (evaluated in order):
        1. Never before turn 3 — let the conversation establish.
        2. Never two turns in a row — respect conversational flow.
        3. High emotional intensity (confidence > 0.8 for distressing
           emotions) -> ``"long"`` (somatic grounding).
        4. Every ~5 turns since last refresh -> ``"short"`` (context refresh
           disguised as a reflective moment).
        5. Default: no pause.
        """
        if self._turn_count < 3:
            return (False, "")

        if self._turn_count - self._last_pause_turn < 2:
            return (False, "")

        # High emotion -> grounding exercise
        if (
            self._last_emotion_confidence > 0.8
            and self._last_emotion in _HIGH_EMOTION_LABELS
        ):
            return (True, "long")

        # Periodic refresh threshold
        turns_since_refresh = self._turn_count - self._last_refresh_turn
        if turns_since_refresh >= 5:
            return (True, "short")

        return (False, "")

    async def execute_pause(self, pause_type: str) -> None:
        """Execute a therapeutic pause and background memory refresh.

        1. Choose and speak a therapeutic intervention directly via TTS
           (bypasses LLM, marked as assistant context via append_to_context).
        2. Fire-and-forget: fetch fresh Mem0 memories and inject them into
           the conversation context.
        """
        self._last_pause_turn = self._turn_count
        self._last_refresh_turn = self._turn_count

        # 1. Choose therapeutic intervention
        if pause_type == "long":
            text = random.choice(BREATHING_EXERCISES)
        else:
            text = random.choice(REFLECTION_PROMPTS)

        logger.info(
            "[reflection] Executing %s pause at turn %d (emotion=%s conf=%.2f)",
            pause_type,
            self._turn_count,
            self._last_emotion,
            self._last_emotion_confidence,
        )

        # 2. Speak directly via TTS — bypass LLM, add to conversation context
        await self._task.queue_frame(TTSSpeakFrame(
            text=text,
            append_to_context=True,
        ))

        # 3. Background: refresh Mem0 memories
        task = asyncio.create_task(self._refresh_memories())
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _refresh_memories(self) -> None:
        """Fetch fresh memories from the backend and inject into the
        conversation context.

        This runs as a detached coroutine — errors are logged but never
        propagated to the pipeline.
        """
        if not self._moc_session_id or not self._recent_topics:
            return

        url = f"{self._backend_url}/api/voice/refresh-memories"
        timeout = aiohttp.ClientTimeout(total=10)

        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json={
                    "sessionId": self._moc_session_id,
                    "recentTopics": self._recent_topics,
                }) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        memories_text = data.get("memoriesBlock", "")
                        if memories_text.strip():
                            await self._task.queue_frame(
                                LLMMessagesAppendFrame(
                                    messages=[{
                                        "role": "system",
                                        "content": (
                                            "[Updated context from memory]\n"
                                            f"{memories_text}"
                                        ),
                                    }],
                                    run_llm=False,
                                )
                            )
                            logger.info(
                                "[reflection] Injected %d chars of fresh memories",
                                len(memories_text),
                            )
                    else:
                        body = await resp.text()
                        logger.warning(
                            "[reflection] Memory refresh failed (%d): %s",
                            resp.status,
                            body[:200],
                        )
        except Exception as exc:
            logger.warning("[reflection] Memory refresh error: %s", exc)
