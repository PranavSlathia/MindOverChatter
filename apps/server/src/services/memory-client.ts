// ── Memory Service Client ────────────────────────────────────────
// HTTP client for the Mem0 memory microservice (port 8004).
// Resilience rules:
//   - searchMemories() catches ALL errors and returns [] (never throws)
//   - Fire-and-forget functions use .catch() (never propagate errors)
//   - Provenance persisted to Drizzle memories table after add

import { env } from "../env.js";
import { db } from "../db/index.js";
import { memories } from "../db/schema/index";
import { eq } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────

export interface MemorySearchResult {
  id: string;
  content: string;
  memoryType: string;
  confidence: number;
  relevance: number;
  createdAt: string;
}

export interface MemoryAddedResult {
  id: string;
  supersededId: string | null;
  content: string;
  memoryType: string;
  confidence: number;
  event: "ADD" | "UPDATE" | "DELETE" | "NONE";
}

// ── Constants ───────────────────────────────────────────────────

/** Timeout for blocking search calls (ms). */
const SEARCH_TIMEOUT_MS = 5_000;

/** Timeout for fire-and-forget add calls (ms). Generous since extraction involves LLM. */
const ADD_TIMEOUT_MS = 30_000;

// ── Search (BLOCKING) ───────────────────────────────────────────

/**
 * Search for relevant memories for a user. Returns [] on ANY failure
 * (network errors, timeouts, 500s, parse errors). Never throws.
 */
export async function searchMemories(
  userId: string,
  query: string,
  limit: number = 10,
  memoryTypes?: string[],
): Promise<MemorySearchResult[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    const body: Record<string, unknown> = { user_id: userId, query, limit };
    if (memoryTypes && memoryTypes.length > 0) {
      body.memory_types = memoryTypes;
    }

    const response = await fetch(`${env.MEMORY_SERVICE_URL}/memories/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      console.error(
        `Memory search failed: HTTP ${String(response.status)} from ${env.MEMORY_SERVICE_URL}/memories/search`,
      );
      return [];
    }

    // Python service returns snake_case; transform to camelCase
    const data = (await response.json()) as {
      memories?: Array<{
        id: string;
        content: string;
        memory_type: string;
        confidence: number;
        relevance: number;
        created_at: string;
      }>;
    };
    if (!Array.isArray(data.memories)) {
      console.error("Memory search returned unexpected shape:", data);
      return [];
    }

    return data.memories.map((m) => ({
      id: m.id,
      content: m.content,
      memoryType: m.memory_type,
      confidence: m.confidence,
      relevance: m.relevance,
      createdAt: m.created_at,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Memory search error: ${message}`);
    return [];
  }
}

// ── Get All Memories (BLOCKING) ──────────────────────────────────

/**
 * Retrieve ALL memories for a user from Mem0. Returns [] on ANY failure.
 * Used at session start to give the AI full context about the user.
 */
export async function getAllMemories(
  userId: string,
): Promise<MemorySearchResult[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    const response = await fetch(`${env.MEMORY_SERVICE_URL}/memories/${userId}`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      console.error(
        `Memory get_all failed: HTTP ${String(response.status)} from ${env.MEMORY_SERVICE_URL}/memories/${userId}`,
      );
      return [];
    }

    const data = (await response.json()) as {
      memories?: Array<{
        id: string;
        content: string;
        memory_type: string;
        confidence: number;
        created_at: string;
      }>;
    };
    if (!Array.isArray(data.memories)) {
      return [];
    }

    return data.memories.map((m) => ({
      id: m.id,
      content: m.content,
      memoryType: m.memory_type,
      confidence: m.confidence,
      relevance: 1.0, // All memories are relevant when loading full context
      createdAt: m.created_at,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Memory get_all error: ${message}`);
    return [];
  }
}

// ── Add Memories (FIRE-AND-FORGET) ──────────────────────────────

/**
 * Send messages to the memory service for fact extraction.
 * Fire-and-forget: never throws, logs errors.
 *
 * After a successful response, persists provenance into the Drizzle
 * memories table (insert new rows, update superseded rows).
 */
export function addMemoriesAsync(
  userId: string,
  sessionId: string | null,
  userMessageId: string,
  messageList: Array<{ role: string; content: string }>,
  metadata?: Record<string, unknown>,
): void {
  doAddMemories(userId, sessionId, userMessageId, messageList, metadata).catch(
    (err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Memory add error: ${message}`);
    },
  );
}

