// ── Assessment Routes ────────────────────────────────────────────
// POST /  — Submit a completed assessment

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { SubmitAssessmentSchema } from "@moc/shared";
import { ERROR_CODES } from "@moc/shared";
import { db } from "../db/index.js";
import { assessments, sessions } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";
import { sessionEmitter } from "../sse/emitter.js";
import { computeSeverity, getNextScreener } from "./assessment-scoring.js";
import { buildAssessmentContextBlock, buildFormulationText, SEVERITY_DESCRIPTIONS } from "./assessment-context.js";
import { injectSessionContext } from "../sdk/session-manager.js";
import { addMemoriesAsync } from "../services/memory-client.js";
import type { AssessmentType, AssessmentSeverity } from "@moc/shared";

const app = new Hono()

  // ── POST / — Submit Assessment ──────────────────────────────────
  .post("/", zValidator("json", SubmitAssessmentSchema), async (c) => {
    const { sessionId, type, answers, parentAssessmentId } = c.req.valid("json");

    // Validate session exists and is active
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return c.json(
        { error: ERROR_CODES.SESSION_NOT_FOUND, message: "Session not found" },
        404,
      );
    }

    if (session.status !== "active") {
      return c.json(
        { error: ERROR_CODES.SESSION_ENDED, message: "Session is not active" },
        409,
      );
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
        sessionId,
        userId: user.id,
        type,
        answers,
        totalScore,
        severity,
        parentAssessmentId: parentAssessmentId ?? null,
      })
      .returning();

    // Emit SSE event for assessment completion (human-readable severity for frontend)
    sessionEmitter.emit(sessionId, {
      event: "assessment.complete",
      data: {
        assessmentId: assessment!.id,
        severity: SEVERITY_DESCRIPTIONS[severity],
        nextScreener,
      },
    });

    // ── Post-Assessment Context Injection ────────────────────────
    // Inject assessment results into the SDK session so Claude can
    // naturally reference them in subsequent messages.
    if (session.sdkSessionId) {
      const contextBlock = buildAssessmentContextBlock(type, severity, nextScreener);
      injectSessionContext(session.sdkSessionId, contextBlock);
    }

    // ── Formulation Storage as symptom_episode Memory ────────────
    // Fire-and-forget: store a structured formulation for longitudinal tracking.
    // The formulation is INTERNAL ONLY — never returned in any API response.
    const formulationText = buildFormulationText(type, severity, nextScreener);
    addMemoriesAsync(
      user.id,
      sessionId,
      assessment!.id, // Use assessment ID as the source message ID for provenance
      [{ role: "assistant", content: formulationText }],
      { memory_type: "symptom_episode" },
    );

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
