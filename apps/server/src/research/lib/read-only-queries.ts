// ── Research Read-Only Queries ────────────────────────────────────
// Pure SELECT queries against live tables. Never INSERT/UPDATE/DELETE.
// All functions accept a db instance injected from the caller so they
// are testable in isolation and carry no implicit DB connection.

import { and, asc, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../../db/schema/index";
import {
  assessments,
  memoryBlocks,
  messages,
  moodLogs,
  sessionSummaries,
  sessions,
  therapyPlans,
} from "../../db/schema/index";

type Db = PostgresJsDatabase<typeof schema>;

// ── Row types ────────────────────────────────────────────────────

export interface SessionMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  sessionId: string;
}

export interface AssessmentRow {
  id: string;
  type: string;
  totalScore: number;
  severity: string;
  createdAt: Date;
}

export interface TherapyPlanRow {
  id: string;
  version: number;
  workingHypotheses: Array<{
    hypothesis: string;
    confidence: number;
    evidence: string;
    internal_only: boolean;
  }>;
  therapeuticGoals: Array<{
    goal: string;
    description: string;
    progress: string;
    visible_label: string;
  }>;
  recommendedSessionMode: string | null;
  createdAt: Date;
}

export interface SessionSummaryWithSession {
  summaryId: string;
  sessionId: string | null;
  themes: string[] | null;
  cognitivePatterns: string[] | null;
  actionItems: string[] | null;
  sessionStartedAt: Date;
  sessionMode: string | null;
}

export interface MoodLogRow {
  id: string;
  valence: number;
  arousal: number;
  source: string;
  createdAt: Date;
}

export interface SessionRow {
  id: string;
  mode: string | null;
  startedAt: Date;
  endedAt: Date | null;
  turnCount: number;
}

// ── Query functions ──────────────────────────────────────────────

/**
 * Returns the content of the companion/therapeutic_calibration memory block
 * for the given user, or an empty string if none exists.
 */
export async function getLiveCalibrationBlock(db: Db, userId: string): Promise<string> {
  const rows = await db
    .select({ content: memoryBlocks.content })
    .from(memoryBlocks)
    .where(
      and(
        eq(memoryBlocks.userId, userId),
        eq(memoryBlocks.label, "companion/therapeutic_calibration"),
      ),
    )
    .limit(1);

  return rows[0]?.content ?? "";
}

/**
 * Returns the most recent N assessments for the user ordered by createdAt DESC.
 * Only returns phq9 and gad7 types since these are the scored assessments used
 * for outcome trajectory analysis.
 */
export async function getAssessmentTrajectory(
  db: Db,
  userId: string,
  limit = 10,
): Promise<AssessmentRow[]> {
  const rows = await db
    .select({
      id: assessments.id,
      type: assessments.type,
      totalScore: assessments.totalScore,
      severity: assessments.severity,
      createdAt: assessments.createdAt,
    })
    .from(assessments)
    .where(eq(assessments.userId, userId))
    .orderBy(desc(assessments.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    totalScore: r.totalScore,
    severity: r.severity,
    createdAt: r.createdAt,
  }));
}

/**
 * Returns the most recent N therapy plans for the user ordered by version DESC.
 * Extracts working_hypotheses, therapeutic_goals, and recommended_session_mode
 * from the JSONB plan column.
 */
export async function getTherapyPlanHistory(
  db: Db,
  userId: string,
  limit = 10,
): Promise<TherapyPlanRow[]> {
  const rows = await db
    .select({
      id: therapyPlans.id,
      version: therapyPlans.version,
      plan: therapyPlans.plan,
      createdAt: therapyPlans.createdAt,
    })
    .from(therapyPlans)
    .where(eq(therapyPlans.userId, userId))
    .orderBy(desc(therapyPlans.version))
    .limit(limit);

  return rows.map((r) => {
    const plan = r.plan as Record<string, unknown>;
    const hypotheses = Array.isArray(plan.working_hypotheses)
      ? (plan.working_hypotheses as Array<Record<string, unknown>>).map((h) => ({
          hypothesis: typeof h.hypothesis === "string" ? h.hypothesis : "",
          confidence: typeof h.confidence === "number" ? h.confidence : 0,
          evidence: typeof h.evidence === "string" ? h.evidence : "",
          internal_only: h.internal_only === true,
        }))
      : [];

    const goals = Array.isArray(plan.therapeutic_goals)
      ? (plan.therapeutic_goals as Array<Record<string, unknown>>).map((g) => ({
          goal: typeof g.goal === "string" ? g.goal : "",
          description: typeof g.description === "string" ? g.description : "",
          progress: typeof g.progress === "string" ? g.progress : "nascent",
          visible_label: typeof g.visible_label === "string" ? g.visible_label : "",
        }))
      : [];

    return {
      id: r.id,
      version: r.version,
      workingHypotheses: hypotheses,
      therapeuticGoals: goals,
      recommendedSessionMode:
        typeof plan.recommended_session_mode === "string" ? plan.recommended_session_mode : null,
      createdAt: r.createdAt,
    };
  });
}

