# Mem0 Integration Plan — MindOverChatter

> Detailed plan for integrating Mem0 memory extraction and retrieval into the MindOverChatter stack.

---

## 1. The Problem

Mem0 (`mem0ai/mem0`) is a Python library. Our backend is Hono (TypeScript/Node.js). These don't run in the same process. We need a clean integration path that:

- Extracts key facts from therapy conversations automatically
- Stores memories in pgvector (our single database)
- Retrieves relevant memories for new session context assembly
- Fits within our Docker Compose architecture

---

## 2. Integration Options

### Option A: Mem0 as a 4th Python Microservice (RECOMMENDED)

Add a `memory-service` alongside whisper, emotion, and tts.

```
services/
├── whisper/       # STT (port 8001)
├── emotion/       # Voice emotion (port 8002)
├── tts/           # Text-to-speech (port 8003)
└── memory/        # Mem0 memory service (port 8004)
```

**How it works:**
- Thin FastAPI wrapper around Mem0's Python SDK
- Connects to the same PostgreSQL instance (pgvector as Mem0's vector backend)
- Hono server calls it via HTTP like the other Python services
- Follows identical pattern: Dockerfile + pyproject.toml + main.py + uv

**Endpoints:**

```python
POST /memories/add
  Body: { user_id, session_id, messages: [...], metadata: {} }
  → Mem0 extracts facts from conversation messages
  → Each extracted memory is typed: profile_fact | relationship | goal | coping_strategy |
    recurring_trigger | life_event | symptom_episode | unresolved_thread | safety_critical | win
  → Returns: { memories_added: [{ id, content, memory_type, confidence, source_message_id }] }

POST /memories/search
  Body: { user_id, query: "string", limit: 15, memory_types?: [...] }
  → Mem0 retrieves relevant memories via semantic search
  → Applies confidence decay for unconfirmed memories (90+ days)
  → Safety-critical memories are never decayed
  → Returns: { memories: [{ id, content, memory_type, confidence, relevance, last_confirmed_at, created_at }] }

GET /memories/{user_id}
  → Returns all memories for a user (admin/debug)

DELETE /memories/{memory_id}
  → Deletes a specific memory

PUT /memories/{memory_id}
  Body: { content: "updated memory text" }
  → Updates a memory

POST /memories/summarize
  Body: { user_id, session_id, summary: "..." }
  → Stores session summary as a memory with session-level metadata

GET /health
  → Standard health check
```

**Mem0 Configuration:**

```python
from mem0 import Memory

config = {
    "vector_store": {
        "provider": "pgvector",
        "config": {
            "host": "db",           # Docker Compose service name
            "port": 5432,
            "user": "moc",
            "password": "...",      # From env
            "dbname": "mindoverchatter",
            "collection_name": "memories",
            "embedding_model_dims": 1024,
        }
    },
    "llm": {
        "provider": "anthropic",
        "config": {
            "model": "claude-haiku-4-5-20251001",
            "api_key": "...",       # From env
        }
    },
    "embedder": {
        "provider": "huggingface",
        "config": {
            "model": "BAAI/bge-m3",  # Self-hosted, matches our embedding choice
        }
    }
}

memory = Memory.from_config(config)
```

**Advantages:**
- Follows existing Python service pattern exactly
- Mem0 manages its own tables in pgvector (no schema conflicts)
- Independent scaling and resource allocation
- Easy to test in isolation
- Mem0's LLM calls (for fact extraction) use Claude Haiku — cost-effective

**Disadvantages:**
- One more Docker container
- HTTP latency for memory operations (acceptable — not in hot path)

---

### Option B: Mem0 Embedded in Emotion Service

Combine Mem0 into the emotion-service to reduce container count.

**Why NOT:**
- Violates single-responsibility principle
- Emotion service handles audio processing (GPU-adjacent workload)
- Memory service handles text + embeddings (CPU workload)
- Different scaling characteristics
- Harder to debug

---

### Option C: Direct pgvector from Hono (Skip Mem0)

Implement memory extraction manually in TypeScript using:
- Claude Haiku API calls for fact extraction
- Direct pgvector queries via Drizzle ORM
- Manual embedding generation via BAAI/bge-m3 API

**Why NOT for v1:**
- Reinventing what Mem0 already does well
- Mem0's extraction quality is proven (26% better than OpenAI memory)
- We'd need to build relevance scoring, deduplication, and memory management from scratch
- Can consider this for v2 if we want to eliminate the Python dependency

---

## 3. Recommended Architecture (Option A)

### Data Flow

```
Therapy Session Active
        │
        ▼
[User sends message] ──► [Hono Server processes + Claude responds]
        │
        ▼
[After each turn]
  Hono calls POST /memories/add to memory-service
  with: { user_id, messages: [user_msg, ai_response] }
        │
        ▼
[Mem0 internally]:
  1. Sends messages to Claude Haiku for fact extraction
  2. Haiku identifies key facts + assigns memory_type: "User lost their job last week" (life_event)
  3. Mem0 generates embedding via bge-m3
  4. Stores fact + embedding + provenance (source_session_id, source_message_id, confidence) in pgvector
  5. Deduplicates against existing memories; if contradicting, sets superseded_by on old memory
  6. Returns extracted facts to Hono
```

```
New Session Starts
        │
        ▼
[Hono Server] calls POST /memories/search
  with: { user_id, query: "user context", limit: 15 }
        │
        ▼
[Mem0 internally]:
  1. Generates query embedding via bge-m3
  2. Searches pgvector by cosine similarity
  3. Scores by relevance × importance × recency
  4. Returns top 10-15 memories (~12,000 tokens)
        │
        ▼
[Hono assembles context]:
  System prompt + User profile + Session summaries + Mem0 memories
  Total: ~120,000 token budget
```

### When Memory Operations Happen

| Event | Memory Action | Blocking? |
|-------|--------------|-----------|
| After each user turn | `POST /memories/add` with latest exchange | No (fire-and-forget) |
| Session end | `POST /memories/summarize` with session summary | No (background) |
| New session start | `POST /memories/search` for relevant context | Yes (needed for context) |
| Weekly rollup | `POST /memories/add` with weekly patterns | No (scheduled) |

### Memory Extraction Timing

Memory extraction (`/memories/add`) should be **non-blocking**. The Hono server fires the request after sending the AI response to the user, so memory extraction doesn't add latency to the conversation flow.

Memory retrieval (`/memories/search`) happens **once at session start** and is blocking — we need the memories before assembling the Claude context.

---

## 4. Docker Compose Addition

```yaml
  memory:
    build:
      context: services/memory
    ports:
      - "8004:8004"
    environment:
      - DATABASE_URL=postgresql://moc:${DB_PASSWORD}@db:5432/mindoverchatter
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - model-cache:/app/models    # bge-m3 model cache
    depends_on:
      db:
        condition: service_healthy
    networks:
      - moc-net
```

---

## 5. Service Implementation Skeleton

```python
# services/memory/main.py
from fastapi import FastAPI
from mem0 import Memory
from pydantic import BaseModel
import os

app = FastAPI(title="MindOverChatter Memory Service", version="0.1.0")

config = {
    "vector_store": {
        "provider": "pgvector",
        "config": {
            "host": os.getenv("DB_HOST", "db"),
            "port": int(os.getenv("DB_PORT", 5432)),
            "user": os.getenv("DB_USER", "moc"),
            "password": os.getenv("DB_PASSWORD"),
            "dbname": os.getenv("DB_NAME", "mindoverchatter"),
            "collection_name": "memories",
            "embedding_model_dims": 1024,
        }
    },
    "llm": {
        "provider": "anthropic",
        "config": {
            "model": "claude-haiku-4-5-20251001",
            "api_key": os.getenv("ANTHROPIC_API_KEY"),
        }
    },
    "embedder": {
        "provider": "huggingface",
        "config": {
            "model": "BAAI/bge-m3",
        }
    }
}

memory = Memory.from_config(config)


class AddMemoryRequest(BaseModel):
    user_id: str
    session_id: str
    messages: list[dict]
    metadata: dict = {}


class SearchMemoryRequest(BaseModel):
    user_id: str
    query: str
    limit: int = 15


@app.get("/health")
async def health():
    return {"status": "ok", "service": "memory"}


@app.post("/memories/add")
async def add_memories(req: AddMemoryRequest):
    result = memory.add(
        messages=req.messages,
        user_id=req.user_id,
        metadata={"session_id": req.session_id, **req.metadata}
    )
    return {"memories_added": result}


@app.post("/memories/search")
async def search_memories(req: SearchMemoryRequest):
    results = memory.search(
        query=req.query,
        user_id=req.user_id,
        limit=req.limit
    )
    return {"memories": results}


@app.get("/memories/{user_id}")
async def get_all_memories(user_id: str):
    results = memory.get_all(user_id=user_id)
    return {"memories": results}


@app.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str):
    memory.delete(memory_id=memory_id)
    return {"deleted": True}
```

---

## 6. Hono Server Integration

The Hono server communicates with the memory service via HTTP:

```typescript
// apps/server/src/services/memory-client.ts

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:8004';

export async function addMemories(
  userId: string,
  sessionId: string,
  messages: Array<{ role: string; content: string }>
) {
  // Fire-and-forget — don't block the conversation
  fetch(`${MEMORY_SERVICE_URL}/memories/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, session_id: sessionId, messages }),
  }).catch(err => console.error('Memory add failed:', err));
}

