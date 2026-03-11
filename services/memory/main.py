from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(
    title="MindOverChatter Memory Service",
    description="Memory management using Mem0 + pgvector backend",
    version="0.1.0",
)


class AddMemoryRequest(BaseModel):
    user_id: str
    session_id: str
    messages: list[dict]
    metadata: dict = {}


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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "memory"}


@app.post("/memories/add")
async def add_memories(request: AddMemoryRequest):
    # TODO: implement Mem0 memory extraction (Phase 3)
    return {"memories_added": []}


@app.post("/memories/search")
async def search_memories(request: SearchMemoryRequest):
    # TODO: implement Mem0 memory search with pgvector (Phase 3)
    return {"memories": []}


@app.get("/memories/{user_id}")
async def get_all_memories(user_id: str):
    # TODO: implement Mem0 memory retrieval (Phase 3)
    return {"memories": []}


@app.post("/memories/summarize")
async def summarize_session(request: SummarizeRequest):
    # TODO: implement session summary storage (Phase 3)
    return {"stored": False}


@app.put("/memories/{memory_id}")
async def update_memory(memory_id: str, request: UpdateMemoryRequest):
    # TODO: implement Mem0 memory update (Phase 3)
    return {"updated": False}


@app.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str):
    # TODO: implement Mem0 memory deletion (Phase 3)
    return {"deleted": False}
