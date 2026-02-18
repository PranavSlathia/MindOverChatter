# MindOverChatter - Auto Codegen & Scaffolding

> Automated code generation pipelines for the MindOverChatter tech stack

---

## Table of Contents

1. [Overview](#1-overview)
2. [Codegen Pipeline Map](#2-codegen-pipeline-map)
3. [Hygen Setup](#3-hygen-setup)
4. [Type Flow: Hono RPC + Shared Zod Schemas](#4-type-flow-hono-rpc--shared-zod-schemas)
5. [Database Schema Pipeline: Drizzle](#5-database-schema-pipeline-drizzle)
6. [Hygen Generators](#6-hygen-generators)
7. [pnpm Scripts](#7-pnpm-scripts)
8. [Generator Reference](#8-generator-reference)

---

## 1. Overview

### Philosophy

- **Schema is the source of truth** - Drizzle schema defines DB structure, types flow from it
- **Hono RPC eliminates API codegen** - TypeScript inference carries types from server to client, no OpenAPI spec needed
- **Hygen handles scaffolding** - New routes, features, services, and skills are generated from templates
- **Zero manual type syncing** - Types are inferred or generated, never hand-written in two places

### Codegen Tools

| Tool | Purpose | Trigger |
|---|---|---|
| **Hygen** | Template-based file scaffolding | `pnpm gen <generator> <action> --name <name>` |
| **Drizzle Kit** | DB migrations from schema changes | `pnpm db:generate` / `pnpm db:migrate` |
| **Hono RPC** | End-to-end type inference (server → client) | Automatic (TypeScript inference, no generation step) |
| **shadcn CLI** | UI component installation | `pnpm ui:add <component>` |

---

## 2. Codegen Pipeline Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CODEGEN PIPELINES                               │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  PIPELINE 1: Database Schema Flow (Drizzle)                  │  │
│  │                                                               │  │
│  │  Drizzle Schema (TypeScript)                                  │  │
│  │       │                                                       │  │
│  │       ├──► drizzle-kit generate ──► SQL Migration files       │  │
│  │       ├──► drizzle-kit migrate  ──► Apply to PostgreSQL       │  │
│  │       └──► TypeScript inference ──► Query result types        │  │
│  │                                     (auto, no codegen)        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  PIPELINE 2: API Type Flow (Hono RPC)                        │  │
│  │                                                               │  │
│  │  Zod Schema (packages/shared)                                 │  │
│  │       │                                                       │  │
│  │       ├──► Hono route validation (server)                     │  │
│  │       └──► Hono RPC client inference (frontend)               │  │
│  │            (auto, no codegen - TypeScript inference)           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  PIPELINE 3: Scaffolding (Hygen)                             │  │
│  │                                                               │  │
│  │  pnpm gen <generator> <action> --name <name>                  │  │
│  │       │                                                       │  │
│  │       ├──► route new      → Hono route + Zod schema + test   │  │
│  │       ├──► feature new    → Page + store + hook + route entry │  │
│  │       ├──► service new    → Python Dockerfile + FastAPI + ... │  │
│  │       ├──► skill new      → .claude/skills/*.md              │  │
│  │       ├──► db-table new   → Drizzle schema + Zod validator   │  │
│  │       └──► component new  → React component + test           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  PIPELINE 4: UI Components (shadcn CLI)                      │  │
│  │                                                               │  │
│  │  pnpm ui:add <component>                                      │  │
│  │       │                                                       │  │
│  │       └──► shadcn add ──► Component source in apps/web/src/  │  │
│  │            (copy-paste, fully customizable)                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Hygen Setup

### Installation

```bash
# In monorepo root
pnpm add -D hygen --workspace-root
```

### Directory Structure

```
_templates/
├── route/
│   └── new/
│       ├── prompt.js              # Interactive prompts
│       ├── route.ejs.t            # Hono route handler
│       ├── schema.ejs.t           # Zod validation schema
│       └── test.ejs.t             # Vitest test file
│
├── feature/
│   └── new/
│       ├── prompt.js
│       ├── page.ejs.t             # React page component
│       ├── store.ejs.t            # Zustand store slice
│       ├── hook.ejs.t             # Custom React hook
│       └── route-entry.ejs.t     # Router entry (inject)
│
├── service/
│   └── new/
│       ├── prompt.js
│       ├── dockerfile.ejs.t       # Dockerfile
│       ├── pyproject.ejs.t        # pyproject.toml (uv)
│       ├── main.ejs.t             # FastAPI app
│       ├── health.ejs.t           # Health endpoint
│       └── compose-entry.ejs.t   # docker-compose entry (inject)
│
├── skill/
│   └── new/
│       ├── prompt.js
│       └── skill.ejs.t            # .claude/skills/*.md
│
├── db-table/
│   └── new/
│       ├── prompt.js
│       ├── schema.ejs.t           # Drizzle table schema
│       └── validator.ejs.t        # Shared Zod validator
│
└── component/
    └── new/
        ├── prompt.js
        ├── component.ejs.t        # React component
        └── test.ejs.t             # Vitest test
```

### Hygen Config

```javascript
// .hygen.js (monorepo root)
module.exports = {
  templates: '_templates',
  helpers: {
    camelCase: (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
    PascalCase: (s) => s.replace(/(^|-)([a-z])/g, (_, _2, c) => c.toUpperCase()),
    snake_case: (s) => s.replace(/-/g, '_'),
    UPPER_SNAKE: (s) => s.replace(/-/g, '_').toUpperCase(),
  }
}
```

---

## 4. Type Flow: Hono RPC + Shared Zod Schemas

### How It Works (Zero Codegen)

This pipeline has **no generation step**. TypeScript inference carries types from server route definitions all the way to the frontend client. Here's the flow:

```
packages/shared/src/validators/session.ts    ← Zod schemas (single source of truth)
        │
        ├──► apps/server/src/routes/session.ts  ← Hono route uses Zod for validation
        │           │
        │           └──► Route type exported via Hono's type system
        │
        └──► apps/web/src/lib/api.ts            ← Hono RPC client infers types
                    │
                    └──► Full type safety: params, response, errors
```

### Step 1: Define Zod Schemas (packages/shared)

```typescript
// packages/shared/src/validators/session.ts
import { z } from "zod";

export const CreateSessionSchema = z.object({});

export const SendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1),
  voiceEmotion: z.object({
    label: z.enum(["happy", "sad", "angry", "neutral"]),
    confidence: z.number().min(0).max(1),
  }).optional(),
  facialEmotion: z.record(z.string(), z.number()).optional(),
  prosody: z.object({
    pitch_mean: z.number(),
    pitch_std: z.number(),
    energy_mean: z.number(),
    speaking_rate: z.number(),
  }).optional(),
});

export const SessionHistorySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// Inferred types - use these everywhere
export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type SessionHistory = z.infer<typeof SessionHistorySchema>;
```

### Step 2: Use in Hono Routes (apps/server)

```typescript
// apps/server/src/routes/session.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SessionHistorySchema } from "@moc/shared/validators/session";

const app = new Hono()
  .post("/sessions", async (c) => {
    // Create session logic
    return c.json({ sessionId: "...", status: "active" });
  })
  .get(
    "/sessions",
    zValidator("query", SessionHistorySchema),
    async (c) => {
      const { limit, offset } = c.req.valid("query");
      // Query sessions
      return c.json({ sessions: [], total: 0 });
    }
  );

// Export the type - this is what makes Hono RPC work
export type SessionRoutes = typeof app;
export default app;
```

### Step 3: Consume on Frontend (apps/web)

```typescript
// apps/web/src/lib/api.ts
import { hc } from "hono/client";
import type { SessionRoutes } from "@moc/server/routes/session";

// Full type inference - no codegen, no OpenAPI
const client = hc<SessionRoutes>("http://localhost:3000");

// TypeScript knows the exact response shape:
const res = await client.sessions.$get({ query: { limit: 10, offset: 0 } });
const data = await res.json();
// data is typed as { sessions: ..., total: number }
```

### Why This Eliminates API Codegen

| Traditional (OpenAPI) | Our Approach (Hono RPC) |
|---|---|
| Define OpenAPI spec | Define Zod schemas |
| Generate client types | Types inferred automatically |
| Generate API client | Hono `hc()` client built-in |
| Re-generate on change | Type errors appear instantly |
| Spec can drift from code | Schema IS the code |

---

## 5. Database Schema Pipeline: Drizzle

### Schema-First Flow

```
1. Edit Drizzle schema (TypeScript)
   apps/server/src/db/schema/*.ts
        │
        ▼
2. Generate migration
   $ pnpm db:generate
   → Creates SQL migration in apps/server/drizzle/
        │
        ▼
3. Apply migration
   $ pnpm db:migrate
   → Executes SQL against PostgreSQL
        │
        ▼
4. Types auto-inferred
   Drizzle's $inferSelect / $inferInsert
   → Use in routes, services, shared types
```

### Schema Definition Pattern

```typescript
// apps/server/src/db/schema/sessions.ts
import { pgTable, uuid, text, timestamp, real } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";  // pgvector support

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => userProfiles.id),
  sdkSessionId: text("sdk_session_id"),
  status: text("status").$type<"active" | "completed" | "crisis_escalated">(),
  summary: text("summary"),
  summaryEmbedding: vector("summary_embedding", { dimensions: 1024 }),
  themes: text("themes").array(),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Auto-inferred types
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
```

### Migration Commands

```bash
# Generate migration from schema changes
pnpm db:generate
# → Creates: apps/server/drizzle/0001_create_sessions.sql

# Apply pending migrations
pnpm db:migrate

# Drop and recreate (dev only)
pnpm db:push

# Open Drizzle Studio (visual DB browser)
pnpm db:studio
```

### Schema → Zod Validator Bridge

When you define a Drizzle table, also create a matching Zod validator in the shared package. The `db-table` Hygen generator does both automatically (see Section 6.5).

```
Drizzle schema (server)  ←──── Source of truth for DB
        │
        └──► Zod validator (shared) ←── Source of truth for validation
                    │
                    ├──► Hono route validation
                    └──► Frontend form validation
```

---

## 6. Hygen Generators

### 6.1 Route Generator

Scaffolds a new Hono API route with Zod validation and test.

**Command:**
```bash
pnpm gen route new --name mood-log
```

**Generates:**

```
apps/server/src/routes/mood-log.ts       # Hono route handler
packages/shared/src/validators/mood-log.ts # Zod schemas
apps/server/src/routes/__tests__/mood-log.test.ts # Vitest test
```

**Prompt:**

```javascript
// _templates/route/new/prompt.js
module.exports = [
  {
    type: "input",
    name: "name",
    message: "Route name (kebab-case):",
  },
  {
    type: "select",
    name: "methods",
    message: "HTTP methods:",
    choices: ["GET+POST", "GET only", "POST only", "CRUD (GET+POST+PUT+DELETE)"],
  },
  {
    type: "confirm",
    name: "withAuth",
    message: "Requires auth middleware?",
    initial: false,
  },
];
```

**Route Template:**

```ejs
// _templates/route/new/route.ejs.t
---
to: apps/server/src/routes/<%= name %>.ts
---
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  Create<%= h.PascalCase(name) %>Schema,
  Get<%= h.PascalCase(name) %>Schema,
} from "@moc/shared/validators/<%= name %>";

const app = new Hono()
<% if (methods === 'GET+POST' || methods === 'GET only' || methods === 'CRUD (GET+POST+PUT+DELETE)') { %>
  .get(
    "/<%= name %>s",
    zValidator("query", Get<%= h.PascalCase(name) %>Schema),
    async (c) => {
      const query = c.req.valid("query");
      // TODO: implement
      return c.json({ data: [], total: 0 });
    }
  )
<% } %>
<% if (methods === 'GET+POST' || methods === 'POST only' || methods === 'CRUD (GET+POST+PUT+DELETE)') { %>
  .post(
    "/<%= name %>s",
    zValidator("json", Create<%= h.PascalCase(name) %>Schema),
    async (c) => {
      const body = c.req.valid("json");
      // TODO: implement
      return c.json({ id: "new-id", ...body }, 201);
    }
  )
<% } %>
<% if (methods === 'CRUD (GET+POST+PUT+DELETE)') { %>
  .put(
    "/<%= name %>s/:id",
    zValidator("json", Create<%= h.PascalCase(name) %>Schema),
    async (c) => {
      const id = c.req.param("id");
      const body = c.req.valid("json");
      // TODO: implement
      return c.json({ id, ...body });
    }
  )
  .delete("/<%= name %>s/:id", async (c) => {
    const id = c.req.param("id");
    // TODO: implement
    return c.json({ deleted: true });
  })
<% } %>;

export type <%= h.PascalCase(name) %>Routes = typeof app;
export default app;
```

**Zod Schema Template:**

```ejs
// _templates/route/new/schema.ejs.t
---
to: packages/shared/src/validators/<%= name %>.ts
---
import { z } from "zod";

export const Create<%= h.PascalCase(name) %>Schema = z.object({
  // TODO: define fields
});

export const Get<%= h.PascalCase(name) %>Schema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Create<%= h.PascalCase(name) %> = z.infer<typeof Create<%= h.PascalCase(name) %>Schema>;
export type Get<%= h.PascalCase(name) %> = z.infer<typeof Get<%= h.PascalCase(name) %>Schema>;
```

**Test Template:**

```ejs
// _templates/route/new/test.ejs.t
---
to: apps/server/src/routes/__tests__/<%= name %>.test.ts
---
import { describe, it, expect } from "vitest";
import app from "../<%= name %>";

describe("<%= h.PascalCase(name) %> routes", () => {
  it("should be defined", () => {
    expect(app).toBeDefined();
  });

  // TODO: add route-specific tests
});
```

---

### 6.2 Feature Generator

Scaffolds a full frontend feature: page component, Zustand store, custom hook, and route entry.

**Command:**
```bash
pnpm gen feature new --name session-history
```

**Generates:**

```
apps/web/src/pages/session-history.tsx           # Page component
apps/web/src/stores/session-history-store.ts     # Zustand store
apps/web/src/hooks/use-session-history.ts        # Data fetching hook
```

**Prompt:**

```javascript
// _templates/feature/new/prompt.js
module.exports = [
  {
    type: "input",
    name: "name",
    message: "Feature name (kebab-case):",
  },
  {
    type: "confirm",
    name: "withWebSocket",
    message: "Uses WebSocket for real-time data?",
    initial: false,
  },
  {
    type: "confirm",
    name: "withStore",
    message: "Needs Zustand store?",
    initial: true,
  },
];
```

**Page Template:**

```ejs
// _templates/feature/new/page.ejs.t
---
to: apps/web/src/pages/<%= name %>.tsx
---
<% const Component = h.PascalCase(name) %>
<% const hook = 'use' + Component %>
import { <%= hook %> } from "@/hooks/<%= hook %>";
<% if (withStore) { %>
import { use<%= Component %>Store } from "@/stores/<%= name %>-store";
<% } %>

export function <%= Component %>Page() {
  const { data, isLoading, error } = <%= hook %>();
<% if (withStore) { %>
  const store = use<%= Component %>Store();
<% } %>

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (error) {
    return <div className="text-destructive">Error: {error.message}</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold"><%= Component.replace(/([A-Z])/g, ' $1').trim() %></h1>
      {/* TODO: implement */}
    </div>
  );
}
```

**Store Template:**

```ejs
// _templates/feature/new/store.ejs.t
---
to: apps/web/src/stores/<%= name %>-store.ts
unless_exists: true
skip_if: <%= !withStore %>
---
import { create } from "zustand";

interface <%= h.PascalCase(name) %>State {
  // TODO: define state
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const use<%= h.PascalCase(name) %>Store = create<<%= h.PascalCase(name) %>State>((set) => ({
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
}));
```

**Hook Template:**

```ejs
// _templates/feature/new/hook.ejs.t
---
to: apps/web/src/hooks/use-<%= name %>.ts
---
import { useState, useEffect } from "react";
<% if (withWebSocket) { %>
import { useWebSocket } from "@/hooks/use-websocket";
<% } %>

export function use<%= h.PascalCase(name) %>() {
  const [data, setData] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

<% if (withWebSocket) { %>
  const { send, subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe("<%= h.snake_case(name) %>.update", (params) => {
      setData(params);
    });
    return unsubscribe;
  }, [subscribe]);
<% } %>

  useEffect(() => {
    async function fetch() {
      try {
        setIsLoading(true);
        // TODO: fetch data
        setData(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, []);

  return { data, isLoading, error };
}
```

---

### 6.3 Python Service Generator

Scaffolds a complete Python AI microservice: Dockerfile, pyproject.toml (uv), FastAPI app, health endpoint, and docker-compose entry.

**Command:**
```bash
pnpm gen service new --name hinglish-nlp
```

**Generates:**

```
services/hinglish-nlp/
├── Dockerfile
├── pyproject.toml
├── main.py
└── README.md
+ injects entry into docker-compose.yml
```

**Prompt:**

```javascript
// _templates/service/new/prompt.js
module.exports = [
  {
    type: "input",
    name: "name",
    message: "Service name (kebab-case):",
  },
  {
    type: "input",
    name: "port",
    message: "Port number:",
  },
  {
    type: "input",
    name: "description",
    message: "Short description:",
  },
  {
    type: "confirm",
    name: "needsGpu",
    message: "Requires GPU?",
    initial: false,
  },
  {
    type: "confirm",
    name: "needsAudioVolume",
    message: "Needs access to audio volume?",
    initial: false,
  },
];
```

**Dockerfile Template:**

```ejs
// _templates/service/new/dockerfile.ejs.t
---
to: services/<%= name %>/Dockerfile
---
FROM python:3.11-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml .
COPY uv.lock* .

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy application
COPY . .

EXPOSE <%= port %>

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "<%= port %>"]
```

**pyproject.toml Template:**

```ejs
// _templates/service/new/pyproject.ejs.t
---
to: services/<%= name %>/pyproject.toml
---
[project]
name = "moc-<%= name %>"
version = "0.1.0"
description = "<%= description %>"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "python-multipart>=0.0.18",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8.0",
]
```

**FastAPI App Template:**

```ejs
// _templates/service/new/main.ejs.t
---
to: services/<%= name %>/main.py
---
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

app = FastAPI(
    title="MindOverChatter <%= h.PascalCase(name) %> Service",
    description="<%= description %>",
    version="0.1.0",
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "<%= name %>"}


# TODO: implement primary endpoint
# Example:
# @app.post("/process")
# async def process(file: UploadFile = File(...)):
#     content = await file.read()
#     result = ...  # Process with AI model
#     return {"success": True, "data": result}
```

**Docker Compose Inject Template:**

```ejs
// _templates/service/new/compose-entry.ejs.t
---
inject: true
to: docker-compose.yml
after: "services:"
skip_if: "<%= name %>:"
---

  <%= name %>:
    build:
      context: services/<%= name %>
    ports:
      - "<%= port %>:<%= port %>"
<% if (needsAudioVolume) { %>
    volumes:
      - audio-data:/app/volumes/audio:ro
      - model-cache:/app/models
<% } else { %>
    volumes:
      - model-cache:/app/models
<% } %>
<% if (needsGpu) { %>
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
<% } %>
    networks:
      - moc-net
```

---

### 6.4 Claude Skill Generator

Scaffolds a new Claude therapeutic skill with consistent structure.

**Command:**
```bash
pnpm gen skill new --name progressive-relaxation
```

**Generates:**

```
.claude/skills/progressive-relaxation.md
```

**Prompt:**

```javascript
// _templates/skill/new/prompt.js
module.exports = [
  {
    type: "input",
    name: "name",
    message: "Skill name (kebab-case):",
  },
  {
    type: "input",
    name: "title",
    message: "Human-readable title:",
  },
  {
    type: "select",
    name: "category",
    message: "Category:",
    choices: [
      "therapeutic-technique",
      "conversational-style",
      "assessment",
      "safety",
      "cultural-adaptation",
    ],
  },
  {
    type: "input",
    name: "description",
    message: "One-line description:",
  },
];
```

**Skill Template:**

```ejs
// _templates/skill/new/skill.ejs.t
---
to: .claude/skills/<%= name %>.md
---
# <%= title %>

**Category:** <%= category %>
**Description:** <%= description %>

---

## Purpose

<!-- What therapeutic goal does this skill serve? -->
<!-- When should this skill be activated during a session? -->

TODO: Define the purpose and activation criteria.

---

## System Prompt Fragment

<!-- This text gets injected into Claude's system prompt when the skill is active -->

```
You are using the <%= title %> technique.

[TODO: Define the specific instructions for Claude when using this technique]

Guidelines:
-
-
-

Hinglish adaptation:
- Use culturally resonant framing
- Mix Hindi and English naturally
- Avoid clinical jargon unless the user initiates it
```

---

## Session Flow

<!-- Step-by-step flow when this skill is active -->

1. **Step 1**:
2. **Step 2**:
3. **Step 3**:

---

## Example Interactions

### Example 1: [Scenario]

**User:** [Example Hinglish input]

**AI (using this skill):** [Example Hinglish response]

### Example 2: [Scenario]

**User:** [Example input]

**AI:** [Example response]

---

## Safety Considerations

<!-- Any safety rules specific to this skill -->

-
-

---

## Evaluation Criteria

<!-- How do we know this skill is working well? -->

-
-
```

---

### 6.5 Database Table Generator

Scaffolds a new Drizzle table schema and its corresponding shared Zod validator.

**Command:**
```bash
pnpm gen db-table new --name journal-entries
```

**Generates:**

```
apps/server/src/db/schema/journal-entries.ts       # Drizzle table
packages/shared/src/validators/journal-entries.ts   # Zod validator
```

**Prompt:**

```javascript
// _templates/db-table/new/prompt.js
module.exports = [
  {
    type: "input",
    name: "name",
    message: "Table name (kebab-case, will be snake_cased in DB):",
  },
  {
    type: "confirm",
    name: "withUserId",
    message: "Has user_id foreign key?",
    initial: true,
  },
  {
    type: "confirm",
    name: "withSessionId",
    message: "Has session_id foreign key?",
    initial: true,
  },
  {
    type: "confirm",
    name: "withEmbedding",
    message: "Has vector embedding column?",
    initial: false,
  },
];
```

**Drizzle Schema Template:**

```ejs
// _templates/db-table/new/schema.ejs.t
---
to: apps/server/src/db/schema/<%= name %>.ts
---
import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
<% if (withEmbedding) { %>
import { vector } from "drizzle-orm/pg-core";
<% } %>
<% if (withUserId) { %>
import { userProfiles } from "./user-profiles";
<% } %>
<% if (withSessionId) { %>
import { sessions } from "./sessions";
<% } %>

export const <%= h.camelCase(name) %> = pgTable("<%= h.snake_case(name) %>", {
  id: uuid("id").primaryKey().defaultRandom(),
<% if (withUserId) { %>
  userId: uuid("user_id").references(() => userProfiles.id).notNull(),
<% } %>
<% if (withSessionId) { %>
  sessionId: uuid("session_id").references(() => sessions.id).notNull(),
<% } %>
<% if (withEmbedding) { %>
  embedding: vector("embedding", { dimensions: 1024 }),
<% } %>
  // TODO: add columns
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type <%= h.PascalCase(name) %> = typeof <%= h.camelCase(name) %>.$inferSelect;
export type New<%= h.PascalCase(name) %> = typeof <%= h.camelCase(name) %>.$inferInsert;
```

**Zod Validator Template:**

```ejs
// _templates/db-table/new/validator.ejs.t
---
to: packages/shared/src/validators/<%= name %>.ts
---
import { z } from "zod";

export const Create<%= h.PascalCase(name) %>Schema = z.object({
<% if (withSessionId) { %>
  sessionId: z.string().uuid(),
<% } %>
  // TODO: add fields matching Drizzle schema
});

export const Get<%= h.PascalCase(name) %>Schema = z.object({
<% if (withSessionId) { %>
  sessionId: z.string().uuid().optional(),
<% } %>
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Create<%= h.PascalCase(name) %> = z.infer<typeof Create<%= h.PascalCase(name) %>Schema>;
export type Get<%= h.PascalCase(name) %> = z.infer<typeof Get<%= h.PascalCase(name) %>Schema>;
```

---

### 6.6 React Component Generator

Scaffolds a React component with test file.

**Command:**
```bash
pnpm gen component new --name mood-chart
```

**Generates:**

```
apps/web/src/components/mood-chart.tsx
apps/web/src/components/__tests__/mood-chart.test.tsx
```

**Component Template:**

```ejs
// _templates/component/new/component.ejs.t
---
to: apps/web/src/components/<%= name %>.tsx
---
interface <%= h.PascalCase(name) %>Props {
  // TODO: define props
}

export function <%= h.PascalCase(name) %>({ }: <%= h.PascalCase(name) %>Props) {
  return (
    <div>
      {/* TODO: implement */}
    </div>
  );
}
```

**Test Template:**

```ejs
// _templates/component/new/test.ejs.t
---
to: apps/web/src/components/__tests__/<%= name %>.test.tsx
---
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { <%= h.PascalCase(name) %> } from "../<%= name %>";

describe("<%= h.PascalCase(name) %>", () => {
  it("should render", () => {
    render(<<%= h.PascalCase(name) %> />);
    // TODO: add assertions
  });
});
```

---

## 7. pnpm Scripts

### Root package.json

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "format": "biome format --write .",
    "check": "biome check --write .",

    "gen": "hygen",

    "db:generate": "pnpm --filter @moc/server drizzle-kit generate",
    "db:migrate": "pnpm --filter @moc/server drizzle-kit migrate",
    "db:push": "pnpm --filter @moc/server drizzle-kit push",
    "db:studio": "pnpm --filter @moc/server drizzle-kit studio",

    "ui:add": "pnpm --filter @moc/web dlx shadcn@latest add",

    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down",
    "docker:build": "docker compose build",
    "docker:logs": "docker compose logs -f",

    "test:unit": "turbo test:unit",
    "test:e2e": "pnpm --filter @moc/web exec playwright test",
    "test:e2e:ui": "pnpm --filter @moc/web exec playwright test --ui"
  }
}
```

### Quick Reference

| Command | What It Does |
|---|---|
| `pnpm dev` | Start all apps in dev mode (Turborepo parallel) |
| `pnpm build` | Build all apps |
| `pnpm gen route new` | Scaffold new Hono route + Zod schema + test |
| `pnpm gen feature new` | Scaffold React page + store + hook |
| `pnpm gen service new` | Scaffold Python microservice + Docker entry |
| `pnpm gen skill new` | Scaffold Claude therapeutic skill |
| `pnpm gen db-table new` | Scaffold Drizzle table + Zod validator |
| `pnpm gen component new` | Scaffold React component + test |
| `pnpm db:generate` | Generate SQL migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Open Drizzle Studio (visual DB browser) |
| `pnpm ui:add button` | Add shadcn/ui component |
| `pnpm docker:up` | Start all Docker services |
| `pnpm test` | Run all tests |
| `pnpm test:e2e` | Run Playwright E2E tests |

---

## 8. Generator Reference

### All Generators At A Glance

| Generator | Command | Creates | Injects Into |
|---|---|---|---|
| **route** | `pnpm gen route new --name <name>` | Route handler, Zod schema, test | - |
| **feature** | `pnpm gen feature new --name <name>` | Page, store, hook | - |
| **service** | `pnpm gen service new --name <name>` | Dockerfile, pyproject.toml, FastAPI app | docker-compose.yml |
| **skill** | `pnpm gen skill new --name <name>` | .claude/skills/*.md | - |
| **db-table** | `pnpm gen db-table new --name <name>` | Drizzle schema, Zod validator | - |
| **component** | `pnpm gen component new --name <name>` | React component, test | - |

### Naming Conventions

| Input | Transforms To |
|---|---|
| `mood-log` (kebab-case input) | |
| → File names | `mood-log.ts`, `mood-log.tsx` |
| → DB table name | `mood_logs` (snake_case, pluralized) |
| → TypeScript type | `MoodLog` (PascalCase) |
| → Variable name | `moodLog` (camelCase) |
| → Constant name | `MOOD_LOG` (UPPER_SNAKE) |
| → Zustand store | `useMoodLogStore` |
| → React hook | `useMoodLog` |
| → Component | `MoodLog` |

### Adding a New Generator

1. Create directory: `_templates/<generator-name>/new/`
2. Add `prompt.js` for interactive prompts
3. Add `.ejs.t` template files with frontmatter `to:` paths
4. Use `inject: true` + `after:` for injecting into existing files
5. Test with: `pnpm gen <generator-name> new`