export async function searchMemories(
  userId: string,
  query: string,
  limit = 15
): Promise<Array<{ id: string; content: string; relevance: number }>> {
  const res = await fetch(`${MEMORY_SERVICE_URL}/memories/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, query, limit }),
  });
  const data = await res.json();
  return data.memories;
}
```

---

## 7. Migration from "Mem0 Somewhere" to This Plan

### What Changes in Existing Docs

| Document | Change |
|----------|--------|
| TECHSTACK.md | Add memory-service to service list, port 8004 |
| ARCHITECTURE.md | Update memory architecture section with concrete service |
| docker-compose.yml | Add memory service definition |
| soul.md | Add memory-service to service map (port 8004, owner: Neura) |
| CODEGEN.md | No change — use `pnpm gen service new --name memory` |

### What Doesn't Change

- pgvector is still the single database for everything (Mem0 uses it as backend)
- Memory retrieval flow is identical — just now goes through HTTP
- Hierarchical memory levels (5 levels) remain the same
- Context assembly logic stays in the Hono server

---

## 8. Open Questions

1. **Mem0 version**: Pin to a specific release for stability?
2. **bge-m3 model loading**: First request will be slow (~30s to download model). Pre-download in Dockerfile?
3. **Memory deduplication**: Does Mem0's built-in dedup handle Hinglish well? Needs testing.
4. **Concurrent sessions**: If running multiple sessions (future), does Mem0 handle concurrent writes to same user?
5. **Memory editing**: Should the AI be able to self-edit memories (Letta/MemGPT pattern) in v1, or just v2?

---

## 9. Implementation Order

1. Scaffold service: `pnpm gen service new --name memory --port 8004`
2. Add Mem0 + bge-m3 to pyproject.toml dependencies
3. Implement health endpoint + basic add/search
4. Configure Mem0 with pgvector backend pointing to existing DB
5. Test with sample conversation data
6. Wire up Hono memory-client.ts
7. Integrate into session lifecycle (add after turns, search at session start)
8. Update docker-compose.yml
9. Test end-to-end
