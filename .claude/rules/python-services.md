---
paths:
  - "services/**/*.py"
---

# Python Microservice Rules (Neura Domain)

- All services use FastAPI + uv for dependency management
- Every service MUST have a `GET /health` endpoint returning `{"status": "ok", "model": "..."}`
- Service ports: whisper=8001, emotion=8002, tts=8003, memory=8004
- Dockerfiles use multi-stage builds with uv
- Services connect to PostgreSQL via Docker Compose service name `db`
- Mem0 service uses pgvector backend on same PostgreSQL instance
- Memory extraction via `POST /memories/add` returns typed memories with confidence
- Memory search via `POST /memories/search` supports memory_type filtering and confidence decay
