"""MindOverChatter Memory Service — Mem0 + pgvector backend.

Thin FastAPI wrapper around Mem0 for memory extraction, search,
and lifecycle management. Connects to the shared PostgreSQL instance
via pgvector.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("moc.memory")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MindOverChatter Memory Service",
    description="Memory management using Mem0 + pgvector backend",
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# Memory types (the 10 structured types from the design doc)
# ---------------------------------------------------------------------------

VALID_MEMORY_TYPES = {
    "profile_fact",
    "relationship",
    "goal",
    "coping_strategy",
    "recurring_trigger",
    "life_event",
    "symptom_episode",
    "unresolved_thread",
    "safety_critical",
    "win",
}

# ---------------------------------------------------------------------------
# Custom extraction prompt
# ---------------------------------------------------------------------------

CUSTOM_EXTRACTION_PROMPT = """You are a memory extraction engine for a mental wellness companion app.
Your job is to extract discrete, factual memories from a therapy-style conversation.

For each fact you extract, you MUST classify it into exactly ONE of these 10 types:
- profile_fact: Biographical information (name, age, job, location, preferences)
- relationship: People in the user's life and their role/dynamic
- goal: Things the user wants to achieve or is working toward
- coping_strategy: Things that help the user manage stress, anxiety, or emotions
- recurring_trigger: Situations, people, or contexts that consistently cause distress
- life_event: Significant events (past, present, or planned future)
- symptom_episode: Descriptions of mental health symptoms or episodes
- unresolved_thread: Topics brought up but not fully explored or resolved
- safety_critical: Anything related to self-harm, crisis history, medications, or safety concerns
- win: Positive achievements, progress, breakthroughs, or good moments

For each extracted fact, also assign a confidence score from 0.0 to 1.0:
- 1.0: Explicitly and clearly stated by the user
- 0.8: Strongly implied with clear context
- 0.6: Reasonably inferred from conversation
- 0.4: Weakly implied, may need confirmation

Rules:
- Be conservative — only extract clearly stated or strongly implied facts
- Do NOT infer diagnoses or clinical conclusions
- Do NOT extract the AI companion's statements as user facts
- Each memory should be a single, atomic fact (not a paragraph)
- Prefer the user's own words when possible
- safety_critical memories should have confidence >= 0.8 (only extract when clearly stated)