/**
 * Returns session summaries joined with session data for the given user.
 * Ordered by session.startedAt DESC. Only returns summaries with a linked session.
 * Sessions without a corresponding session_summaries row are excluded.
 */
export async function getSessionSummariesWithSessions(
  db: Db,
  userId: string,
  limit = 10,
): Promise<SessionSummaryWithSession[]> {
  const rows = await db
    .select({
      summaryId: sessionSummaries.id,
      sessionId: sessionSummaries.sessionId,
      themes: sessionSummaries.themes,
      cognitivePatterns: sessionSummaries.cognitivePatterns,
      actionItems: sessionSummaries.actionItems,
      sessionStartedAt: sessions.startedAt,
      // sessions table has no dedicated mode column — mode is managed in-memory
      // during active sessions and not persisted per-session in the DB.
      sessionMode: sessions.status, // status is the closest persisted signal
    })
    .from(sessionSummaries)
    .innerJoin(sessions, eq(sessionSummaries.sessionId, sessions.id))
    .where(and(eq(sessionSummaries.userId, userId), eq(sessionSummaries.level, "session")))
    .orderBy(desc(sessions.startedAt))
    .limit(limit);

  return rows.map((r) => ({
    summaryId: r.summaryId,
    sessionId: r.sessionId,
    themes: r.themes,
    cognitivePatterns: r.cognitivePatterns,
    actionItems: r.actionItems,
    sessionStartedAt: r.sessionStartedAt,
    // Note: sessionMode here carries the session status enum value, not the
    // therapeutic mode. The actual mode is not persisted per-session.
    sessionMode: r.sessionMode,
  }));
}

/**
 * Returns the most recent N mood logs for the user ordered by createdAt DESC.
 */
export async function getMoodLogs(db: Db, userId: string, limit = 20): Promise<MoodLogRow[]> {
  const rows = await db
    .select({
      id: moodLogs.id,
      valence: moodLogs.valence,
      arousal: moodLogs.arousal,
      source: moodLogs.source,
      createdAt: moodLogs.createdAt,
    })
    .from(moodLogs)
    .where(eq(moodLogs.userId, userId))
    .orderBy(desc(moodLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    valence: r.valence,
    arousal: r.arousal,
    source: r.source,
    createdAt: r.createdAt,
  }));
}

/**
 * Returns all messages for a session in chronological order (oldest first).
 * Useful for turn sampling in the offline replay harness (Experiment D).
 */
export async function getSessionMessages(db: Db, sessionId: string): Promise<SessionMessageRow[]> {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      sessionId: messages.sessionId,
    })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: r.createdAt,
    sessionId: r.sessionId,
  }));
}

/**
 * Returns completed sessions for the user ordered by startedAt DESC.
 * Note: turnCount is not persisted in the sessions table; it is derived from
 * session_summaries existence as a proxy (0 or 1+). Mode is not persisted
 * per-session and is returned as null — use therapy plan recommendations as proxy.
 */
export async function getSessionsWithMode(db: Db, userId: string): Promise<SessionRow[]> {
  const rows = await db
    .select({
      id: sessions.id,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      status: sessions.status,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.status, "completed")))
    .orderBy(desc(sessions.startedAt));

  return rows.map((r) => ({
    id: r.id,
    // mode is not persisted per-session — always null; use therapy plan as proxy
    mode: null,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    // turnCount is not stored in sessions table
    turnCount: 0,
  }));
}
