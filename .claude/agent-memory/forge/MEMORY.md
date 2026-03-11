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

- Shared package exports types AND validators; watch for naming collisions between `types/index.ts` and `validators/*.ts`
- Legacy WebSocket types (ClientMethod, ServerMethod, JsonRpcRequest) kept in types/index.ts with @deprecated tags until Pixel migrates to REST+SSE

## Key File Paths

- Schema: `apps/server/src/db/schema/*.ts`
- DB client: `apps/server/src/db/index.ts` (drizzle with schema for relational queries)
- Env: `apps/server/src/env.ts` (Zod-validated)
- Drizzle config: `apps/server/drizzle.config.ts`
- Validators: `packages/shared/src/validators/*.ts`
- Types: `packages/shared/src/types/index.ts`
- Constants: `packages/shared/src/constants/index.ts`
- Docker: `docker-compose.yml` (7 services)
- pgvector init: `scripts/init-db.sql`