Output each memory with its type and confidence."""


# ---------------------------------------------------------------------------
# Mem0 initialization (graceful — service starts even if Mem0 fails)
# ---------------------------------------------------------------------------

_memory_client: Any = None
_init_error: str | None = None


def _build_mem0_config() -> dict:
    """Build Mem0 configuration from environment variables."""
    db_host = os.getenv("DB_HOST", "db")
    db_port = int(os.getenv("DB_PORT", "5432"))
    db_user = os.getenv("DB_USER", "moc")
    db_password = os.getenv("DB_PASSWORD")
    db_name = os.getenv("DB_NAME", "moc")
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")

    if not db_password:
        raise ValueError("DB_PASSWORD environment variable is required")
    if not anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is required")

    return {
        "vector_store": {
            "provider": "pgvector",
            "config": {
                "host": db_host,
                "port": db_port,
                "user": db_user,
                "password": db_password,
                "dbname": db_name,
                "collection_name": "memories",
                "embedding_model_dims": 1024,
            },
        },
        "llm": {
            "provider": "anthropic",
            "config": {
                "model": "claude-haiku-4-5-20251001",
                "api_key": anthropic_api_key,
            },
        },
        "embedder": {
            "provider": "huggingface",
            "config": {
                "model": "BAAI/bge-m3",
            },
        },
        "custom_prompt": CUSTOM_EXTRACTION_PROMPT,
    }


def _init_mem0() -> None:
    """Attempt to initialize the Mem0 client. Sets _init_error on failure."""
    global _memory_client, _init_error  # noqa: PLW0603

    try:
        from mem0 import Memory  # noqa: PLC0415

        config = _build_mem0_config()
        _memory_client = Memory.from_config(config)
        _init_error = None
        logger.info("Mem0 initialized successfully (pgvector + Anthropic + HuggingFace embedder)")
    except Exception as exc:
        _init_error = str(exc)
        _memory_client = None
        logger.error("Mem0 initialization failed: %s", exc)
        logger.warning("Memory endpoints will return 503 until initialization succeeds")


# Run initialization at import time (during startup)
_init_mem0()


def _require_mem0() -> Any:
    """Guard that raises 503 if Mem0 is not initialized."""
    if _memory_client is None:
        raise HTTPException(
            status_code=503,
            detail=f"Memory service not initialized: {_init_error or 'unknown error'}",
        )
    return _memory_client


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class AddMemoryRequest(BaseModel):
    user_id: str
    session_id: str
    messages: list[dict]
    metadata: dict = Field(default_factory=dict)


class SearchMemoryRequest(BaseModel):
    user_id: str
    query: str
    limit: int = 15
    memory_types: list[str] | None = None


class UpdateMemoryRequest(BaseModel):
    content: str


class SummarizeRequest(BaseModel):
    user_id: str
    session_id: str
    summary: str


class MemoryEventType(str, Enum):
    ADD = "ADD"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    NONE = "NONE"


class AddedMemory(BaseModel):
    id: str
    supersedes_id: str | None = None
    content: str
    memory_type: str
    confidence: float
    event: MemoryEventType


class AddMemoryResponse(BaseModel):
    memories_added: list[AddedMemory]


class RetrievedMemory(BaseModel):
    id: str
    content: str
    memory_type: str
    confidence: float
    relevance: float
    created_at: str


class SearchMemoryResponse(BaseModel):
    memories: list[RetrievedMemory]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_memory_type(metadata: dict | None) -> str:
    """Extract memory_type from Mem0 metadata, defaulting to profile_fact."""
    if metadata and "memory_type" in metadata:
        mtype = metadata["memory_type"]
        if mtype in VALID_MEMORY_TYPES:
            return mtype
    return "profile_fact"


def _parse_confidence(metadata: dict | None) -> float:
    """Extract confidence score from Mem0 metadata, defaulting to 0.8."""
    if metadata and "confidence" in metadata:
        try:
            return max(0.0, min(1.0, float(metadata["confidence"])))
        except (TypeError, ValueError):
            pass
    return 0.8


def _map_event(event_str: str | None) -> MemoryEventType:
    """Map Mem0 event string to our enum."""
    if event_str is None:
        return MemoryEventType.ADD
    upper = event_str.upper()
    if upper in ("ADD", "ADDED"):
        return MemoryEventType.ADD
    if upper in ("UPDATE", "UPDATED"):
        return MemoryEventType.UPDATE
    if upper in ("DELETE", "DELETED"):
        return MemoryEventType.DELETE
    if upper in ("NONE", "NOOP"):
        return MemoryEventType.NONE
    return MemoryEventType.ADD


def _normalize_mem0_result(result: Any) -> list[dict]:
    """Normalize Mem0 add() result into a consistent list of dicts.

    Mem0's return format can vary between versions. This function
    handles the known shapes:
      - {"results": [...]}  (v0.1.x)
      - list of dicts directly
      - {"memories": [...]}
    """
    if isinstance(result, dict):
        if "results" in result:
            return result["results"]
        if "memories" in result:
            return result["memories"]
        # Single result wrapped in a dict
        if "id" in result:
            return [result]
        return []
    if isinstance(result, list):
        return result
    return []


def _normalize_search_result(result: Any) -> list[dict]:
    """Normalize Mem0 search()/get_all() result into a consistent list."""
    if isinstance(result, dict):
        if "results" in result:
            return result["results"]
        if "memories" in result:
            return result["memories"]
        return []
    if isinstance(result, list):
        return result
    return []


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Health check reflecting Mem0 initialization status."""
    if _memory_client is not None:
        return {"status": "ok", "service": "memory", "mem0": "initialized"}
    return {
        "status": "degraded",
        "service": "memory",
        "mem0": "not_initialized",
        "error": _init_error,
    }


@app.post("/memories/add", response_model=AddMemoryResponse)
async def add_memories(request: AddMemoryRequest):
    """Extract memories from conversation messages using Mem0.

    Mem0 uses Claude Haiku to extract facts, generates embeddings via
    bge-m3, and stores them in pgvector. The custom extraction prompt
    classifies each fact into one of 10 memory types.
    """
    mem = _require_mem0()

    try:
        result = mem.add(
            messages=request.messages,
            user_id=request.user_id,
            metadata={
                "session_id": request.session_id,
                **request.metadata,
            },
        )
    except Exception as exc:
        logger.error("Mem0 add() failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Memory extraction failed: {exc}") from exc

    raw_memories = _normalize_mem0_result(result)
    memories_added: list[AddedMemory] = []

    for entry in raw_memories:
        event = _map_event(entry.get("event"))

        # Skip NOOP entries
        if event == MemoryEventType.NONE:
            continue

        memory_id = entry.get("id", "")
        content = entry.get("memory", entry.get("text", entry.get("content", "")))
        metadata = entry.get("metadata", {}) or {}

        # Determine supersedes_id for UPDATE events
        supersedes_id: str | None = None
        if event == MemoryEventType.UPDATE:
            # Mem0 may provide the old memory ID in different fields
            prev = entry.get("previous_memory")
            if isinstance(prev, dict):
                supersedes_id = prev.get("id")
            elif isinstance(prev, str):
                supersedes_id = prev
            # Also check for old_memory_id in metadata
            if supersedes_id is None:
                supersedes_id = metadata.get("old_memory_id")

        memories_added.append(
            AddedMemory(
                id=memory_id,
                supersedes_id=supersedes_id,
                content=content,
                memory_type=_parse_memory_type(metadata),
                confidence=_parse_confidence(metadata),
                event=event,
            )
        )

    return AddMemoryResponse(memories_added=memories_added)


