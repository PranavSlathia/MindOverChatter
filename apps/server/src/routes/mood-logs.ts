// ── Mood Log Routes ─────────────────────────────────────────────
// POST /  — Create a mood log entry
// GET  /  — Get mood history (last 30 entries)

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { desc } from "drizzle-orm";
import { CreateMoodLogSchema } from "@moc/shared";
import { db } from "../db/index.js";
import { moodLogs } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";
import { invalidateInsightsCache } from "./journey.js";

const app = new Hono()

  // ── POST / — Create Mood Log ─────────────────────────────────
  .post("/", zValidator("json", CreateMoodLogSchema), async (c) => {
    const body = c.req.valid("json");

    // Single-user app: userId is server-derived, never from client
    const user = await getOrCreateUser();

    const [entry] = await db
      .insert(moodLogs)
      .values({
        userId: user.id,
        sessionId: body.sessionId ?? null,
        valence: body.valence,
        arousal: body.arousal,
        source: body.source,
      })
      .returning();

    // New mood data invalidates journey insights cache
    invalidateInsightsCache();

    return c.json(
      {
        id: entry!.id,
        valence: entry!.valence,
        arousal: entry!.arousal,
        source: entry!.source,
        createdAt: entry!.createdAt.toISOString(),
      },
      201,
    );
  })

  // ── GET / — Mood History ─────────────────────────────────────
  .get("/", async (c) => {
    const entries = await db
      .select({
        id: moodLogs.id,
        valence: moodLogs.valence,
        arousal: moodLogs.arousal,
        source: moodLogs.source,
        sessionId: moodLogs.sessionId,
        createdAt: moodLogs.createdAt,
      })
      .from(moodLogs)
      .orderBy(desc(moodLogs.createdAt))
      .limit(30);

    return c.json({
      entries: entries.map((e) => ({
        id: e.id,
        valence: e.valence,
        arousal: e.arousal,
        source: e.source,
        sessionId: e.sessionId,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  });

// ── Export ────────────────────────────────────────────────────────

export type MoodLogRoutes = typeof app;
export default app;
