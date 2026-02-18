---
name: hono-rpc-wiring
description: End-to-end Hono RPC type flow from Zod schemas through server routes to React frontend with zero codegen
user-invocable: false
---

# Hono RPC End-to-End Type Wiring

## Purpose

End-to-end type inference from Hono server routes to React frontend with zero codegen. The type chain flows: Zod schema (shared) -> Hono route with zValidator -> exported route type -> hc() client on frontend. No OpenAPI specs, no code generation steps, no manual type definitions.

## The Type Flow Chain

```
packages/shared/src/validators/*.ts   (Zod schema -- single source of truth)
        |
        v
apps/server/src/routes/*.ts           (Hono route + zValidator middleware)
        |
        v
apps/server/src/index.ts              (App type export)
        |
        v
apps/web/src/lib/api.ts               (hc<AppType>() -- full type inference)
```

Every link in this chain must be present. If any link breaks, the frontend loses type safety.

## Step 1: Define Zod Schemas in Shared Package

All request/response schemas live in `packages/shared/src/validators/`. This is the single source of truth for data shapes across the entire stack.

```ts
// packages/shared/src/validators/session.ts
import { z } from "zod";

export const createSessionSchema = z.object({
  title: z.string().optional(),
  moodBefore: z.number().int().min(1).max(10).optional(),
});

export const sessionResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  moodBefore: z.number().nullable(),
  moodAfter: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
```

## Step 2: Wire Zod into Hono Routes with zValidator

Routes live in `apps/server/src/routes/`. Use `zValidator` middleware to bind the Zod schema to the route. The route type MUST be exported.

```ts
// apps/server/src/routes/sessions.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createSessionSchema } from "@moc/shared/validators/session";

const app = new Hono()
  .post(
    "/",
    zValidator("json", createSessionSchema),
    async (c) => {
      const input = c.req.valid("json"); // fully typed from Zod schema
      // ... create session logic
      return c.json({ session }, 201);
    }
  )
  .get(
    "/:id",
    async (c) => {
      const id = c.req.param("id");
      // ... fetch session logic
      return c.json({ session });
    }
  );

export default app;
```

In the main app file, chain all route modules and export the type:

```ts
// apps/server/src/index.ts
import { Hono } from "hono";
import sessions from "./routes/sessions";
import messages from "./routes/messages";

const app = new Hono()
  .route("/api/sessions", sessions)
  .route("/api/messages", messages);

export type AppType = typeof app; // THIS EXPORT IS CRITICAL
export default app;
```

## Step 3: Use hc() on the Frontend for Full Inference

```ts
// apps/web/src/lib/api.ts
import { hc } from "hono/client";
import type { AppType } from "@moc/server";

export const client = hc<AppType>(import.meta.env.VITE_API_URL);

// Usage -- fully typed, no manual types needed:
// client.api.sessions.$post({ json: { title: "Morning check-in" } })
// client.api.sessions[":id"].$get({ param: { id: "abc-123" } })
```

The `client` object mirrors the server route tree exactly. Request bodies, query params, path params, and responses are all inferred from the Zod schemas and route definitions.

## Why This Eliminates OpenAPI Codegen

Traditional API development: Write OpenAPI spec -> generate types -> generate client -> keep in sync.

Hono RPC approach: The schema IS the code. Zod schemas define validation AND types. Hono infers route types from the validators. `hc()` infers the client from the route types. There is no generation step, no spec to drift, no sync to break.

## Common Pitfalls

1. **Forgetting to export the app type.** If `export type AppType = typeof app;` is missing from the server entry point, the frontend has no type to infer from. This is the most common mistake.

2. **Not using zValidator.** If you parse the body manually (`await c.req.json()`) instead of using `zValidator("json", schema)`, the type chain breaks. The validator middleware is what connects Zod to the Hono type system.

3. **Breaking the chain with `new Hono()` in route files without chaining.** Each `.get()`, `.post()`, etc. must be chained on the same Hono instance. Creating separate instances and merging them loses type information.

4. **Importing types from the wrong package.** Frontend must import `AppType` from the server package, not re-define it. The `@moc/server` package export must include the type.

5. **Using `app.route()` without chaining.** This loses type inference:
   ```ts
   // BAD -- loses types
   const app = new Hono();
   app.route("/api/sessions", sessions);

   // GOOD -- preserves types
   const app = new Hono()
     .route("/api/sessions", sessions);
   ```
