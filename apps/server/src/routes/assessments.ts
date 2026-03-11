// ── Assessment Routes ────────────────────────────────────────────
// POST /  — Submit a completed assessment (session-based or standalone)
// GET /library — Get available assessment instrument metadata

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and } from "drizzle-orm";
import { SubmitAssessmentSchema } from "@moc/shared";
import { ERROR_CODES } from "@moc/shared";
import { db } from "../db/index.js";
import { assessments, sessions } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";
import { sessionEmitter } from "../sse/emitter.js";
import { computeSeverity, getNextScreener } from "./assessment-scoring.js";
import { buildAssessmentContextBlock, buildFormulationText, SEVERITY_DESCRIPTIONS } from "./assessment-context.js";
import { invalidateInsightsCache } from "./journey.js";
import { injectSessionContext } from "../sdk/session-manager.js";
import { addMemoriesAsync } from "../services/memory-client.js";
import { generateAndPersistFormulation } from "../services/formulation-service.js";
import type { AssessmentType, AssessmentSeverity } from "@moc/shared";

const app = new Hono()

  // ── GET /library — Available Assessment Instruments ─────────────
  .get("/library", async (c) => {
    const user = await getOrCreateUser();

    // Get the user's most recent assessment of each type
    const recentAssessments = await db
      .select({
        type: assessments.type,
        severity: assessments.severity,
        createdAt: assessments.createdAt,
      })
      .from(assessments)
      .where(eq(assessments.userId, user.id))
      .orderBy(desc(assessments.createdAt));

    // Build a map of latest result per type
    const latestByType: Record<string, { severity: string; createdAt: Date }> = {};
    for (const row of recentAssessments) {
      if (!latestByType[row.type]) {
        latestByType[row.type] = { severity: row.severity, createdAt: row.createdAt };
      }
    }

    return c.json({ latestByType });
  })

  // ── GET /history — Assessment history for a specific type ───────
  .get("/history/:type", async (c) => {
    const type = c.req.param("type");
    const user = await getOrCreateUser();

    const results = await db
      .select({
        id: assessments.id,
        type: assessments.type,
        totalScore: assessments.totalScore,
        severity: assessments.severity,
        createdAt: assessments.createdAt,
      })
      .from(assessments)
      .where(and(eq(assessments.userId, user.id), eq(assessments.type, type as typeof assessments.type.enumValues[number])))
      .orderBy(desc(assessments.createdAt))
      .limit(20);

    return c.json({ assessments: results });
  })

  // ── POST / — Submit Assessment ──────────────────────────────────
  .post("/", zValidator("json", SubmitAssessmentSchema), async (c) => {
    const { sessionId, type, answers, parentAssessmentId } = c.req.valid("json");

    // If sessionId provided, validate session exists and is active
    let session: { id: string; status: string; sdkSessionId: string | null } | null = null;
    if (sessionId) {
      const [found] = await db
        .select({
          id: sessions.id,
          status: sessions.status,
          sdkSessionId: sessions.sdkSessionId,
        })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (!found) {
        return c.json(
          { error: ERROR_CODES.SESSION_NOT_FOUND, message: "Session not found" },
          404,
        );
      }

      if (found.status !== "active") {
        return c.json(
          { error: ERROR_CODES.SESSION_ENDED, message: "Session is not active" },
          409,
        );
      }

      session = found;
    }

    const user = await getOrCreateUser();

    // Compute score and severity server-side
    const { totalScore, severity } = computeSeverity(type, answers);

    // Determine which screeners have already been completed in this chain.
    // If this is a screener (has parentAssessmentId), find siblings.
    // If this is a primary (phq9/gad7), there are no prior screeners yet.
    let completedScreeners = new Set<AssessmentType>();

    if (parentAssessmentId) {
      // Find all screeners already submitted under this parent
      const siblings = await db
        .select({ type: assessments.type })
        .from(assessments)
        .where(eq(assessments.parentAssessmentId, parentAssessmentId));

      for (const s of siblings) {
        completedScreeners.add(s.type as AssessmentType);
      }
      // Include the one we're about to insert
      completedScreeners.add(type);
    }

    // For primary assessments, nextScreener is based on their own severity.
    // For screeners, nextScreener is based on the PARENT's type and severity.
    let nextScreener: AssessmentType | null = null;

    if (!parentAssessmentId) {
      // This IS the primary assessment — compute next screener from its severity
      nextScreener = getNextScreener(type, severity, completedScreeners);
    } else {
      // This is a screener — look up the parent to determine the chain
      const [parent] = await db
        .select({ type: assessments.type, severity: assessments.severity })
        .from(assessments)
        .where(eq(assessments.id, parentAssessmentId))
        .limit(1);

      if (parent) {
        nextScreener = getNextScreener(
          parent.type as AssessmentType,
          parent.severity as AssessmentSeverity,
          completedScreeners,
        );
      }
    }

    // Persist to DB
    const [assessment] = await db
      .insert(assessments)
      .values({
        sessionId: sessionId ?? null,
        userId: user.id,
        type,
        answers,
        totalScore,
        severity,
        parentAssessmentId: parentAssessmentId ?? null,
      })
      .returning();

    // New assessment data invalidates journey insights cache
    invalidateInsightsCache();

    // Session-specific integrations (only when submitted from a chat session)
    if (session && sessionId) {
      // Emit SSE event for assessment completion
      sessionEmitter.emit(sessionId, {
        event: "assessment.complete",
        data: {
          assessmentId: assessment!.id,
          severity: SEVERITY_DESCRIPTIONS[severity],
          nextScreener,
        },
      });

      // Inject assessment results into the SDK session
      if (session.sdkSessionId) {
        const contextBlock = buildAssessmentContextBlock(type, severity, nextScreener);
        injectSessionContext(session.sdkSessionId, contextBlock);
      }
    }

    // ── Formulation Storage as symptom_episode Memory ────────────
    // Fire-and-forget: store a structured formulation for longitudinal tracking.
    const formulationText = buildFormulationText(type, severity, nextScreener);
    addMemoriesAsync(
      user.id,
      sessionId ?? "standalone",
      assessment!.id,
      [{ role: "assistant", content: formulationText }],
      { memory_type: "symptom_episode" },
    );

    // Fire-and-forget: regenerate canonical formulation snapshot
    generateAndPersistFormulation(user.id, "assessment_submit").catch((err) => {
      console.error(`[assessments] Formulation generation error:`, err);
    });

    // totalScore is for internal tracking only — NEVER render in UI as a diagnostic indicator
    return c.json(
      {
        assessmentId: assessment!.id,
        totalScore,
        severity,
        nextScreener,
      },
      201,
    );
  });

// ── Export ────────────────────────────────────────────────────────

export type AssessmentRoutes = typeof app;
export default app;
