#!/usr/bin/env bash
# MindOverChatter — Dev startup script
# Runs Docker services (db, python, frontend) + server on host (for Keychain access)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[dev]${NC} $1"; }
warn() { echo -e "${YELLOW}[dev]${NC} $1"; }
err() { echo -e "${RED}[dev]${NC} $1"; }

# ── 1. Check CLI auth ─────────────────────────────────────────────
log "Checking CLI authentication..."
auth_failures=0

# Claude: main AI responses (REQUIRED)
if command -v claude &>/dev/null; then
  if claude auth status 2>/dev/null | grep -q '"loggedIn": true'; then
    log "  ✓ claude authenticated ($(claude auth status 2>/dev/null | grep -o '"email": "[^"]*"' | cut -d'"' -f4))"
  else
    err "  ✗ claude not authenticated — run: claude auth login"
    auth_failures=$((auth_failures + 1))
  fi
else
  err "  ✗ claude not installed — required for AI responses"
  auth_failures=$((auth_failures + 1))
fi

# Gemini: session supervisor (REQUIRED — primary lightweight model)
if command -v gemini &>/dev/null; then
  if gemini --prompt "say ok" --sandbox_mode off 2>/dev/null | grep -qi "ok"; then
    log "  ✓ gemini authenticated"
  else
    err "  ✗ gemini not authenticated — run: gemini (interactive login)"
    auth_failures=$((auth_failures + 1))
  fi
else
  warn "  - gemini not installed — supervisor will skip Gemini, use Haiku fallback"
fi

# Codex: available as fallback in cli-spawner (OPTIONAL)
if command -v codex &>/dev/null; then
  codex_status=$(codex login status 2>&1)
  if echo "$codex_status" | grep -qi "logged in"; then
    log "  ✓ codex authenticated ($(echo "$codex_status" | head -1))"
  else
    warn "  ✗ codex not authenticated — run: codex login"
    warn "    (optional: used as fallback only)"
  fi
else
  warn "  - codex not installed (optional fallback)"
fi

if [ "$auth_failures" -gt 0 ]; then
  err "Fix authentication above before starting. CLIs need macOS Keychain access."
  exit 1
fi

# ── 2. Start Docker services (everything except server) ───────────
log "Starting Docker services (db, python, frontend)..."
docker compose up -d db whisper emotion tts memory voice web 2>&1 | tail -5

# Wait for db health
log "Waiting for database..."
timeout=30
while ! docker compose ps db --format '{{.Status}}' 2>/dev/null | grep -q healthy; do
  sleep 1
  timeout=$((timeout - 1))
  if [ $timeout -le 0 ]; then
    err "Database failed to become healthy"
    exit 1
  fi
done
log "  ✓ Database healthy"

# ── 3. Stop Docker server if running ──────────────────────────────
if docker compose ps server --format '{{.Status}}' 2>/dev/null | grep -q Up; then
  log "Stopping Docker server (will run on host instead)..."
  docker compose stop server 2>&1 | tail -1
fi

# ── 4. Kill any stale server on port 3000 ─────────────────────────
if lsof -i :3000 -t &>/dev/null; then
  warn "Port 3000 in use — killing stale process"
  kill $(lsof -i :3000 -t) 2>/dev/null || true
  sleep 1
fi

# ── 5. Source .env ────────────────────────────────────────────────
if [ -f "$ROOT/.env" ]; then
  set -a
  source "$ROOT/.env"
  set +a
fi

# ── 6. Start server on host ──────────────────────────────────────
log "Starting server on host (port 3000)..."
export DATABASE_URL="postgresql://moc:${DB_PASSWORD:-password}@localhost:5433/moc"
export WHISPER_SERVICE_URL="http://localhost:8001"
export EMOTION_SERVICE_URL="http://localhost:8002"
export TTS_SERVICE_URL="http://localhost:8003"
export MEMORY_SERVICE_URL="http://localhost:8004"
export VOICE_SERVICE_URL="http://localhost:8005"

"$ROOT/apps/server/node_modules/.bin/tsx" "$ROOT/apps/server/src/index.ts" &
SERVER_PID=$!

# ── 7. Wait for server health ────────────────────────────────────
log "Waiting for server..."
timeout=15
while ! curl -s http://localhost:3000/health &>/dev/null; do
  sleep 1
  timeout=$((timeout - 1))
  if [ $timeout -le 0 ]; then
    err "Server failed to start"
    kill $SERVER_PID 2>/dev/null
    exit 1
  fi
done
log "  ✓ Server healthy (PID $SERVER_PID)"

# ── 8. Summary ───────────────────────────────────────────────────
echo ""
log "All services running:"
echo "  Frontend:  http://localhost:5173"
echo "  Server:    http://localhost:3000 (host, PID $SERVER_PID)"
echo "  Database:  localhost:5433"
echo "  Whisper:   localhost:8001"
echo "  Emotion:   localhost:8002"
echo "  TTS:       localhost:8003"
echo "  Memory:    localhost:8004"
echo "  Voice:     localhost:8005"
echo ""
log "Press Ctrl+C to stop the server (Docker services stay running)"

# ── 9. Trap cleanup ─────────────────────────────────────────────
cleanup() {
  echo ""
  log "Stopping server (PID $SERVER_PID)..."
  kill $SERVER_PID 2>/dev/null
  log "Docker services still running. Stop with: docker compose down"
}
trap cleanup EXIT INT TERM

# Keep foreground
wait $SERVER_PID
