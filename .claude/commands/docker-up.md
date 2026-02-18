---
description: Start all Docker Compose services and verify health
---

# Docker Up — Start Services + Health Check

Starts all Docker Compose services and verifies they are healthy.

---

## Phase 1: Start Services

```bash
docker compose up -d
```

Wait for services to start (up to 30 seconds):

```bash
docker compose ps
```

---

## Phase 2: Health Checks

Wait for database to be ready:

```bash
docker compose exec db pg_isready -U moc
```

Check each service:

```bash
# Hono server
curl -sf http://localhost:3000/health || echo "Server not ready"

# Whisper service
curl -sf http://localhost:8001/health || echo "Whisper not ready"

# Emotion service
curl -sf http://localhost:8002/health || echo "Emotion not ready"

# TTS service
curl -sf http://localhost:8003/health || echo "TTS not ready"
```

---

## Phase 3: Summary

```
═══════════════════════════════════════════════════════════
DOCKER SERVICES STATUS
═══════════════════════════════════════════════════════════
web (5173):      [✅/❌]
server (3000):   [✅/❌]
db (5432):       [✅/❌]
whisper (8001):  [✅/❌]
emotion (8002):  [✅/❌]
tts (8003):      [✅/❌]
═══════════════════════════════════════════════════════════
```

---

## Troubleshooting

### Database not starting
```bash
docker compose logs db
```
Check if port 5432 is already in use: `lsof -i :5432`

### Python service not starting
```bash
docker compose logs whisper  # or emotion, tts
```
Common issue: model not downloaded yet (first run takes longer).

### Server not connecting to DB
Check DATABASE_URL in docker-compose.yml matches db service name and credentials.
