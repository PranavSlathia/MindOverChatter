// ── Experiment C — therapeutic-direction.md Effectiveness Tracker ─
// Reads the therapeutic-direction.md skill file (if it exists), parses its
// directives, and evaluates per-session compliance against therapy plan mode
// recommendations.
//
// INVARIANT: Does NOT import upsertBlock, generateAndPersistTherapyPlan,
// or generateAndPersistFormulation.
//
// Data gap note: session mode transitions are NOT persisted in the sessions
// table. Mode is managed in-memory during active sessions. Compliance uses
// the therapy plan's recommended_session_mode as a proxy.

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../../db/index.js";
import { researchDirectionCompliance } from "../db/schema/index.js";
import type { SessionRow, SessionSummaryWithSession, TherapyPlanRow } from "../lib/read-only-queries.js";
import {
  getSessionSummariesWithSessions,
  getSessionsWithMode,
  getTherapyPlanHistory,
} from "../lib/read-only-queries.js";

// ── Experiment version ────────────────────────────────────────────

const EXPERIMENT_VERSION = "1.0.0";

// ── Therapeutic direction file path ──────────────────────────────
// Resolved relative to the monorepo root (4 levels up from this file:
// apps/server/src/research/experiments/ → root).

const SKILLS_DIR = resolve(
  new URL(".", import.meta.url).pathname,
  "../../../../../.claude/skills",
);

const DIRECTION_FILE = resolve(SKILLS_DIR, "therapeutic-direction.md");

// ── Always-present data gap ───────────────────────────────────────

const MODE_PERSISTENCE_GAP =
  "Session mode transitions are not persisted — mode alignment uses therapy plan recommendation as proxy only";

// ── Public types ─────────────────────────────────────────────────

export interface DirectionComplianceResult {
  runId: string;
  userId: string;
  directionVersion: string;
  activeDirectives: string[];
  sessionsAnalyzed: number;
  meanComplianceScore: number;
  modeAlignedSessions: number;
  modeUnalignedSessions: number;
  dataGaps: string[];
  ranAt: Date;
}

// ── Directive parser ──────────────────────────────────────────────
// Extracts bullet/numbered lines from the markdown file.

function parseDirectives(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]/.test(line) || /^\d+\./.test(line))
    .map((line) =>
      line
        .replace(/^[-*]\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .trim(),
    )
    .filter((d) => d.length > 0);
}

// ── Mode alignment heuristic ──────────────────────────────────────
// Finds the most recent therapy plan whose createdAt is before the session's
// startedAt. This is the plan that was active when the session began.

function findActivePlanForSession(
  session: SessionRow,
  chronPlans: TherapyPlanRow[],
): TherapyPlanRow | null {
  // chronPlans sorted chronologically ascending
  // Find the last plan that was created before the session started
  let activePlan: TherapyPlanRow | null = null;
  for (const plan of chronPlans) {
    if (plan.createdAt <= session.startedAt) {
      activePlan = plan;
    } else {
      break;
    }
  }
  return activePlan;
}

// ── Compliance score heuristic ────────────────────────────────────
// 0.5 base + 0.25 if mode aligned + 0.25 if any directive keyword in summary themes.

function computeComplianceScore(
  modeAligned: boolean,
  summary: SessionSummaryWithSession | null,
  directives: string[],
): number {
  let score = 0.5;

  if (modeAligned) {
    score += 0.25;
  }

  if (summary && directives.length > 0) {
    const themesText = (summary.themes ?? []).join(" ").toLowerCase();
    const actionText = (summary.actionItems ?? []).join(" ").toLowerCase();
    const combinedText = `${themesText} ${actionText}`;

    const anyDirectiveKeyword = directives.some((d) => {
      const words = d
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4);
      return words.some((w) => combinedText.includes(w));
    });

    if (anyDirectiveKeyword) {
      score += 0.25;
    }
  }

  return Math.min(1.0, Math.max(0.0, score));
}

// ── Main experiment function ──────────────────────────────────────

