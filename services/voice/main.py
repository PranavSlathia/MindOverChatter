"""MindOverChatter Voice Service — Pipecat + Daily.co voice pipeline.

Manages voice session lifecycle:
- POST /start  — create Daily room, spawn Pipecat bot
- POST /stop   — end voice session
- GET  /health — service health check
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

import aiohttp
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from bot import create_bot, get_daily_import_error
from config import settings

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


async def _create_daily_token(room_name: str) -> str:
    """Create a meeting token for a Daily room."""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{settings.DAILY_API_URL}/meeting-tokens",
            headers={"Authorization": f"Bearer {settings.DAILY_API_KEY}"},
            json={
                "properties": {
                    "room_name": room_name,
                    "exp": int(datetime.now(timezone.utc).timestamp() + 3600),
                    "is_owner": False,
                }
            },
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise HTTPException(502, f"Daily token creation failed: {body}")
            data = await resp.json()
            return data["token"]


# ── Bot Runner ────────────────────────────────────────────────────────


async def _run_bot_session(
    semaphore: asyncio.Semaphore,
    room_url: str,
    token: str,
    session_id: str,
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
        await create_bot(
            room_url=room_url,
            token=token,
            session_id=session_id,
            system_prompt=system_prompt,
            on_user_text=on_user_text,
            on_assistant_text=on_assistant_text,
        )
    except Exception as e:
        logger.error("[session=%s] Bot error: %s", session_id, e)
    finally:
        semaphore.release()
        _sessions.pop(session_id, None)
        logger.info("[session=%s] Session cleaned up", session_id)

        # TODO: Persist transcript to MindOverChatter backend
        # POST /api/sessions/:id/voice-transcript with user_turns + assistant_turns


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
        token = await _create_daily_token(room_name)
        session_id = str(uuid4())

        _sessions[session_id] = VoiceSession(
            session_id=session_id,
            room_url=room_url,
            token=token,
            moc_session_id=request.moc_session_id,
        )

        background_tasks.add_task(
            _run_bot_session,
            _bot_semaphore,
            room_url=room_url,
            token=token,
            session_id=session_id,
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
        token=token,
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
        "claude_model": settings.CLAUDE_MODEL,
    }
