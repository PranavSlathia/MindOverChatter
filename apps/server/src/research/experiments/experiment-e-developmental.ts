// ── Experiment E — Developmental Coverage Tracker ─────────────────
// Evaluates per-session developmental coverage across 5 dimensions
// using session summaries and message content as signals.
//
// Dimensions (each scored 0.0 / 0.5 / 1.0):
//   attachment_quality  — caregiver/early relationship explored
//   family_climate      — family emotional environment probed
//   schema_formation    — core beliefs (worth/love/trust/autonomy) touched
//   formative_events    — specific formative experiences elicited
//   origin_to_present   — explicit link made between past and current pattern
//
// INVARIANT: Read-only against live tables. Writes only to
// research_developmental_coverage. No session logic is touched.

import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { researchDevelopmentalCoverage } from "../db/schema/index.js";
import type {
  SessionRow,
  SessionSummaryWithSession,
  SessionMessageRow,
} from "../lib/read-only-queries.js";
import {
  getSessionsWithMode,
  getSessionSummariesWithSessions,
  getSessionMessages,
} from "../lib/read-only-queries.js";

// ── Experiment version ────────────────────────────────────────────

const EXPERIMENT_VERSION = "1.0.0";

// ── Dimension definitions ─────────────────────────────────────────

export type DevelopmentalDimension =
  | "attachment_quality"
  | "family_climate"
  | "schema_formation"
  | "formative_events"
  | "origin_to_present";

export const DIMENSIONS: DevelopmentalDimension[] = [
  "attachment_quality",
  "family_climate",
  "schema_formation",
  "formative_events",
  "origin_to_present",
];

// ── Keyword signal maps ───────────────────────────────────────────
// Each dimension has two tiers:
//   strong  — clear, direct signal (score 1.0)
//   weak    — partial signal (score 0.5)

const DIMENSION_SIGNALS: Record<
  DevelopmentalDimension,
  { strong: string[]; weak: string[] }
> = {
  attachment_quality: {
    strong: [
      "caregiver", "attachment", "reliable", "consistently there",
      "could count on", "felt safe with", "turned to", "reached out to",
      "primary caregiver", "raised by",
    ],
    weak: [
      "parents", "mother", "father", "who cared for", "looked after",
      "grew up with", "lived with",
    ],
  },
  family_climate: {
    strong: [
      "family atmosphere", "emotional climate", "family dynamic",
      "how feelings were handled", "expressed emotions", "talked about feelings",
      "family rule", "family pattern", "role in the family",
    ],
    weak: [
      "family", "home", "household", "growing up", "childhood home",
      "siblings", "at home", "family life",
    ],
  },
  schema_formation: {
    strong: [
      "earn love", "earn approval", "felt worthless", "felt unlovable",
      "had to prove", "never enough", "always felt", "core belief",
      "believed about myself", "felt undeserving", "felt unsafe",
      "couldn't trust", "had to be on guard",
    ],
    weak: [
      "worth", "belonging", "trust", "safety", "self-worth", "self-esteem",
      "value", "lovable", "deserving", "capable", "autonomy",
    ],
  },
  formative_events: {
    strong: [
      "formative", "turning point", "changed everything", "that moment",
      "pivotal", "never forgot", "still remember", "shaped me",
      "changed how i saw myself",
    ],
    weak: [
      "an event", "something happened", "went through", "experience",
      "memory", "back then", "at that time", "when i was",
    ],
  },
  origin_to_present: {
    strong: [
      "where that comes from", "goes back", "started back",
      "connected to", "same pattern", "familiar feeling",
      "always been this way", "comes from my", "rooted in",
    ],
    weak: [
      "maybe that's why", "wonder if", "might be related",
      "could be connected", "perhaps", "reflects", "reminds me of",
    ],
  },
};

// ── Scoring function ──────────────────────────────────────────────

function scoreDimension(
  dimension: DevelopmentalDimension,
  text: string,
): { score: number; notes: string } {
  const lower = text.toLowerCase();
  const signals = DIMENSION_SIGNALS[dimension];

  const strongHits = signals.strong.filter((kw) => lower.includes(kw));
  const weakHits = signals.weak.filter((kw) => lower.includes(kw));

  if (strongHits.length > 0) {
    return {
      score: 1.0,
      notes: `Strong signals: ${strongHits.slice(0, 3).join(", ")}`,
    };
  }
  if (weakHits.length > 0) {
    return {
      score: 0.5,
      notes: `Weak signals only: ${weakHits.slice(0, 3).join(", ")}`,
    };
  }
  return { score: 0.0, notes: "No developmental signals detected" };
}

// ── Public types ─────────────────────────────────────────────────

export interface SessionDevelopmentalCoverage {
  sessionId: string;
  sessionStartedAt: Date;
  dimensions: Record<DevelopmentalDimension, { score: number; notes: string }>;
  totalScore: number;
}

