---
paths:
  - "apps/server/src/db/**/*.ts"
---

# Database Rules (Forge Domain)

- Schema-first: edit Drizzle schema → `pnpm db:generate` → `pnpm db:migrate`
- pgvector columns use `vector(1024)` for BAAI/bge-m3 embeddings
- Canonical tables: user_profiles, sessions, messages, emotion_readings, mood_logs, assessments, memories, session_summaries
- memories.memoryType uses 12 typed categories: profile_fact, relationship, goal, coping_strategy, recurring_trigger, life_event, symptom_episode, unresolved_thread, safety_critical, win, session_summary, formative_experience
- memories must have provenance fields: sourceSessionId, sourceMessageId, confidence, lastConfirmedAt, supersededBy
- IVFFlat indexes for vector similarity searches
- Combined temporal + vector query pattern: `WHERE user_id = $1 AND created_at >= interval ORDER BY embedding <=> query LIMIT N`
- Create matching Zod validator in `packages/shared/src/validators/` for every schema change