export async function runExperimentC(userId: string): Promise<DirectionComplianceResult> {
  const runId = randomUUID();
  const ranAt = new Date();

  // Step 1 — read therapeutic-direction.md
  let directionContent: string;
  try {
    directionContent = readFileSync(DIRECTION_FILE, "utf-8");
  } catch {
    // File does not exist
    const result: DirectionComplianceResult = {
      runId,
      userId,
      directionVersion: "none",
      activeDirectives: [],
      sessionsAnalyzed: 0,
      meanComplianceScore: 0,
      modeAlignedSessions: 0,
      modeUnalignedSessions: 0,
      dataGaps: [
        "therapeutic-direction.md does not exist — run Phase A first",
        MODE_PERSISTENCE_GAP,
      ],
      ranAt,
    };
    return result;
  }

  // Step 2 — hash content for version tracking
  const directionVersion = createHash("sha256")
    .update(directionContent)
    .digest("hex")
    .slice(0, 8);

  // Step 3 — parse directives
  const activeDirectives = parseDirectives(directionContent);

  // Step 4 — fetch data needed for per-session analysis
  const [completedSessions, plans, summaries] = await Promise.all([
    getSessionsWithMode(db, userId),
    getTherapyPlanHistory(db, userId, 20),
    getSessionSummariesWithSessions(db, userId, 20),
  ]);

  // Sort plans chronologically for findActivePlanForSession
  const chronPlans = [...plans].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  // Build summary lookup by sessionId
  const summaryBySessionId = new Map<string, SessionSummaryWithSession>();
  for (const s of summaries) {
    if (s.sessionId) {
      summaryBySessionId.set(s.sessionId, s);
    }
  }

  // Step 5 — analyse each completed session
  const dataGaps: string[] = [MODE_PERSISTENCE_GAP];
  let totalComplianceScore = 0;
  let modeAligned = 0;
  let modeUnaligned = 0;

  for (const session of completedSessions) {
    const activePlan = findActivePlanForSession(session, chronPlans);
    const summary = summaryBySessionId.get(session.id) ?? null;

    // Mode alignment: compare recommended mode from plan to... the only signal
    // we have, which is the plan recommendation itself (since mode is not stored
    // per-session). This is documented as a data gap but still records the plan's
    // recommendation for audit purposes.
    const recommendedMode = activePlan?.recommendedSessionMode ?? null;

    // We treat the session as "mode aligned" when the therapy plan recommendation
    // exists (it was used to initialise the session) and we have no contradicting
    // evidence. This is a weak signal explicitly documented as a gap.
    const isAligned = recommendedMode !== null;

    if (isAligned) {
      modeAligned += 1;
    } else {
      modeUnaligned += 1;
    }

    const complianceScore = computeComplianceScore(isAligned, summary, activeDirectives);
    totalComplianceScore += complianceScore;

    // Write one row per session
    await db.insert(researchDirectionCompliance).values({
      userId,
      experimentRunId: runId,
      sessionId: session.id,
      directionContent,
      directionVersion,
      activeDirectives: activeDirectives as unknown as string[],
      recommendedMode,
      // Actual dominant mode is not persisted — null by design
      actualDominantMode: null,
      modeAligned: isAligned,
      directiveFollowed: null,
      directiveViolated: null,
      complianceScore,
      sessionOutcome: summary
        ? {
            themes: summary.themes,
            cognitivePatterns: summary.cognitivePatterns,
            actionItems: summary.actionItems,
          }
        : null,
      assessmentDelta: null,
      experimentVersion: EXPERIMENT_VERSION,
      ranAt,
    });
  }

  const sessionsAnalyzed = completedSessions.length;
  const meanComplianceScore =
    sessionsAnalyzed > 0 ? totalComplianceScore / sessionsAnalyzed : 0;

  return {
    runId,
    userId,
    directionVersion,
    activeDirectives,
    sessionsAnalyzed,
    meanComplianceScore,
    modeAlignedSessions: modeAligned,
    modeUnalignedSessions: modeUnaligned,
    dataGaps,
    ranAt,
  };
}
