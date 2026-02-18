---
description: Schema change workflow — generate and apply Drizzle migration
---

# DB Migrate — Schema Change Workflow

Generates and applies a Drizzle migration from schema changes.

---

## Phase 1: Verify Schema Changes

Check which schema files have been modified:

```bash
git diff --name-only -- 'apps/server/src/db/schema/'
```

If no schema changes detected, inform the user and stop.

---

## Phase 2: Generate Migration

```bash
pnpm db:generate
```

Review the generated SQL migration file in `apps/server/drizzle/`.

Show the user the migration SQL and ask for confirmation before applying.

---

## Phase 3: Apply Migration

```bash
pnpm db:migrate
```

Verify migration applied successfully.

---

## Phase 4: Verify

Open Drizzle Studio to visually verify:

```bash
pnpm db:studio
```

Or verify via health check:
```bash
curl -s http://localhost:3000/health
```

---

## Phase 5: Cross-Domain Notification

After schema changes:
- **Pixel** may need to update Hono RPC client usage if route types changed
- **Neura** may need to update SDK hooks if new tables affect memory/sessions
- Run `pnpm turbo build` to catch any type errors

---

## Summary

```
═══════════════════════════════════════════════════════════
DB MIGRATION COMPLETE
═══════════════════════════════════════════════════════════
Schema files changed: [list]
Migration generated: [filename]
Migration applied: ✅
Build check: [✅/❌]
═══════════════════════════════════════════════════════════
```