@app.post("/memories/search", response_model=SearchMemoryResponse)
async def search_memories(request: SearchMemoryRequest):
    """Search memories by semantic similarity using pgvector.

    Optionally filter by memory_types post-search.
    """
    mem = _require_mem0()

    try:
        result = mem.search(
            query=request.query,
            user_id=request.user_id,
            limit=request.limit,
        )
    except Exception as exc:
        logger.error("Mem0 search() failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Memory search failed: {exc}") from exc

    raw_memories = _normalize_search_result(result)
    memories: list[RetrievedMemory] = []

    for entry in raw_memories:
        metadata = entry.get("metadata", {}) or {}
        memory_type = _parse_memory_type(metadata)

        # Apply memory_types filter if provided
        if request.memory_types and memory_type not in request.memory_types:
            continue

        content = entry.get("memory", entry.get("text", entry.get("content", "")))
        relevance = entry.get("score", entry.get("relevance", 0.0))
        created_at = entry.get("created_at", entry.get("created_at", ""))

        # Normalize created_at to ISO string
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        elif not created_at:
            created_at = datetime.now(timezone.utc).isoformat()

        memories.append(
            RetrievedMemory(
                id=entry.get("id", ""),
                content=content,
                memory_type=memory_type,
                confidence=_parse_confidence(metadata),
                relevance=float(relevance) if relevance else 0.0,
                created_at=str(created_at),
            )
        )

    return SearchMemoryResponse(memories=memories)


@app.get("/memories/{user_id}")
async def get_all_memories(user_id: str):
    """Return all memories for a user (admin/debug endpoint)."""
    mem = _require_mem0()

    try:
        result = mem.get_all(user_id=user_id)
    except Exception as exc:
        logger.error("Mem0 get_all() failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Memory retrieval failed: {exc}") from exc

    raw_memories = _normalize_search_result(result)
    memories = []

    for entry in raw_memories:
        metadata = entry.get("metadata", {}) or {}
        content = entry.get("memory", entry.get("text", entry.get("content", "")))
        created_at = entry.get("created_at", "")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        elif not created_at:
            created_at = datetime.now(timezone.utc).isoformat()

        memories.append({
            "id": entry.get("id", ""),
            "content": content,
            "memory_type": _parse_memory_type(metadata),
            "confidence": _parse_confidence(metadata),
            "created_at": str(created_at),
            "metadata": metadata,
        })

    return {"memories": memories}


@app.post("/memories/summarize")
async def summarize_session(request: SummarizeRequest):
    """Store a session summary as a Mem0 memory entry.

    The summary is stored with metadata marking it as a session-level
    summary, which can be retrieved later for context assembly.
    """
    mem = _require_mem0()

    try:
        result = mem.add(
            messages=[{"role": "assistant", "content": request.summary}],
            user_id=request.user_id,
            metadata={
                "session_id": request.session_id,
                "level": "session",
                "memory_type": "unresolved_thread",
            },
        )
    except Exception as exc:
        logger.error("Mem0 summarize failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Session summary storage failed: {exc}") from exc

    raw_memories = _normalize_mem0_result(result)
    stored_ids = [entry.get("id", "") for entry in raw_memories if entry.get("id")]

    return {"stored": True, "memory_ids": stored_ids}


@app.put("/memories/{memory_id}")
async def update_memory(memory_id: str, request: UpdateMemoryRequest):
    """Update a specific memory's content in Mem0."""
    mem = _require_mem0()

    try:
        mem.update(memory_id=memory_id, data=request.content)
    except Exception as exc:
        logger.error("Mem0 update() failed for %s: %s", memory_id, exc)
        raise HTTPException(status_code=500, detail=f"Memory update failed: {exc}") from exc

    return {"updated": True, "memory_id": memory_id}


@app.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str):
    """Delete a memory from Mem0.

    Note: safety_critical memories should be protected at the
    application layer (Hono server) — this endpoint does not
    enforce that rule to keep the service simple.
    """
    mem = _require_mem0()

    try:
        mem.delete(memory_id=memory_id)
    except Exception as exc:
        logger.error("Mem0 delete() failed for %s: %s", memory_id, exc)
        raise HTTPException(status_code=500, detail=f"Memory deletion failed: {exc}") from exc

    return {"deleted": True, "memory_id": memory_id}
