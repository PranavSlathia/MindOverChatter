// ── Reflective Questions Routes ──────────────────────────────────
// GET    /               — List active questions with latest reflection
// PUT    /:id/reflect    — Create/update a reflection (draft or submit)
// DELETE /:id            — Retire a question (soft delete)
// POST   /:id/defer      — Defer a question

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql, ne, inArray } from "drizzle-orm";
import {
  ReflectiveQuestionListResponseSchema,
  SaveReflectionResponseSchema,
  SaveReflectionSchema,
  type ReflectiveQuestionCard,
} from "@moc/shared";
import { db } from "../db/index.js";
import { reflectiveQuestions, reflections } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";
import { detectCrisis } from "../crisis/index.js";
import { generateAndPersistClinicalHandoffReport } from "../services/clinical-handoff-report-service.js";
import { generateAndPersistFormulation } from "../services/formulation-service.js";
import { generateAndPersistTherapyPlan } from "../services/therapy-plan-service.js";
import type { Reflection as ReflectionRow } from "../db/schema/reflective-questions.js";

function serializeQuestionCard(input: {
  question: {
    id: string;
    question: string;
    linkedTo: string | null;
    status: "open" | "answered" | "deferred" | "retired";
    createdAt: Date;
    updatedAt: Date;
  };
  latestReflection?: ReflectionRow | null;
}): ReflectiveQuestionCard {
  const latestReflection = input.latestReflection ?? null;
  return {
    id: input.question.id,
    question: input.question.question,
    linkedTo: input.question.linkedTo,
    status: input.question.status,
    reflectionText: latestReflection?.text ?? null,
    reflectionStatus: latestReflection?.status ?? null,
    answeredAt: latestReflection?.submittedAt?.toISOString() ?? null,
    createdAt: input.question.createdAt.toISOString(),
    updatedAt: input.question.updatedAt.toISOString(),
  };
}

