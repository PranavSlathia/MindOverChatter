// ── Memory Block Service ──────────────────────────────────────────
// CRUD layer for the memory_blocks table.
// Memory blocks are named, size-bounded text fields that Claude
// writes at session end and reads at session start — acting as
// persistent, structured working memory.
//
// Labels (6 total):
//   user/overview                      — who the user is in a paragraph
//   user/goals                         — what they are working toward
//   user/triggers                      — known distress triggers
//   user/coping_strategies             — what helps them cope
//   user/relationships                 — key people in their life
//   companion/therapeutic_calibration  — how to engage this specific user

import { eq, and, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema/index";
import { memoryBlocks } from "../db/schema/index";
import type { MemoryBlock, NewMemoryBlock } from "../db/schema/memory-blocks.js";
import { MemoryBlockLabelSchema } from "@moc/shared";
import type { MemoryBlockLabel } from "@moc/shared/validators/memory-block";

// ── Public constants ─────────────────────────────────────────────

/**
 * Canonical set of all 7 memory block labels.
 * Derived from the schema — single source of truth.
 */
export const MEMORY_BLOCK_LABELS = MemoryBlockLabelSchema.options as MemoryBlockLabel[];

/** Per-label character limits. Enforced in upsertBlock and used by seedEmptyBlocks. */
export const BLOCK_CHAR_LIMITS: Record<MemoryBlockLabel, number> = {
  "user/overview": 500,
  "user/goals": 500,
  "user/triggers": 500,
  "user/coping_strategies": 500,
  "user/relationships": 500,
  "user/origin_story": 1000,
  "companion/therapeutic_calibration": 800,
};

// ── Types ────────────────────────────────────────────────────────

type Db = PostgresJsDatabase<typeof schema>;

export interface UpsertBlockParams {
  userId: string;
  label: MemoryBlockLabel;
  content: string;
  updatedBy?: string;
  sourceSessionId?: string | null;
}

// ── Read ─────────────────────────────────────────────────────────

/**
 * Returns all memory blocks for a user, ordered alphabetically by label.
 * Returns [] if the user has no blocks yet.
 */
export async function getBlocksForUser(
  db: Db,
  userId: string,
): Promise<MemoryBlock[]> {
  return db
    .select()
    .from(memoryBlocks)
    .where(eq(memoryBlocks.userId, userId))
    .orderBy(asc(memoryBlocks.label));
}

// ── Write ────────────────────────────────────────────────────────

/**
 * Upserts a single memory block for the user.
 * Uses onConflictDoUpdate on the (user_id, label) unique constraint.
 * Always updates: content, updated_by, source_session_id, updated_at.
 */
export async function upsertBlock(
  db: Db,
  params: UpsertBlockParams,
): Promise<MemoryBlock> {
  const {
    userId,
    label,
    content,
    updatedBy = "system",
    sourceSessionId = null,
  } = params;

  const limit = BLOCK_CHAR_LIMITS[label];
  if (content.length > limit) {
    throw new Error(
      `Block ${label} content exceeds limit: ${content.length} > ${limit}`,
    );
  }

  const values: NewMemoryBlock = {
    userId,
    label,
    content,
    updatedBy,
    sourceSessionId,
  };

  const [row] = await db
    .insert(memoryBlocks)
    .values(values)
    .onConflictDoUpdate({
      target: [memoryBlocks.userId, memoryBlocks.label],
      set: {
        content,
        updatedBy,
        sourceSessionId,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  // returning() always yields the upserted row
  return row!;
}

// ── Seed ─────────────────────────────────────────────────────────

/** Safe to call on every session start. Idempotent via onConflictDoNothing. */
export async function seedEmptyBlocks(
  db: Db,
  userId: string,
): Promise<void> {
  const stubs: NewMemoryBlock[] = MEMORY_BLOCK_LABELS.map((label) => ({
    userId,
    label,
    content: "",
    charLimit: BLOCK_CHAR_LIMITS[label],
    updatedBy: "system",
    sourceSessionId: null,
  }));

  await db.insert(memoryBlocks).values(stubs).onConflictDoNothing();
}
