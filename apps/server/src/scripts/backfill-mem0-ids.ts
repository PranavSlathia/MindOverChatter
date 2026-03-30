/**
 * One-time backfill: link existing Drizzle memories to their Mem0 IDs.
 *
 * Strategy:
 * 1. Fetch all current (non-superseded) memories from Mem0 for the user
 * 2. Match each to a Drizzle row by exact content
 * 3. Set mem0_id on the match
 * 4. Drizzle rows without a mem0_id after this pass = superseded in Mem0
 * 5. For orphaned rows, find the newest content-similar memory and set superseded_by
 *
 * Usage: DATABASE_URL=postgresql://moc:password@localhost:5433/moc npx tsx apps/server/src/scripts/backfill-mem0-ids.ts
 */

import { db } from "../db/index.js";
import { memories } from "../db/schema/index.js";
import { eq, isNull, and, desc } from "drizzle-orm";

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL ?? "http://localhost:8004";

// Get the single user's ID
async function getUserId(): Promise<string> {
  const [row] = await db
    .select({ id: memories.userId })
    .from(memories)
    .limit(1);
  if (!row) throw new Error("No memories found in database");
  return row.id;
}

// Fetch all current memories from Mem0
async function fetchMem0Memories(userId: string): Promise<Array<{ id: string; content: string; memory_type: string }>> {
  const resp = await fetch(`${MEMORY_SERVICE_URL}/memories/${userId}`);
  if (!resp.ok) throw new Error(`Mem0 GET failed: ${resp.status}`);
  const data = await resp.json() as { memories: Array<{ id: string; content: string; memory_type?: string; metadata?: { memory_type?: string } }> };
  return (data.memories ?? []).map((m) => ({
    id: m.id,
    content: m.content ?? "",
    memory_type: m.memory_type ?? m.metadata?.memory_type ?? "profile_fact",
  }));
}

async function main() {
  console.log("[backfill] Starting Mem0 ID backfill...\n");

  const userId = await getUserId();
  console.log(`[backfill] User: ${userId}`);

  // 1. Fetch all Drizzle memories
  const drizzleRows = await db
    .select({
      id: memories.id,
      content: memories.content,
      mem0Id: memories.mem0Id,
      supersededBy: memories.supersededBy,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt));

  console.log(`[backfill] Drizzle memories: ${drizzleRows.length}`);
  console.log(`[backfill] Already have mem0_id: ${drizzleRows.filter((r) => r.mem0Id).length}`);

  // 2. Fetch all current Mem0 memories
  const mem0Memories = await fetchMem0Memories(userId);
  console.log(`[backfill] Mem0 current memories: ${mem0Memories.length}\n`);

  // 3. Match by exact content and set mem0_id
  let matched = 0;
  for (const mem0 of mem0Memories) {
    const match = drizzleRows.find(
      (d) => !d.mem0Id && d.content && mem0.content && d.content.trim() === mem0.content.trim(),
    );
    if (match) {
      await db
        .update(memories)
        .set({ mem0Id: mem0.id })
        .where(eq(memories.id, match.id));
      match.mem0Id = mem0.id; // Mark as matched in local array
      matched++;
    }
  }
  console.log(`[backfill] Matched by exact content: ${matched}`);

  // 4. Count orphaned rows (no mem0_id = not in Mem0's current set = likely superseded)
  const orphaned = drizzleRows.filter((d) => !d.mem0Id && !d.supersededBy);
  console.log(`[backfill] Orphaned (no mem0_id, not superseded): ${orphaned.length}`);

  // 5. For orphaned rows, try to find a newer memory with similar content
  // and mark the orphan as superseded by it
  let superseded = 0;
  for (const orphan of orphaned) {
    // Find a newer memory with mem0_id that has overlapping keywords
    const orphanWords = new Set(
      orphan.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
    );
    if (orphanWords.size === 0) continue;

    let bestMatch: { id: string; overlap: number } | null = null;
    for (const candidate of drizzleRows) {
      // Must be newer, have mem0_id, and not be the same row
      if (
        candidate.id === orphan.id ||
        !candidate.mem0Id ||
        candidate.createdAt <= orphan.createdAt
      ) continue;

      const candWords = new Set(
        candidate.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
      );
      const overlap = [...orphanWords].filter((w) => candWords.has(w)).length;
      const overlapRatio = overlap / orphanWords.size;

      // Require at least 40% keyword overlap to consider it a supersession
      if (overlapRatio >= 0.4 && (!bestMatch || overlap > bestMatch.overlap)) {
        bestMatch = { id: candidate.id, overlap };
      }
    }

    if (bestMatch) {
      await db
        .update(memories)
        .set({ supersededBy: bestMatch.id })
        .where(eq(memories.id, orphan.id));
      superseded++;
      console.log(
        `  superseded: "${orphan.content.slice(0, 60)}..." → ${bestMatch.id} (${bestMatch.overlap} words overlap)`,
      );
    }
  }

  console.log(`\n[backfill] Marked as superseded: ${superseded}`);

  // Final stats
  const finalOrphaned = orphaned.length - superseded;
  const [{ count: activeCount }] = await db
    .select({ count: memories.id })
    .from(memories)
    .where(and(eq(memories.userId, userId), isNull(memories.supersededBy)));

  console.log(`\n=== Summary ===`);
  console.log(`Total memories:     ${drizzleRows.length}`);
  console.log(`Linked to Mem0:     ${matched + drizzleRows.filter((r) => r.mem0Id).length}`);
  console.log(`Superseded:         ${superseded}`);
  console.log(`Unmatched orphans:  ${finalOrphaned} (kept as-is, conservative)`);
  console.log(`Active (visible):   will be shown by WHERE superseded_by IS NULL`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
