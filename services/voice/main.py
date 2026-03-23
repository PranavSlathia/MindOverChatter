"""MindOverChatter Voice Service — Pipecat + Daily.co voice pipeline.

Manages voice session lifecycle:
- POST /start  — create Daily room, spawn Pipecat bot
- POST /stop   — end voice session
- GET  /health — service health check
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

import aiohttp
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from bot import create_bot, get_daily_import_error
from config import settings
from metrics_collector import SessionMetrics

# ── Logging ───────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("moc-voice")

# ── App ───────────────────────────────────────────────────────────────

app = FastAPI(title="MindOverChatter Voice Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5175", "http://127.0.0.1:5173", "http://127.0.0.1:5175"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Session Tracking ──────────────────────────────────────────────────

_sessions: Dict[str, "VoiceSession"] = {}
_bot_semaphore = asyncio.Semaphore(settings.MAX_SESSIONS)


class VoiceSession:
    def __init__(
        self,
        session_id: str,
        room_url: str,
        token: str,
        moc_session_id: Optional[str] = None,
    ) -> None:
        self.session_id = session_id
        self.room_url = room_url
        self.token = token
        self.moc_session_id = moc_session_id
        self.created_at = datetime.now(timezone.utc)
        self.user_turns: list[str] = []
        self.assistant_turns: list[str] = []
        self.session_metrics: Optional[SessionMetrics] = None


# ── Daily.co Helpers ──────────────────────────────────────────────────


async def _create_daily_room() -> str:
    """Create a temporary Daily room, return the room URL."""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{settings.DAILY_API_URL}/rooms",
            headers={"Authorization": f"Bearer {settings.DAILY_API_KEY}"},
            json={
                "properties": {
                    "exp": int(datetime.now(timezone.utc).timestamp() + 3600),
                    "enable_chat": False,
                    "enable_screenshare": False,
                    "max_participants": 2,
                }
            },
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise HTTPException(502, f"Daily room creation failed: {body}")
            data = await resp.json()
            return data["url"]


async def _create_daily_token(room_name: str, *, is_owner: bool = False) -> str:
    """Create a meeting token for a Daily room.

    Args:
        room_name: Name of the Daily room.
        is_owner: If True, grants owner privileges (needed for bot to send audio).
    """
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{settings.DAILY_API_URL}/meeting-tokens",
            headers={"Authorization": f"Bearer {settings.DAILY_API_KEY}"},
            json={
                "properties": {
                    "room_name": room_name,
                    "exp": int(datetime.now(timezone.utc).timestamp() + 3600),
                    "is_owner": is_owner,
                }
            },
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise HTTPException(502, f"Daily token creation failed: {body}")
            data = await resp.json()
            return data["token"]


# ── Transcript Persistence ────────────────────────────────────────────


async def _persist_transcript(voice_session: Optional["VoiceSession"]) -> None:
    """POST interleaved transcript to the MindOverChatter backend."""
    if not voice_session or not voice_session.moc_session_id:
        logger.info("No moc_session_id — skipping transcript persistence")
        return

    user_turns = voice_session.user_turns
    assistant_turns = voice_session.assistant_turns

    if not user_turns and not assistant_turns:
        logger.info("[session=%s] Empty transcript — skipping", voice_session.session_id)
        return

    # Interleave turns: user[0], assistant[0], user[1], assistant[1], ...
    turns: list[dict[str, str]] = []
    max_len = max(len(user_turns), len(assistant_turns))
    base_time = voice_session.created_at
    turn_idx = 0
    for i in range(max_len):
        if i < len(user_turns):
            offset = base_time + timedelta(seconds=turn_idx)
            turns.append({
                "role": "user",
                "content": user_turns[i],
                "createdAt": offset.isoformat().replace("+00:00", "Z"),
            })
            turn_idx += 1
        if i < len(assistant_turns):
            offset = base_time + timedelta(seconds=turn_idx)
            turns.append({
                "role": "assistant",
                "content": assistant_turns[i],
                "createdAt": offset.isoformat().replace("+00:00", "Z"),
            })
            turn_idx += 1

    url = f"{settings.MOC_BACKEND_URL}/api/voice/transcript"
    payload = {
        "sessionId": voice_session.moc_session_id,
        "turns": turns,
    }

    try:
        async with aiohttp.ClientSession() as http:
            async with http.post(url, json=payload) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    logger.info(
                        "[session=%s] Transcript persisted: %d turns",
                        voice_session.session_id,
                        result.get("count", 0),
                    )
                else:
                    body = await resp.text()
                    logger.error(
                        "[session=%s] Transcript POST failed (%d): %s",
                        voice_session.session_id,
                        resp.status,
                        body[:200],
                    )
    except Exception as e:
        logger.error(
            "[session=%s] Transcript POST error: %s",
            voice_session.session_id,
            e,
        )


# ── Enriched Session Persistence ─────────────────────────────────────


async def _persist_session_complete(voice_session: Optional["VoiceSession"]) -> bool:
    """POST full metrics bundle to /api/voice/session-complete.

    Returns True if the enriched persistence succeeded, False otherwise.
    The caller should fall back to _persist_transcript() on failure.
    """
    if not voice_session or not voice_session.moc_session_id:
        return False

    if voice_session.session_metrics is None:
        logger.info(
            "[session=%s] No session_metrics — cannot send enriched data",
            voice_session.session_id,
        )
        return False

    try:
        bundle = voice_session.session_metrics.get_session_metrics()
    except Exception as e:
        logger.error(
            "[session=%s] Failed to serialize session metrics: %s",
            voice_session.session_id,
            e,
        )
        return False

    # Ensure the bundle uses the MoC session ID (not the voice service ID)
    bundle["sessionId"] = voice_session.moc_session_id

    # Check there is actual content to persist
    transcript = bundle.get("transcript", [])
    if not transcript:
        logger.info(
            "[session=%s] Empty enriched transcript — skipping session-complete",
            voice_session.session_id,
        )
        return False

    url = f"{settings.MOC_BACKEND_URL}/api/voice/session-complete"

    try:
        async with aiohttp.ClientSession() as http:
            async with http.post(url, json=bundle, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    logger.info(
                        "[session=%s] Session-complete persisted: %d turns, %d emotions",
                        voice_session.session_id,
                        result.get("transcriptCount", 0),
                        result.get("emotionCount", 0),
                    )
                    return True
                else:
                    body = await resp.text()
                    logger.error(
                        "[session=%s] session-complete POST failed (%d): %s",
                        voice_session.session_id,
                        resp.status,
                        body[:200],
                    )
                    return False
    except Exception as e:
        logger.error(
            "[session=%s] session-complete POST error: %s",
            voice_session.session_id,
            e,
        )
        return False


# ── Bot Runner ────────────────────────────────────────────────────────


async def _run_bot_session(
    semaphore: asyncio.Semaphore,
    room_url: str,
    token: str,
    session_id: str,
    moc_session_id: Optional[str],
    system_prompt: str,
) -> None:
    """Run the Pipecat bot, releasing the semaphore on exit."""
    voice_session = _sessions.get(session_id)

    def on_user_text(text: str) -> None:
        if voice_session:
            voice_session.user_turns.append(text)
        logger.info("[session=%s] User: %s", session_id, text[:80])

    def on_assistant_text(text: str) -> None:
        if voice_session:
            voice_session.assistant_turns.append(text)
        logger.info("[session=%s] Assistant: %s", session_id, text[:80])

    try:
        metrics = await create_bot(
            room_url=room_url,
            token=token,
            session_id=session_id,
            moc_session_id=moc_session_id,
            system_prompt=system_prompt,
            on_user_text=on_user_text,
            on_assistant_text=on_assistant_text,
        )
        if voice_session and metrics is not None:
            voice_session.session_metrics = metrics
    except Exception as e:
        logger.error("[session=%s] Bot error: %s", session_id, e)
    finally:
        # Try enriched persistence first; fall back to bare transcript
        enriched_ok = await _persist_session_complete(voice_session)
        if not enriched_ok:
            logger.info(
                "[session=%s] Falling back to bare transcript persistence",
                session_id,
            )
            await _persist_transcript(voice_session)

        semaphore.release()
        _sessions.pop(session_id, None)
        logger.info("[session=%s] Session cleaned up", session_id)


# ── API Schemas ───────────────────────────────────────────────────────


class StartRequest(BaseModel):
    system_prompt: str = Field(..., description="Full system prompt for Claude")
    moc_session_id: Optional[str] = Field(None, description="MindOverChatter session ID")


class StartResponse(BaseModel):
    room_url: str
    token: str
    session_id: str


class StopRequest(BaseModel):
    session_id: str


# ── Routes ────────────────────────────────────────────────────────────


@app.post("/start", response_model=StartResponse)
async def start_voice_session(
    request: StartRequest,
    background_tasks: BackgroundTasks,
) -> StartResponse:
    """Create a Daily room, spawn a Pipecat bot, return room credentials."""
    # Guard: check dependencies
    daily_error = get_daily_import_error()
    if daily_error:
        raise HTTPException(503, f"Daily transport unavailable: {daily_error}")
    if not settings.DAILY_API_KEY:
        raise HTTPException(503, "DAILY_API_KEY not configured")
    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY not configured")
    if not settings.CARTESIA_API_KEY:
        raise HTTPException(503, "CARTESIA_API_KEY not configured")

    # Guard: capacity
    if _bot_semaphore.locked():
        raise HTTPException(503, f"At capacity ({settings.MAX_SESSIONS} sessions)")
    await _bot_semaphore.acquire()

    try:
        room_url = await _create_daily_room()
        room_name = room_url.split("/")[-1]
        # Bot token: is_owner=True so bot can send audio into the room
        bot_token = await _create_daily_token(room_name, is_owner=True)
        # Client token: regular participant
        client_token = await _create_daily_token(room_name, is_owner=False)
        session_id = str(uuid4())

        _sessions[session_id] = VoiceSession(
            session_id=session_id,
            room_url=room_url,
            token=bot_token,
            moc_session_id=request.moc_session_id,
        )

        background_tasks.add_task(
            _run_bot_session,
            _bot_semaphore,
            room_url=room_url,
            token=bot_token,
            session_id=session_id,
            moc_session_id=request.moc_session_id,
            system_prompt=request.system_prompt,
        )
    except Exception:
        _bot_semaphore.release()
        raise

    logger.info(
        "Voice session started: session_id=%s room=%s",
        session_id,
        room_name,
    )

    return StartResponse(
        room_url=room_url,
        token=client_token,
        session_id=session_id,
    )


@app.post("/stop")
async def stop_voice_session(request: StopRequest) -> dict[str, str]:
    """Stop a voice session (client-initiated)."""
    session = _sessions.get(request.session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # The bot will stop when the Daily room participant leaves.
    # For now we just log and let the cleanup happen naturally.
    logger.info("Stop requested for session=%s", request.session_id)
    return {"status": "stopping", "session_id": request.session_id}


@app.get("/health")
async def health() -> dict[str, Any]:
    """Health check."""
    daily_error = get_daily_import_error()
    return {
        "status": "ok" if not daily_error else "degraded",
        "service": "voice",
        "active_sessions": len(_sessions),
        "max_sessions": settings.MAX_SESSIONS,
        "daily_available": daily_error is None,
        "daily_error": daily_error,
        "groq_configured": bool(settings.GROQ_API_KEY),
        "cartesia_configured": bool(settings.CARTESIA_API_KEY),
        "groq_llm_model": settings.GROQ_LLM_MODEL,
    }
