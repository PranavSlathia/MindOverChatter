---
name: drizzle-migration
description: Schema-first Drizzle ORM migration workflow for PostgreSQL with pgvector
user-invocable: false
---

# Drizzle Migration Workflow

## Purpose

Schema-first migration workflow for PostgreSQL + pgvector. All database changes start with editing the Drizzle schema files. Migrations are generated deterministically from schema diffs -- never write SQL by hand.

## Steps

### 1. Edit the Drizzle Schema

All schema definitions live in `apps/server/src/db/schema/*.ts`. Each domain gets its own file (e.g., `users.ts`, `sessions.ts`, `memories.ts`). The barrel export in `apps/server/src/db/schema/index.ts` re-exports everything.

### 2. Generate the SQL Migration

```bash
pnpm db:generate
```

This diffs the current schema against the last snapshot and produces a numbered SQL migration file in `apps/server/src/db/migrations/`. Inspect the generated SQL before proceeding.

### 3. Apply the Migration

```bash
pnpm db:migrate
```

Runs all pending migrations against the database. This is idempotent -- already-applied migrations are skipped.

### 4. Type Inference

Types are auto-inferred from the schema. Never manually define row types.

```ts
import { sessions } from "./schema";

type Session = typeof sessions.$inferSelect;   // read type
type NewSession = typeof sessions.$inferInsert; // insert type
```

### 5. Create Matching Zod Validator

Every table that touches the API boundary needs a corresponding Zod schema in `packages/shared/src/validators/`. This keeps validation logic shared between server and frontend.

## Patterns

### pgvector Column (1024 dimensions)

```ts
import { vector } from "pgvector/drizzle-orm";

embedding: vector("embedding", { dimensions: 1024 }),
```

### UUID Primary Keys

```ts
import { uuid } from "drizzle-orm/pg-core";

id: uuid("id").defaultRandom().primaryKey(),
```

### Timestamps

```ts
import { timestamp } from "drizzle-orm/pg-core";

createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
```

### Foreign Key References

```ts
userId: uuid("user_id")
  .notNull()
  .references(() => users.id, { onDelete: "cascade" }),
```

## Example: Sessions Table with pgvector

```ts
import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { vector } from "pgvector/drizzle-orm";
import { users } from "./users";

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  summary: text("summary"),
  moodBefore: integer("mood_before"),
  moodAfter: integer("mood_after"),
  embedding: vector("embedding", { dimensions: 1024 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

## Checklist

- [ ] Schema defined in `apps/server/src/db/schema/*.ts`
- [ ] Zod validator created in `packages/shared/src/validators/`
- [ ] Migration generated with `pnpm db:generate`
- [ ] Migration SQL inspected for correctness
- [ ] Migration applied with `pnpm db:migrate`
- [ ] Verified in `pnpm db:studio` that table/columns are correct
