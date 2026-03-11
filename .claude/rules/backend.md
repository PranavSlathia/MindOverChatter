---
paths:
  - "apps/server/**/*.ts"
---

# Backend Rules (Forge Domain)

- Hono route handlers export their type for Hono RPC inference
- Use `zValidator()` for request validation with shared Zod schemas
- SSE streaming via `streamSSE` helper — never raw WebSocket
- All REST endpoints follow: `POST /api/resource` (create), `GET /api/resource/:id` (read), `POST /api/resource/:id/action` (action)
- Session lifecycle: `POST /api/sessions` → `POST /api/sessions/:id/messages` → `POST /api/sessions/:id/end`
- SSE event types: `ai.chunk`, `ai.thinking`, `ai.response_complete`, `ai.tool_use`, `ai.error`
- Emotion ingestion: `POST /api/emotions` with HTTP keep-alive
- Never manually edit files in `apps/server/drizzle/` — use `pnpm db:generate`
