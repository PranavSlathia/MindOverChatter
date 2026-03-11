# Forge Memory

> Schema decisions, migration history, Hono route patterns, REST + SSE protocol notes.

---

## Schema Patterns

- **drizzle-orm 0.45.1** + **drizzle-kit 0.31.9** installed
- pgvector `vector` column: import from `drizzle-orm/pg-core` (built-in since 0.45.x)
- Schema file imports: use **extensionless** paths (e.g., `./sessions` not `./sessions.js`). Drizzle-kit's CJS loader cannot resolve `.js` -> `.ts`. TypeScript `moduleResolution: "bundler"` handles extensionless fine.
- Non-schema files (db/index.ts, routes, etc.) use `.js` extensions as normal for ESM
- All PKs: `uuid("id").defaultRandom()`
- All timestamps: `timestamp("col", { withTimezone: true })`
- pgEnum for constrained string unions (session_status, memory_type, etc.)

## Migration History

- **0000_round_makkari.sql**: Phase 0 foundation. 8 tables, 8 enums, 11 FKs.
  - Tables: user_profiles, sessions, messages, emotion_readings, mood_logs, assessments, memories, session_summaries
  - All vector columns: `vector(1024)` for BAAI/bge-m3 embeddings

## API Patterns

- Legacy WebSocket code removed in Phase 2. All communication is REST + SSE.
- Session routes mounted at `/api/sessions` with 4 endpoints (POST /, POST /:id/messages, GET /:id/events, POST /:id/end)
- SSE streaming uses in-memory `SessionEventEmitter` singleton (no Redis needed for single-user)
- Message endpoint returns `userMessageId` immediately; AI response streams via SSE
- Crisis detection runs BEFORE Claude call in the message route (non-negotiable)
- Route types exported for Hono RPC inference: `SessionRoutes` from sessions.ts, `AppType` from routes/index.ts
- Shared package exports types AND validators; watch for naming collisions between `types/index.ts` and `validators/*.ts`

## Memory Service Integration (Phase 3)

- Memory client: `apps/server/src/services/memory-client.ts` — HTTP client for Mem0 microservice
- Memory service endpoints use `/memories/` prefix: `/memories/search`, `/memories/add`, `/memories/summarize`
- Python service returns snake_case; client transforms to camelCase (memory_type -> memoryType, etc.)
- `searchMemories()` is BLOCKING with 5s timeout, returns `[]` on any failure (never throws)
- `addMemoriesAsync()` and `summarizeSessionAsync()` are fire-and-forget (never propagate errors)
- Provenance: after `addMemoriesAsync` gets response, insert into `memories` Drizzle table with source_session_id and source_message_id
- Memory context injected into SDK session prompt between system prompt and delimiter notice
- Crisis path NEVER triggers memory extraction (safe by construction: `addMemoriesAsync` lives inside `streamAiResponse`, which is only called in non-crisis path)
- `MemoryContextItem` interface exported from session-manager.ts for type sharing

## Build Notes

- `@types/node` must be explicitly listed in server devDependencies (not transitive)
- Stale `tsconfig.tsbuildinfo` in `packages/shared/` can cause phantom build failures; delete it to force clean rebuild
- Shared package has no build script; uses raw `.ts` exports consumed via tsconfig paths

## Key File Paths

- Schema: `apps/server/src/db/schema/*.ts`
- DB client: `apps/server/src/db/index.ts` (drizzle with schema for relational queries)
- Env: `apps/server/src/env.ts` (Zod-validated)
- Drizzle config: `apps/server/drizzle.config.ts`
- Routes: `apps/server/src/routes/sessions.ts` (Phase 2 session routes)
- SSE emitter: `apps/server/src/sse/emitter.ts`
- Orphan sweep: `apps/server/src/session/orphan-sweep.ts`
- SDK session manager: `apps/server/src/sdk/session-manager.ts` (Neura's domain)
- Memory client: `apps/server/src/services/memory-client.ts` (Forge's domain)
- Crisis detection: `apps/server/src/crisis/` (Neura's domain, do not touch)
- Validators: `packages/shared/src/validators/*.ts`
- Types: `packages/shared/src/types/index.ts`
- Constants: `packages/shared/src/constants/index.ts`
- Docker: `docker-compose.yml` (7 services)
- pgvector init: `scripts/init-db.sql`
