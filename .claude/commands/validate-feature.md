---
description: Full-stack feature validation — build, test, and safety check
---

# Validate Feature — Full Stack Validation

Runs comprehensive validation across all layers for a feature.

---

## Phase 1: Build Validation

```bash
pnpm turbo build
```

If build fails, report errors and STOP.

---

## Phase 2: Test Validation

### Unit/Integration Tests
```bash
pnpm turbo test
```

### E2E Tests (if configured)
```bash
pnpm test:e2e
```

---

## Phase 3: Database Validation

Check that Drizzle migrations are in sync:

```bash
pnpm db:generate --dry-run
```

If this produces new migration files, the schema is out of sync.

Verify database connection:
```bash
curl -s http://localhost:3000/health
```

---

## Phase 4: Service Health Check

Check all Docker services are healthy:

```bash
docker compose ps
curl -s http://localhost:8001/health  # whisper
curl -s http://localhost:8002/health  # emotion
curl -s http://localhost:8003/health  # tts
```

---

## Phase 5: Therapeutic Safety (if applicable)

If the feature touches crisis detection, therapeutic skills, or AI responses:

1. Run crisis detection keyword tests
2. Verify hard-coded crisis responses
3. Check helpline numbers are correct
4. Verify "wellness companion" framing

---

## Summary

```
═══════════════════════════════════════════════════════════
FEATURE VALIDATION COMPLETE
═══════════════════════════════════════════════════════════
Build:     [✅/❌]
Tests:     [✅/❌] ([N] pass, [N] fail)
Database:  [✅/❌] (migrations in sync)
Services:  [✅/❌] ([N]/4 healthy)
Safety:    [✅/❌/N/A]
═══════════════════════════════════════════════════════════
```