const app = new Hono()

  // ── GET / — List active reflective questions with latest reflection ──
  .get("/", async (c) => {
    const user = await getOrCreateUser();

    // Fetch non-retired, non-deferred questions ordered: open first, then answered
    const rows = await db
      .select()
      .from(reflectiveQuestions)
      .where(
        and(
          eq(reflectiveQuestions.userId, user.id),
          ne(reflectiveQuestions.status, "retired"),
          ne(reflectiveQuestions.status, "deferred"),
        ),
      )
      .orderBy(
        // open questions first, then answered
        sql`CASE ${reflectiveQuestions.status}
          WHEN 'open' THEN 0
          WHEN 'answered' THEN 1
          ELSE 2
        END`,
        desc(reflectiveQuestions.createdAt),
      )
      .limit(10);

    // Batch-fetch the latest reflection per question in a single query
    // instead of N+1 round-trips (C2 fix)
    const questionIds = rows.map((q) => q.id);
    const latestReflectionMap = new Map<string, ReflectionRow>();

    if (questionIds.length > 0) {
      // Use DISTINCT ON to get the latest reflection per question_id
      const latestReflections = await db
        .select()
        .from(reflections)
        .where(inArray(reflections.questionId, questionIds))
        .orderBy(reflections.questionId, desc(reflections.createdAt));

      // Keep only the first (latest) reflection per question
      for (const r of latestReflections) {
        if (!latestReflectionMap.has(r.questionId)) {
          latestReflectionMap.set(r.questionId, r);
        }
      }
    }

    const questionsWithReflections = rows.map((q) => {
      const latestReflection = latestReflectionMap.get(q.id) ?? null;
      return serializeQuestionCard({ question: q, latestReflection });
    });

    return c.json(
      ReflectiveQuestionListResponseSchema.parse({ questions: questionsWithReflections }),
    );
  })

  // ── PUT /:id/reflect — Create/update a reflection ─────────────
  .put("/:id/reflect", zValidator("json", SaveReflectionSchema), async (c) => {
    const questionId = c.req.param("id");
    const { text: reflectionText, submit } = c.req.valid("json");
    const user = await getOrCreateUser();

    // Verify the question exists, belongs to user, and is not retired
    const [question] = await db
      .select()
      .from(reflectiveQuestions)
      .where(
        and(
          eq(reflectiveQuestions.id, questionId),
          eq(reflectiveQuestions.userId, user.id),
          ne(reflectiveQuestions.status, "retired"),
        ),
      )
      .limit(1);

    if (!question) {
      return c.json({ error: "Question not found" }, 404);
    }

    // If submitting, run crisis detection (NON-NEGOTIABLE)
    if (submit) {
      const crisisResult = await detectCrisis(reflectionText);

      if (crisisResult.isCrisis) {
        // Do NOT save the reflection — return crisis response instead
        return c.json({
          crisis: true,
          response: {
            message: crisisResult.response!.message,
            helplines: crisisResult.response!.helplines,
          },
        });
      }
    }

    const now = new Date();

    // Check if there is an existing draft reflection (not yet submitted)
    const [existingDraft] = await db
      .select()
      .from(reflections)
      .where(
        and(
          eq(reflections.questionId, questionId),
          eq(reflections.userId, user.id),
          eq(reflections.status, "draft"),
        ),
      )
      .orderBy(desc(reflections.createdAt))
      .limit(1);

    // Check if there is already a submitted reflection (for revisiting)
    const [existingSubmitted] = await db
      .select()
      .from(reflections)
      .where(
        and(
          eq(reflections.questionId, questionId),
          eq(reflections.userId, user.id),
          eq(reflections.status, "submitted"),
        ),
      )
      .orderBy(desc(reflections.createdAt))
      .limit(1);

    let reflection;

    if (existingDraft && !existingSubmitted) {
      // Update existing draft
      const [updated] = await db
        .update(reflections)
        .set({
          text: reflectionText,
          status: submit ? "submitted" : "draft",
          submittedAt: submit ? now : null,
          updatedAt: now,
        })
        .where(eq(reflections.id, existingDraft.id))
        .returning();
      reflection = updated!;
    } else if (existingSubmitted && submit) {
      // Already has a submitted reflection — create NEW row (revisiting)
      const [inserted] = await db
        .insert(reflections)
        .values({
          questionId,
          userId: user.id,
          text: reflectionText,
          status: "submitted",
          submittedAt: now,
        })
        .returning();
      reflection = inserted!;
    } else if (existingDraft && existingSubmitted) {
      // Has both a draft and submitted — update the draft
      const [updated] = await db
        .update(reflections)
        .set({
          text: reflectionText,
          status: submit ? "submitted" : "draft",
          submittedAt: submit ? now : null,
          updatedAt: now,
        })
        .where(eq(reflections.id, existingDraft.id))
        .returning();
      reflection = updated!;
    } else {
      // No existing reflection — create new
      const [inserted] = await db
        .insert(reflections)
        .values({
          questionId,
          userId: user.id,
          text: reflectionText,
          status: submit ? "submitted" : "draft",
          submittedAt: submit ? now : null,
        })
        .returning();
      reflection = inserted!;
    }

    // If submitted, update question status to 'answered'
    if (submit && question.status !== "answered") {
      await db
        .update(reflectiveQuestions)
        .set({ status: "answered", updatedAt: now })
        .where(eq(reflectiveQuestions.id, questionId));
    }

    if (submit) {
      try {
        const reviewedAt = new Date();
        const [reviewedReflection] = await db
          .update(reflections)
          .set({
            status: "reviewed",
            reviewedAt,
            updatedAt: reviewedAt,
          })
          .where(eq(reflections.id, reflection.id))
          .returning();

        reflection = reviewedReflection ?? reflection;

        const integrationResults = await Promise.allSettled([
          generateAndPersistFormulation(user.id, "reflection_submit"),
          generateAndPersistTherapyPlan(user.id, "reflection_submit"),
        ]);

        await generateAndPersistClinicalHandoffReport(user.id, "reflection_submit");

        const downstreamFailures = integrationResults.filter((result) => result.status === "rejected");
        if (downstreamFailures.length === 0) {
          const integratedAt = new Date();
          const [integratedReflection] = await db
            .update(reflections)
            .set({
              status: "integrated",
              integratedAt,
              updatedAt: integratedAt,
            })
            .where(eq(reflections.id, reflection.id))
            .returning();

          reflection = integratedReflection ?? reflection;
        }
      } catch (err) {
        console.error(
          "[reflective-questions] post-submit integration failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    const [updatedQuestion] = await db
      .select()
      .from(reflectiveQuestions)
      .where(eq(reflectiveQuestions.id, questionId))
      .limit(1);

    return c.json(
      SaveReflectionResponseSchema.parse({
        question: serializeQuestionCard({
          question: updatedQuestion ?? question,
          latestReflection: reflection,
        }),
      }),
    );
  })

  // ── DELETE /:id — Retire a question (soft delete) ─────────────
  .delete("/:id", async (c) => {
    const questionId = c.req.param("id");
    const user = await getOrCreateUser();

    const [existing] = await db
      .select({ id: reflectiveQuestions.id })
      .from(reflectiveQuestions)
      .where(
        and(
          eq(reflectiveQuestions.id, questionId),
          eq(reflectiveQuestions.userId, user.id),
          ne(reflectiveQuestions.status, "retired"),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: "Question not found" }, 404);
    }

    await db
      .update(reflectiveQuestions)
      .set({ status: "retired", updatedAt: new Date() })
      .where(eq(reflectiveQuestions.id, questionId));

    return c.body(null, 204);
  })

  // ── POST /:id/defer — Defer a question ────────────────────────
  .post("/:id/defer", async (c) => {
    const questionId = c.req.param("id");
    const user = await getOrCreateUser();

    const [existing] = await db
      .select({ id: reflectiveQuestions.id, status: reflectiveQuestions.status })
      .from(reflectiveQuestions)
      .where(
        and(
          eq(reflectiveQuestions.id, questionId),
          eq(reflectiveQuestions.userId, user.id),
          ne(reflectiveQuestions.status, "retired"),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: "Question not found" }, 404);
    }

    await db
      .update(reflectiveQuestions)
      .set({ status: "deferred", updatedAt: new Date() })
      .where(eq(reflectiveQuestions.id, questionId));

    return c.json({ status: "deferred" });
  });

// ── Export ────────────────────────────────────────────────────────

export type ReflectiveQuestionRoutes = typeof app;
export default app;