export interface DevelopmentalCoverageResult {
  runId: string;
  userId: string;
  sessionsAnalyzed: number;
  sessionCoverage: SessionDevelopmentalCoverage[];
  meanTotalScore: number;
  dimensionMeans: Record<DevelopmentalDimension, number>;
  dataGaps: string[];
  ranAt: Date;
}

// ── Main experiment function ──────────────────────────────────────

export async function runExperimentE(userId: string): Promise<DevelopmentalCoverageResult> {
  const runId = randomUUID();
  const ranAt = new Date();
  const dataGaps: string[] = [
    "Scoring is heuristic — based on keyword signals in session summaries and messages, not LLM evaluation",
    "Message content may not be stored for all sessions (depends on message persistence configuration)",
  ];

  // Fetch completed sessions + summaries
  const [completedSessions, summaries] = await Promise.all([
    getSessionsWithMode(db, userId),
    getSessionSummariesWithSessions(db, userId, 50),
  ]);

  if (completedSessions.length === 0) {
    return {
      runId,
      userId,
      sessionsAnalyzed: 0,
      sessionCoverage: [],
      meanTotalScore: 0,
      dimensionMeans: {
        attachment_quality: 0,
        family_climate: 0,
        schema_formation: 0,
        formative_events: 0,
        origin_to_present: 0,
      },
      dataGaps: [...dataGaps, "No completed sessions found"],
      ranAt,
    };
  }

  // Build summary lookup by sessionId
  const summaryBySessionId = new Map<string, SessionSummaryWithSession>();
  for (const s of summaries) {
    if (s.sessionId) {
      summaryBySessionId.set(s.sessionId, s);
    }
  }

  const sessionCoverage: SessionDevelopmentalCoverage[] = [];
  const dimensionTotals: Record<DevelopmentalDimension, number> = {
    attachment_quality: 0,
    family_climate: 0,
    schema_formation: 0,
    formative_events: 0,
    origin_to_present: 0,
  };
  let totalScoreSum = 0;

  for (const session of completedSessions) {
    // Build a text corpus from summary + messages for this session
    const summary = summaryBySessionId.get(session.id);
    const summaryText = summary
      ? [
          ...(summary.themes ?? []),
          ...(summary.actionItems ?? []),
          ...(summary.cognitivePatterns ?? []),
        ].join(" ")
      : "";

    // Fetch messages for this session (may be empty if not persisted)
    let messagesText = "";
    try {
      const msgs: SessionMessageRow[] = await getSessionMessages(db, session.id);
      messagesText = msgs.map((m) => m.content).join(" ");
    } catch {
      // Messages not available — fall back to summary only
    }

    const corpus = `${summaryText} ${messagesText}`;

    // Score each dimension
    const dimensions = {} as Record<DevelopmentalDimension, { score: number; notes: string }>;
    let sessionTotal = 0;

    for (const dim of DIMENSIONS) {
      const result = scoreDimension(dim, corpus);
      dimensions[dim] = result;
      dimensionTotals[dim] += result.score;
      sessionTotal += result.score;

      // Persist one row per dimension per session
      await db.insert(researchDevelopmentalCoverage).values({
        userId,
        experimentRunId: runId,
        sessionId: session.id,
        dimension: dim,
        score: result.score,
        notes: result.notes,
        experimentVersion: EXPERIMENT_VERSION,
        evaluatedAt: ranAt,
      });
    }

    sessionCoverage.push({
      sessionId: session.id,
      sessionStartedAt: session.startedAt,
      dimensions,
      totalScore: sessionTotal,
    });

    totalScoreSum += sessionTotal;
  }

  const sessionsAnalyzed = completedSessions.length;

  const dimensionMeans: Record<DevelopmentalDimension, number> = {
    attachment_quality: sessionsAnalyzed > 0 ? dimensionTotals.attachment_quality / sessionsAnalyzed : 0,
    family_climate: sessionsAnalyzed > 0 ? dimensionTotals.family_climate / sessionsAnalyzed : 0,
    schema_formation: sessionsAnalyzed > 0 ? dimensionTotals.schema_formation / sessionsAnalyzed : 0,
    formative_events: sessionsAnalyzed > 0 ? dimensionTotals.formative_events / sessionsAnalyzed : 0,
    origin_to_present: sessionsAnalyzed > 0 ? dimensionTotals.origin_to_present / sessionsAnalyzed : 0,
  };

  const meanTotalScore = sessionsAnalyzed > 0 ? totalScoreSum / sessionsAnalyzed : 0;

  return {
    runId,
    userId,
    sessionsAnalyzed,
    sessionCoverage,
    meanTotalScore,
    dimensionMeans,
    dataGaps,
    ranAt,
  };
}
