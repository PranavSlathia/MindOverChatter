---
paths:
  - "apps/web/**/*.{ts,tsx}"
---

# Frontend Rules (Pixel Domain)

- Use shadcn/ui components directly — no unnecessary wrappers
- Hono RPC client for type-safe API calls (types auto-inferred from server)
- Zustand for client state (minimal, hook-based stores)
- Calming theme: sage green primary, soft cream background, warm lavender accent
- Use CSS variables from shadcn theme — never hardcode colors
- Human.js: ZERO images leave the browser, JSON emotion scores only
- SSE via EventSource for AI streaming responses
- `navigator.sendBeacon()` on `beforeunload` for session end (best-effort)
