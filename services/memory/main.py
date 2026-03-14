"""MindOverChatter Memory Service — Mem0 + pgvector backend.

Thin FastAPI wrapper around Mem0 for memory extraction, search,
and lifecycle management. Connects to the shared PostgreSQL instance
via pgvector.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from fastapi import FastAPI, HTTPException, Response
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
    "session_summary",
    "formative_experience",
}

# ---------------------------------------------------------------------------
# Custom extraction prompt
# ---------------------------------------------------------------------------

CUSTOM_EXTRACTION_PROMPT = """You are a memory extraction engine for a mental wellness companion app.
Your job is to extract discrete, factual memories from a therapy-style conversation.

For each fact you extract, you MUST classify it into exactly ONE of these 11 types:
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
- formative_experience: Childhood or developmental experiences that shaped the user — early caregiving, family climate, formative events, memories of growing up, early beliefs about self/others/world

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

IMPORTANT: You MUST prefix each extracted memory with its type tag in square brackets.
Format: "[TYPE:memory_type_here] The actual memory content."
Example: "[TYPE:goal] Wants to reduce anxiety and sleep better."
Example: "[TYPE:relationship] Has a sister named Priya who lives in Delhi."
Example: "[TYPE:symptom_episode] Has been experiencing constant sadness for 2-3 months."
Example: "[TYPE:coping_strategy] Uses dry herb vaping to manage stress."
Example: "[TYPE:safety_critical] Has history of self-harm, last episode was 2 years ago."
Do NOT include the type tag anywhere else in the memory text.

Output each memory with its type tag prefix and confidence."""


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
    groq_api_key = os.getenv("GROQ_API_KEY")

    if not db_password:
        raise ValueError("DB_PASSWORD environment variable is required")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY environment variable is required")

    return {
        "vector_store": {
            "provider": "pgvector",
            "config": {
                "host": db_host,
                "port": db_port,
                "user": db_user,
                "password": db_password,
                "dbname": db_name,
                "collection_name": "mem0_vectors",
                "embedding_model_dims": 384,
            },
        },
        "llm": {
            "provider": "groq",
            "config": {
                "model": "llama-3.3-70b-versatile",
                "temperature": 0.1,
                "api_key": groq_api_key,
            },
        },
        "embedder": {
            "provider": "huggingface",
            "config": {
                "model": "BAAI/bge-small-en-v1.5",
                "embedding_dims": 384,
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
    """Extract memory_type from Mem0 metadata, defaulting to profile_fact.

    Accepts both snake_case (memory_type) from Python callers and
    camelCase (memoryType) from TypeScript callers.
    """
    if metadata:
        mtype = metadata.get("memory_type") or metadata.get("memoryType")
        if mtype and mtype in VALID_MEMORY_TYPES:
            return mtype
    return "profile_fact"


_TYPE_PREFIX_RE = re.compile(r"^\[TYPE:(\w+)\]\s*")


def _parse_type_prefix(content: str) -> tuple[str, str]:
    """Parse [TYPE:typename] prefix from memory content.

    Returns (memory_type, cleaned_content).
    Falls back to profile_fact if no valid prefix found.
    """
    match = _TYPE_PREFIX_RE.match(content)
    if match:
        mtype = match.group(1)
        cleaned = content[match.end():]
        if mtype in VALID_MEMORY_TYPES:
            return mtype, cleaned
    return "profile_fact", content


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
# Memory type classification (rules + Groq fallback)
# ---------------------------------------------------------------------------


def _classify_by_rules(content: str) -> str | None:
    """Deterministic rule-based memory type classification.

    Returns type if confident, None if unsure (fall through to Groq).
    """
    lower = content.lower()

    # Safety critical — high priority, check first
    if any(w in lower for w in [
        "self-harm", "self harm", "suicide", "suicidal", "crisis",
        "medication", "overdose", "cutting", "hurt myself", "end my life",
    ]):
        return "safety_critical"

    # Symptoms/episodes
    if any(w in lower for w in [
        "feeling sad", "feeling low", "sadness", "anxiety", "depression",
        "numbness", "insomnia", "sleep", "appetite", "fatigue", "anhedonia",
        "withdrawn", "foggy", "concentration", "panic", "restless",
        "hopeless", "worthless", "irritable", "mood swings",
    ]):
        return "symptom_episode"

    # Triggers
    if any(w in lower for w in [
        "trigger", "whenever", "every time", "makes me", "causes me",
        "stresses me", "comparison", "pressure", "reminds me of",
    ]):
        return "recurring_trigger"

    # Coping strategies
    if any(w in lower for w in [
        "helps me", "coping", "manage stress", "relax", "calms me",
        "works for me", "vaping", "exercise", "meditation", "journaling",
        "breathing", "walk", "music helps",
    ]):
        return "coping_strategy"

    # Relationships
    if any(w in lower for w in [
        "mother", "father", "sister", "brother", "friend", "partner",
        "wife", "husband", "parents", "family", "girlfriend", "boyfriend",
        "colleague", "boss", "therapist", "doctor",
    ]):
        return "relationship"

    # Life events
    if any(w in lower for w in [
        "moved to", "graduated", "got married", "started job", "lost job",
        "traveled", "trip to", "period in", "diagnosed", "broke up",
        "passed away", "born in", "relocated",
    ]):
        return "life_event"

    # Goals
    if any(w in lower for w in [
        "want to", "goal", "working toward", "hope to", "planning to",
        "trying to", "aim to", "wish to", "aspire",
    ]):
        return "goal"

    # Wins
    if any(w in lower for w in [
        "proud", "accomplished", "achievement", "better today",
        "breakthrough", "progress", "feel good", "managed to",
        "succeeded", "overcame",
    ]):
        return "win"

    # Formative experiences (childhood/developmental)
    if any(w in lower for w in [
        "grew up", "growing up", "childhood", "as a child", "when i was young",
        "when i was a kid", "my parents", "my mother", "my father", "my family",
        "caregivers", "caregiver", "formative", "shaped me", "early life",
        "early years", "my upbringing", "back then", "as a teenager",
    ]):
        return "formative_experience"

    return None  # Fall through to Groq


async def _classify_memory_type(content: str) -> str:
    """Use Groq to classify a memory into one of the 10 types.

    Returns the classified type, or 'profile_fact' if classification fails.
    """
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        return "profile_fact"

    import httpx  # noqa: PLC0415

    prompt = f"""Classify this memory into exactly ONE of these types:
- profile_fact: Biographical info (name, age, job, location)
- relationship: People in user's life and dynamics
- goal: Things user wants to achieve
- coping_strategy: Things that help manage stress/emotions
- recurring_trigger: Situations that consistently cause distress
- life_event: Significant past/present/planned events
- symptom_episode: Mental health symptoms or episodes
- unresolved_thread: Topics not fully explored
- safety_critical: Self-harm, crisis history, medications, safety
- win: Positive achievements, progress, breakthroughs
- formative_experience: Childhood/developmental experiences that shaped the user (early caregiving, family climate, growing up memories, early beliefs)

Memory: "{content}"

Respond with ONLY the type name, nothing else."""

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {groq_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 20,
                    "temperature": 0,
                },
                timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                raw = (
                    data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                    .lower()
                )
                if raw in VALID_MEMORY_TYPES:
                    return raw
                logger.warning("Groq returned unknown memory type: %s", raw)
    except Exception as exc:
        logger.warning("Groq memory classification failed: %s", exc)

    return "profile_fact"


async def _reclassify_if_needed(memories_added: list[AddedMemory]) -> None:
    """Re-classify memories that defaulted to profile_fact using rules + Groq.

    Mutates the memory_type field in-place on the AddedMemory objects.
    """
    for mem in memories_added:
        if mem.memory_type != "profile_fact":
            continue

        # Try deterministic rules first (fast, no network)
        ruled = _classify_by_rules(mem.content)
        if ruled:
            logger.info(
                "Rule-based reclassification: '%s...' -> %s",
                mem.content[:50],
                ruled,
            )
            mem.memory_type = ruled
            continue

        # Fall back to Groq classification
        classified = await _classify_memory_type(mem.content)
        if classified != "profile_fact":
            logger.info(
                "Groq reclassification: '%s...' -> %s",
                mem.content[:50],
                classified,
            )
            mem.memory_type = classified


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health(response: Response):
    """Health check reflecting Mem0 initialization status."""
    if _memory_client is not None:
        return {"status": "ok", "service": "memory", "mem0": "initialized"}
    response.status_code = 503
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
        raw_content = entry.get("memory", entry.get("text", entry.get("content", "")))
        metadata = entry.get("metadata", {}) or {}

        # Parse [TYPE:xxx] prefix from content (primary), fall back to metadata
        memory_type, clean_content = _parse_type_prefix(raw_content)
        if memory_type == "profile_fact" and raw_content == clean_content:
            # No prefix found — try metadata as fallback
            memory_type = _parse_memory_type(metadata)

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
                content=clean_content,
                memory_type=memory_type,
                confidence=_parse_confidence(metadata),
                event=event,
            )
        )

    # Re-classify memories that defaulted to profile_fact (rules first, then Groq)
    await _reclassify_if_needed(memories_added)

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
        raw_content = entry.get("memory", entry.get("text", entry.get("content", "")))

        # Parse [TYPE:xxx] prefix from stored content, fall back to metadata
        memory_type, clean_content = _parse_type_prefix(raw_content)
        if memory_type == "profile_fact" and raw_content == clean_content:
            memory_type = _parse_memory_type(metadata)

        # Apply memory_types filter if provided
        if request.memory_types and memory_type not in request.memory_types:
            continue

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
                content=clean_content,
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
        raw_content = entry.get("memory", entry.get("text", entry.get("content", "")))

        # Parse [TYPE:xxx] prefix from stored content, fall back to metadata
        memory_type, clean_content = _parse_type_prefix(raw_content)
        if memory_type == "profile_fact" and raw_content == clean_content:
            memory_type = _parse_memory_type(metadata)

        created_at = entry.get("created_at", "")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        elif not created_at:
            created_at = datetime.now(timezone.utc).isoformat()

        memories.append({
            "id": entry.get("id", ""),
            "content": clean_content,
            "memory_type": memory_type,
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
                "memory_type": "session_summary",
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


@app.post("/memories/reclassify/{user_id}")
async def reclassify_memories(user_id: str):
    """Reclassify all profile_fact memories for a user using rules + Groq.

    Used for backfilling existing memories after the typing fix.
    Reads all memories from Mem0, identifies those stuck as profile_fact,
    and attempts reclassification via rules (fast) then Groq (slow).
    """
    mem = _require_mem0()

    try:
        result = mem.get_all(user_id=user_id)
    except Exception as exc:
        logger.error("Mem0 get_all() failed during reclassify: %s", exc)
        raise HTTPException(status_code=500, detail=f"Memory retrieval failed: {exc}") from exc

    raw_memories = _normalize_search_result(result)
    reclassified: list[dict] = []

    for entry in raw_memories:
        raw_content = entry.get("memory", entry.get("text", entry.get("content", "")))
        memory_type, clean_content = _parse_type_prefix(raw_content)

        # Only reclassify memories that have no TYPE prefix and defaulted to profile_fact
        if memory_type != "profile_fact" or raw_content != clean_content:
            continue

        # Also check metadata — if metadata already has a valid type, skip
        metadata = entry.get("metadata", {}) or {}
        meta_type = _parse_memory_type(metadata)
        if meta_type != "profile_fact":
            continue

        # Try rules first (fast, deterministic)
        new_type = _classify_by_rules(clean_content)
        if not new_type:
            # Fall back to Groq classification
            new_type = await _classify_memory_type(clean_content)

        if new_type and new_type != "profile_fact":
            # Update the memory content with the type prefix so future reads work
            try:
                mem.update(memory_id=entry["id"], data=f"[TYPE:{new_type}] {clean_content}")
                reclassified.append({
                    "id": entry["id"],
                    "content": clean_content,
                    "old_type": "profile_fact",
                    "new_type": new_type,
                })
                logger.info(
                    "Reclassified memory %s: profile_fact -> %s",
                    entry.get("id"),
                    new_type,
                )
            except Exception as exc:
                logger.warning("Failed to reclassify memory %s: %s", entry.get("id"), exc)

    return {"reclassified": len(reclassified), "details": reclassified}