async function doAddMemories(
  userId: string,
  sessionId: string | null,
  userMessageId: string,
  messageList: Array<{ role: string; content: string }>,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADD_TIMEOUT_MS);

  const response = await fetch(`${env.MEMORY_SERVICE_URL}/memories/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      session_id: sessionId,
      messages: messageList,
      metadata: metadata ?? {},
    }),
    signal: controller.signal,
  });

  clearTimeout(timer);

  if (!response.ok) {
    console.error(
      `Memory add failed: HTTP ${String(response.status)} from ${env.MEMORY_SERVICE_URL}/memories/add`,
    );
    return;
  }

  // Python service returns snake_case; transform to camelCase
  const data = (await response.json()) as {
    memories_added?: Array<{
      id: string;
      supersedes_id: string | null;
      content: string;
      memory_type: string;
      confidence: number;
      event: string;
    }>;
  };

  if (!Array.isArray(data.memories_added)) {
    return;
  }

  const mapped: MemoryAddedResult[] = data.memories_added.map((m) => ({
    id: m.id,
    supersededId: m.supersedes_id,
    content: m.content,
    memoryType: m.memory_type,
    confidence: m.confidence,
    event: m.event as MemoryAddedResult["event"],
  }));

  // Persist provenance to Drizzle memories table
  await persistProvenance(
    userId,
    sessionId,
    userMessageId,
    mapped,
  );
}

/**
 * Persist memory provenance into the DB.
 * Insert new memory FIRST, then update old one (FK correctness).
 * Failures are logged, never thrown.
 */
async function persistProvenance(
  userId: string,
  sessionId: string | null,
  userMessageId: string,
  added: MemoryAddedResult[],
): Promise<void> {
  for (const item of added) {
    if (item.event === "NONE" || item.event === "DELETE") {
      continue;
    }

    try {
      // Validate memoryType is one of the known types before inserting
      const validTypes = [
        "profile_fact",
        "relationship",
        "goal",
        "coping_strategy",
        "recurring_trigger",
        "life_event",
        "symptom_episode",
        "unresolved_thread",
        "safety_critical",
        "win",
        "session_summary",
        "formative_experience",
      ] as const;

      type ValidMemoryType = (typeof validTypes)[number];

      if (!validTypes.includes(item.memoryType as ValidMemoryType)) {
        console.error(
          `Memory provenance: unknown memoryType "${item.memoryType}", skipping`,
        );
        continue;
      }

      // Insert new memory row
      const [inserted] = await db
        .insert(memories)
        .values({
          userId,
          content: item.content,
          memoryType: item.memoryType as ValidMemoryType,
          importance: item.confidence, // Use confidence as importance for now
          confidence: item.confidence,
          sourceSessionId: sessionId,
          sourceMessageId: userMessageId,
        })
        .returning();

      // If this was an UPDATE with a superseded memory, link the old one
      if (
        item.event === "UPDATE" &&
        item.supersededId &&
        inserted
      ) {
        await db
          .update(memories)
          .set({ supersededBy: inserted.id })
          .where(eq(memories.id, item.supersededId));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Memory provenance persistence error for item ${item.id}: ${message}`,
      );
      // Continue to next item — never crash
    }
  }
}

// ── Summarize Session (FIRE-AND-FORGET) ─────────────────────────

/**
 * Notify the memory service about a session ending.
 * Fire-and-forget: never throws, logs errors.
 */
export function summarizeSessionAsync(
  userId: string,
  sessionId: string,
  summary: string,
): void {
  fetch(`${env.MEMORY_SERVICE_URL}/memories/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      session_id: sessionId,
      summary,
    }),
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Memory summarize error: ${message}`);
  });
}
