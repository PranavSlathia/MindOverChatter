// ── Emotion Routes ──────────────────────────────────────────────
// POST /  — Ingest an emotion reading (face, voice, or text)

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { EmotionReadingSchema } from "@moc/shared";
import { db } from "../db/index.js";
import { emotionReadings } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";
import { sessionEmitter } from "../sse/emitter.js";

const app = new Hono()

  // ── POST / — Ingest Emotion Reading ──────────────────────────
  .post("/", zValidator("json", EmotionReadingSchema), async (c) => {
    const body = c.req.valid("json");

    // Single-user app: userId is server-derived, never from client
    await getOrCreateUser();

    const [reading] = await db
      .insert(emotionReadings)
      .values({
        sessionId: body.sessionId,
        messageId: body.messageId ?? null,
        channel: body.channel,
        emotionLabel: body.emotionLabel,
        confidence: body.confidence,
        signalWeight: body.signalWeight,
        rawScores: body.rawScores ?? null,
        prosodyData: body.prosodyData ?? null,
      })
      .returning();

    // Notify SSE subscribers about the detected emotion
    sessionEmitter.emit(body.sessionId, {
      event: "emotion.ai_detected",
      data: {
        emotionLabel: body.emotionLabel,
        confidence: body.confidence,
        channel: body.channel,
      },
    });

    return c.json(
      {
        id: reading!.id,
        createdAt: reading!.createdAt.toISOString(),
      },
      201,
    );
  });

// ── Export ────────────────────────────────────────────────────────

export type EmotionRoutes = typeof app;
export default app;
