// ── Formulation Service ──────────────────────────────────────────
// Extracted from journey.ts. Single pipeline for generating and persisting
// canonical formulation snapshots to the `user_formulations` table.
//
// Consumers: session end, assessment submit, journey /insights.

import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  assessments,
  memories,
  moodLogs,
  sessionSummaries,
  sessions,
  userFormulations,
} from "../db/schema/index";
import { spawnClaudeStreaming } from "../sdk/session-manager.js";
import {
  computeDomainSignals,
  computeDomainTrends,
  detectCorrelations,
} from "../routes/assessment-domain-mapping.js";
import type { AssessmentInput } from "../routes/assessment-domain-mapping.js";
import { computeActionRecommendations } from "../routes/assessment-actions.js";
import type { ActionRecommendation } from "../routes/assessment-actions.js";

// ── Types ───────────────────────────────────────────────────────

export type FormulationTrigger = "session_end" | "assessment_submit" | "manual";

export interface FormulationResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  domainSignals: Record<string, any>;
  actionRecommendations: ActionRecommendation[];
  dataConfidence: "sparse" | "emerging" | "established";
}

// ── Constants ───────────────────────────────────────────────────

const FORMULATION_FRESHNESS_MS = 60 * 60 * 1000; // 1 hour
const REGENERATION_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Public API ──────────────────────────────────────────────────

/**
 * Get a recent formulation from the DB if fresh enough.
 * Returns null if none exists or it's stale.
 */
export async function getRecentFormulation(
  userId: string,
  maxAgeMs: number = FORMULATION_FRESHNESS_MS,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ snapshot: Record<string, any>; actionRecommendations: ActionRecommendation[]; domainSignals: Record<string, any>; dataConfidence: string; createdAt: Date } | null> {
  const cutoff = new Date(Date.now() - maxAgeMs);

  const [row] = await db
    .select()
    .from(userFormulations)
    .where(
      and(
        eq(userFormulations.userId, userId),
        gte(userFormulations.createdAt, cutoff),
      ),
    )
    .orderBy(desc(userFormulations.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    snapshot: row.snapshot as Record<string, any>,
    actionRecommendations: (row.actionRecommendations ?? []) as ActionRecommendation[],
    domainSignals: (row.domainSignals ?? {}) as Record<string, any>,
    dataConfidence: row.dataConfidence,
    createdAt: row.createdAt,
  };
}

/**
 * Get the latest formulation regardless of age.
 */
export async function getLatestFormulation(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ snapshot: Record<string, any>; actionRecommendations: ActionRecommendation[]; domainSignals: Record<string, any>; dataConfidence: string } | null> {
  const [row] = await db
    .select()
    .from(userFormulations)
    .where(eq(userFormulations.userId, userId))
    .orderBy(desc(userFormulations.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    snapshot: row.snapshot as Record<string, any>,
    actionRecommendations: (row.actionRecommendations ?? []) as ActionRecommendation[],
    domainSignals: (row.domainSignals ?? {}) as Record<string, any>,
    dataConfidence: row.dataConfidence,
  };
}

/**
 * Get the best available formulation instantly (no Claude CLI).
 * Priority: recent DB row → latest DB row (any age) → algorithmic-only fallback.
 * If the formulation is stale, triggers a background regeneration.
 */
export async function getFormulationInstant(
  userId: string,
): Promise<FormulationResult> {
  // 1. Try recent formulation (< 1 hour)
  const recent = await getRecentFormulation(userId);
  if (recent) {
    return {
      snapshot: recent.snapshot,
      domainSignals: recent.domainSignals,
      actionRecommendations: recent.actionRecommendations,
      dataConfidence: recent.dataConfidence as FormulationResult["dataConfidence"],
    };
  }

  // 2. Try latest formulation regardless of age
  const latest = await getLatestFormulation(userId);
  if (latest) {
    // Trigger background regeneration since it's stale
    generateAndPersistFormulation(userId, "manual").catch((err) => {
      console.error("[formulation-service] Background regeneration failed:", err);
    });
    return {
      snapshot: latest.snapshot,
      domainSignals: latest.domainSignals,
      actionRecommendations: latest.actionRecommendations,
      dataConfidence: latest.dataConfidence as FormulationResult["dataConfidence"],
    };
  }

  // 3. No formulation exists at all — build algorithmic-only (fast, no Claude)
  const result = await generateAlgorithmicFormulation(userId);

  // Also trigger a full Claude generation in the background for next load
  generateAndPersistFormulation(userId, "manual").catch((err) => {
    console.error("[formulation-service] Background initial generation failed:", err);
  });

  return result;
}

/**
 * Build a formulation from algorithmic data only (no Claude CLI call).
 * Fast — runs DB queries + pure functions only. Does NOT persist.
 */
async function generateAlgorithmicFormulation(
  userId: string,
): Promise<FormulationResult> {
  const [summaryRows, memoryRows, assessmentRows, moodRows, sessionCountRows] = await Promise.all([
    db
      .select({
        content: sessionSummaries.content,
        themes: sessionSummaries.themes,
        cognitivePatterns: sessionSummaries.cognitivePatterns,
        actionItems: sessionSummaries.actionItems,
        createdAt: sessionSummaries.createdAt,
      })
      .from(sessionSummaries)
      .where(and(eq(sessionSummaries.userId, userId), eq(sessionSummaries.level, "session")))
      .orderBy(desc(sessionSummaries.createdAt))
      .limit(7),

    db
      .select({
        id: memories.id,
        content: memories.content,
        memoryType: memories.memoryType,
        confidence: memories.confidence,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          isNull(memories.supersededBy),
          inArray(memories.memoryType, [
            "life_event", "profile_fact", "recurring_trigger", "unresolved_thread",
            "coping_strategy", "relationship", "symptom_episode", "win", "goal", "safety_critical",
          ]),
        ),
      )
      .orderBy(desc(memories.confidence))
      .limit(100),

    db
      .select({
        type: assessments.type,
        answers: assessments.answers,
        totalScore: assessments.totalScore,
        severity: assessments.severity,
        createdAt: assessments.createdAt,
      })
      .from(assessments)
      .where(eq(assessments.userId, userId))
      .orderBy(desc(assessments.createdAt)),

    db
      .select({
        valence: moodLogs.valence,
        arousal: moodLogs.arousal,
        createdAt: moodLogs.createdAt,
      })
      .from(moodLogs)
      .where(eq(moodLogs.userId, userId))
      .orderBy(desc(moodLogs.createdAt))
      .limit(30),

    db
      .select({ id: sessions.id, startedAt: sessions.startedAt })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "completed")))
      .orderBy(desc(sessions.startedAt)),
  ]);

  // Compute data confidence
  const completedSessions = sessionCountRows.length;
  const uniqueDays = new Set(sessionCountRows.map((s) => s.startedAt.toISOString().slice(0, 10))).size;
  const memoryTypeCount = new Set(memoryRows.map((m) => m.memoryType)).size;
  const evidenceScore =
    Math.min(completedSessions, 10) +
    Math.min(uniqueDays, 7) * 1.5 +
    memoryTypeCount * 0.5 +
    (assessmentRows.length > 0 ? 2 : 0) +
    (summaryRows.length > 0 ? 2 : 0);
  const dataConfidence: FormulationResult["dataConfidence"] =
    evidenceScore < 5 ? "sparse" : evidenceScore < 15 ? "emerging" : "established";

  const moodTrend = computeMoodTrend(moodRows);

  // Empty data case
  if (summaryRows.length === 0 && memoryRows.length === 0 && assessmentRows.length === 0) {
    return {
      snapshot: {
        formulation: { presentingTheme: "", roots: [], recentActivators: [], perpetuatingCycles: [], protectiveStrengths: [] },
        userReflection: { summary: "Your journey is just beginning. Each conversation adds to a richer picture.", encouragement: "We're here whenever you're ready to talk." },
        activeStates: [], domainSignals: {}, questionsWorthExploring: [], themeOfToday: "Your journey is just beginning.",
        copingSteps: [], dataConfidence, moodTrend,
      },
      domainSignals: {},
      actionRecommendations: [],
      dataConfidence,
    };
  }

  // Dedup + group memories
  const deduped = deduplicateMemories(memoryRows);
  const groupByType = (type: string) =>
    deduped.filter((m) => m.memoryType === type).slice(0, 8).map((m) => ({
      id: m.id, content: m.content, confidence: m.confidence, createdAt: m.createdAt.toISOString(),
    }));
  const memoryGroups = {
    life_event: groupByType("life_event"),
    recurring_trigger: groupByType("recurring_trigger"),
    unresolved_thread: groupByType("unresolved_thread"),
    coping_strategy: groupByType("coping_strategy"),
    symptom_episode: groupByType("symptom_episode"),
    win: groupByType("win"),
    goal: groupByType("goal"),
    safety_critical: groupByType("safety_critical"),
  };

  // Algorithmic domain signals
  const assessmentInputs: AssessmentInput[] = assessmentRows
    .filter((a) => a.answers && Array.isArray(a.answers))
    .map((a) => ({
      type: a.type as AssessmentInput["type"],
      answers: a.answers as number[],
      totalScore: a.totalScore,
      severity: a.severity as AssessmentInput["severity"],
      createdAt: a.createdAt,
    }));

  const algorithmicDomainSignals = computeDomainSignals(assessmentInputs);
  const correlations = detectCorrelations(assessmentInputs);
  const domainTrends = computeDomainTrends(assessmentInputs);
  const actionRecommendations = computeActionRecommendations(algorithmicDomainSignals, correlations, domainTrends, assessmentInputs);

  // Build domain signals object
  const domainSignalsObj: Record<string, unknown> = {};
  for (const sig of algorithmicDomainSignals) {
    const trend = domainTrends.find((t) => t.domain === sig.domain);
    domainSignalsObj[sig.domain] = {
      level: sig.level,
      trend: trend?.trend ?? "stable",
      evidence: `Based on ${sig.contributions.length} assessment(s).`,
    };
  }

  // Derive theme from session summary themes
  const recentThemes = summaryRows.flatMap((s) => s.themes ?? []).filter(Boolean).slice(0, 3);
  const themeOfToday = recentThemes.length > 0 ? recentThemes.join(", ") : "We're still gathering threads from your conversations.";

  // Build active states from assessments
  const activeStates: Array<{ label: string; confidence: number; signal: string; domain: string }> = [];
  for (const a of assessmentRows.slice(0, 5)) {
    if (a.severity === "moderate" || a.severity === "moderately_severe" || a.severity === "severe") {
      const domain = a.type === "phq9" ? "vitality" : a.type === "gad7" ? "groundedness" : "self_regard";
      activeStates.push({ label: `${a.type.toUpperCase()} indicates ${a.severity.replace("_", " ")}`, confidence: 0.8, signal: `Score: ${a.totalScore}`, domain });
    }
  }
  for (const m of memoryGroups.symptom_episode.slice(0, 3)) {
    activeStates.push({ label: m.content.slice(0, 80), confidence: m.confidence, signal: "From conversation memory", domain: "vitality" });
  }

  const snapshot = {
    formulation: {
      presentingTheme: recentThemes[0] ?? "",
      roots: memoryGroups.life_event.slice(0, 3).map((m) => ({ content: m.content, sourceType: "life_event", confidence: m.confidence, evidenceRefs: [{ sourceType: "life_event", sourceId: m.id.slice(0, 8) }] })),
      recentActivators: memoryGroups.recurring_trigger.slice(0, 3).map((m) => ({ content: m.content, confidence: m.confidence, evidenceRefs: [{ sourceType: "recurring_trigger", sourceId: m.id.slice(0, 8) }] })),
      perpetuatingCycles: memoryGroups.unresolved_thread.slice(0, 3).map((m) => ({ pattern: m.content.slice(0, 80), mechanism: "Identified from conversation patterns", evidenceRefs: [{ sourceType: "unresolved_thread", sourceId: m.id.slice(0, 8) }] })),
      protectiveStrengths: [
        ...memoryGroups.win.slice(0, 3).map((m) => ({ content: m.content, sourceType: "win", evidenceRefs: [{ sourceType: "win", sourceId: m.id.slice(0, 8) }] })),
        ...memoryGroups.goal.slice(0, 2).map((m) => ({ content: m.content, sourceType: "goal", evidenceRefs: [{ sourceType: "goal", sourceId: m.id.slice(0, 8) }] })),
        ...memoryGroups.coping_strategy.slice(0, 2).map((m) => ({ content: m.content, sourceType: "coping_strategy", evidenceRefs: [{ sourceType: "coping_strategy", sourceId: m.id.slice(0, 8) }] })),
      ],
    },
    userReflection: {
      summary: summaryRows.length > 0
        ? `From our recent conversations, we've been exploring ${recentThemes.slice(0, 2).join(" and ") || "several topics together"}.`
        : "We're still gathering threads from your conversations.",
      encouragement: "Every session helps us understand you better.",
    },
    activeStates,
    domainSignals: domainSignalsObj,
    questionsWorthExploring: actionRecommendations.slice(0, 4).map((a) => ({ question: a.conversationHint, rationale: a.evidenceSummary, linkedTo: a.domain })),
    themeOfToday,
    copingSteps: memoryGroups.coping_strategy.slice(0, 4).map((m) => ({ step: m.content.slice(0, 60), rationale: `Something you've shared with us.`, domain: "groundedness" })),
    dataConfidence,
    moodTrend,
  };

  return { snapshot, domainSignals: domainSignalsObj, actionRecommendations, dataConfidence };
}

/**
 * Start background periodic formulation regeneration.
 * Runs every 2 hours for users who have had recent activity.
 */
export function startFormulationScheduler(): void {
  console.log("[formulation-service] Starting background scheduler (every 2h)");

  setInterval(async () => {
    try {
      // Find users with sessions in the last 7 days
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const activeUsers = await db
        .selectDistinct({ userId: sessions.userId })
        .from(sessions)
        .where(gte(sessions.startedAt, cutoff));

      for (const { userId } of activeUsers) {
        // Skip if there's a recent formulation
        const recent = await getRecentFormulation(userId, REGENERATION_INTERVAL_MS);
        if (recent) continue;

        console.log(`[formulation-service] Regenerating formulation for user ${userId}`);
        await generateAndPersistFormulation(userId, "manual").catch((err) => {
          console.error(`[formulation-service] Scheduled regeneration failed for ${userId}:`, err);
        });
      }
    } catch (err) {
      console.error("[formulation-service] Scheduler error:", err);
    }
  }, REGENERATION_INTERVAL_MS);
}

/**
 * Run the full formulation pipeline: fetch data, compute signals,
 * call Claude, persist to `user_formulations`, and return the result.
 */
export async function generateAndPersistFormulation(
  userId: string,
  triggeredBy: FormulationTrigger,
): Promise<FormulationResult> {
  // ── Fetch ALL data sources in parallel ──────────────────────
  const [sessionCountRows, summaryRows, memoryRows, assessmentRows, moodRows] = await Promise.all([
    db
      .select({ id: sessions.id, startedAt: sessions.startedAt })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "completed")))
      .orderBy(desc(sessions.startedAt)),

    db
      .select({
        content: sessionSummaries.content,
        themes: sessionSummaries.themes,
        cognitivePatterns: sessionSummaries.cognitivePatterns,
        actionItems: sessionSummaries.actionItems,
        createdAt: sessionSummaries.createdAt,
      })
      .from(sessionSummaries)
      .where(and(eq(sessionSummaries.userId, userId), eq(sessionSummaries.level, "session")))
      .orderBy(desc(sessionSummaries.createdAt))
      .limit(7),

    db
      .select({
        id: memories.id,
        content: memories.content,
        memoryType: memories.memoryType,
        confidence: memories.confidence,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          isNull(memories.supersededBy),
          inArray(memories.memoryType, [
            "life_event", "profile_fact", "recurring_trigger", "unresolved_thread",
            "coping_strategy", "relationship", "symptom_episode", "win", "goal", "safety_critical",
          ]),
        ),
      )
      .orderBy(desc(memories.confidence))
      .limit(100),

    db
      .select({
        type: assessments.type,
        answers: assessments.answers,
        totalScore: assessments.totalScore,
        severity: assessments.severity,
        createdAt: assessments.createdAt,
      })
      .from(assessments)
      .where(eq(assessments.userId, userId))
      .orderBy(desc(assessments.createdAt)),

    db
      .select({
        valence: moodLogs.valence,
        arousal: moodLogs.arousal,
        createdAt: moodLogs.createdAt,
      })
      .from(moodLogs)
      .where(eq(moodLogs.userId, userId))
      .orderBy(desc(moodLogs.createdAt))
      .limit(30),
  ]);

  // ── Compute dataConfidence ──────────────────────────────────
  const completedSessions = sessionCountRows.length;
  const uniqueDays = new Set(
    sessionCountRows.map((s) => s.startedAt.toISOString().slice(0, 10)),
  ).size;
  const memoryTypeCount = new Set(memoryRows.map((m) => m.memoryType)).size;
  const hasAssessments = assessmentRows.length > 0;
  const hasSummaries = summaryRows.length > 0;

  const evidenceScore =
    Math.min(completedSessions, 10) +
    Math.min(uniqueDays, 7) * 1.5 +
    memoryTypeCount * 0.5 +
    (hasAssessments ? 2 : 0) +
    (hasSummaries ? 2 : 0);

  const dataConfidence: "sparse" | "emerging" | "established" =
    evidenceScore < 5 ? "sparse" : evidenceScore < 15 ? "emerging" : "established";

  // ── Compute mood trend ──────────────────────────────────────
  const moodTrend = computeMoodTrend(moodRows);

  // ── Safety check ────────────────────────────────────────────
  const hasSafetyCritical = memoryRows.some((m) => m.memoryType === "safety_critical");

  // ── Empty data → minimal formulation ────────────────────────
  if (summaryRows.length === 0 && memoryRows.length === 0) {
    const emptySnapshot = {
      formulation: {
        presentingTheme: "",
        roots: [],
        recentActivators: [],
        perpetuatingCycles: [],
        protectiveStrengths: [],
      },
      userReflection: {
        summary: "Your journey is just beginning. Each conversation adds to a richer picture.",
        encouragement: "We're here whenever you're ready to talk.",
      },
      activeStates: [],
      domainSignals: {},
      questionsWorthExploring: [],
      themeOfToday: "Your journey is just beginning. Each conversation adds to a richer picture.",
      dataConfidence,
      moodTrend,
    };

    // Persist even the empty formulation so we don't re-generate
    await persistFormulation(userId, emptySnapshot, {}, [], dataConfidence, triggeredBy);

    return { snapshot: emptySnapshot, domainSignals: {}, actionRecommendations: [], dataConfidence };
  }

  // ── Dedup + group memories ──────────────────────────────────
  const deduped = deduplicateMemories(memoryRows);

  const groupByType = (type: string) =>
    deduped
      .filter((m) => m.memoryType === type)
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        content: m.content,
        confidence: m.confidence,
        createdAt: m.createdAt.toISOString(),
      }));

  const relationships = deduped.filter((m) => m.memoryType === "relationship");
  const relationshipBuckets = {
    family: relationships.filter((r) =>
      /\b(father|mother|dad|mom|parent|brother|sister|family|papa|maa|bhai|didi|uncle|aunt)\b/i.test(r.content),
    ),
    romantic: relationships.filter((r) =>
      /\b(partner|ex|girlfriend|boyfriend|wife|husband|dating|relationship|breakup)\b/i.test(r.content),
    ),
    friends: relationships.filter((r) =>
      /\b(friend|buddy|dost|yaar|colleague|roommate)\b/i.test(r.content),
    ),
    other: relationships.filter(
      (r) =>
        !/\b(father|mother|dad|mom|parent|brother|sister|family|papa|maa|bhai|didi|uncle|aunt|partner|ex|girlfriend|boyfriend|wife|husband|dating|relationship|breakup|friend|buddy|dost|yaar|colleague|roommate)\b/i.test(
          r.content,
        ),
    ),
  };

  const memoryGroups = {
    life_event: groupByType("life_event"),
    profile_fact: groupByType("profile_fact"),
    recurring_trigger: groupByType("recurring_trigger"),
    unresolved_thread: groupByType("unresolved_thread"),
    coping_strategy: groupByType("coping_strategy"),
    symptom_episode: groupByType("symptom_episode"),
    win: groupByType("win"),
    goal: groupByType("goal"),
    safety_critical: groupByType("safety_critical"),
  };

  // ── Build prompt context strings ────────────────────────────
  const summaryContext = summaryRows
    .map((s) => {
      const parts = [`Summary: ${s.content}`];
      if (s.themes?.length) parts.push(`Themes: ${s.themes.join(", ")}`);
      if (s.cognitivePatterns?.length) parts.push(`Cognitive patterns: ${s.cognitivePatterns.join(", ")}`);
      if (s.actionItems?.length) parts.push(`Action items: ${s.actionItems.join(", ")}`);
      parts.push(`Date: ${s.createdAt.toISOString()}`);
      return parts.join("\n");
    })
    .join("\n---\n");

  const assessmentContext = assessmentRows
    .map(
      (a) =>
        `${a.type.toUpperCase()} — Score: ${a.totalScore}, Severity: ${a.severity} (${a.createdAt.toISOString()})`,
    )
    .join("\n");

  // ── Algorithmic domain signals ──────────────────────────────
  const assessmentInputs: AssessmentInput[] = assessmentRows
    .filter((a) => a.answers && Array.isArray(a.answers))
    .map((a) => ({
      type: a.type as AssessmentInput["type"],
      answers: a.answers as number[],
      totalScore: a.totalScore,
      severity: a.severity as AssessmentInput["severity"],
      createdAt: a.createdAt,
    }));

  const algorithmicDomainSignals = computeDomainSignals(assessmentInputs);
  const correlations = detectCorrelations(assessmentInputs);
  const domainTrends = computeDomainTrends(assessmentInputs);
  const actionRecommendations = computeActionRecommendations(
    algorithmicDomainSignals,
    correlations,
    domainTrends,
    assessmentInputs,
  );

  const memoryContext = Object.entries(memoryGroups)
    .filter(([, items]) => items.length > 0)
    .map(
      ([type, items]) =>
        `=== ${type} ===\n${items.map((m) => `- [${m.id.slice(0, 8)}] ${m.content} (confidence: ${m.confidence}, date: ${m.createdAt})`).join("\n")}`,
    )
    .join("\n\n");

  const relationshipContext = Object.entries(relationshipBuckets)
    .filter(([, items]) => items.length > 0)
    .map(
      ([bucket, items]) =>
        `--- ${bucket} ---\n${items.map((r) => `- [${r.id.slice(0, 8)}] ${r.content} (confidence: ${r.confidence})`).join("\n")}`,
    )
    .join("\n");

  const questionDepth = hasSafetyCritical
    ? "SAFETY MODE: Generate only gentle, grounding questions. No deep exploratory probes. Focus on present stability and existing strengths."
    : dataConfidence === "sparse"
      ? "Generate gentle, exploratory questions only. The person is new."
      : "Generate questions that reference specific patterns and tensions from the formulation.";

  const prompt = `You are an internal clinical psychologist writing structured case formulation notes for a wellness companion app. Your output has TWO layers: an internal structured formulation AND a user-facing warm reflection. Users never see this prompt.

Produce a JSON object matching this exact schema:

{
  "formulation": {
    "presentingTheme": "one sentence — the thread running through recent conversations",
    "roots": [{ "content": "...", "sourceType": "life_event|profile_fact", "confidence": 0.0-1.0, "evidenceRefs": [{"sourceType": "life_event", "sourceId": "id-prefix"}] }],
    "recentActivators": [{ "content": "...", "confidence": 0.0-1.0, "evidenceRefs": [{"sourceType": "recurring_trigger"}] }],
    "perpetuatingCycles": [{ "pattern": "observable behavior", "mechanism": "internal logic", "evidenceRefs": [{"sourceType": "unresolved_thread"}] }],
    "protectiveStrengths": [{ "content": "...", "sourceType": "win|goal|relationship", "evidenceRefs": [{"sourceType": "win"}] }]
  },
  "userReflection": {
    "summary": "2-3 sentences — warm, reflective narrative of what we've noticed together. This IS shown to the user. Write as a companion observing alongside, not a clinician analyzing from above.",
    "encouragement": "1-2 sentences — validates the user's effort, references something specific they've done or shared."
  },
  "activeStates": [{ "label": "...", "confidence": 0.0-1.0, "signal": "evidence string", "domain": "connection|momentum|groundedness|meaning|self_regard|vitality", "evidenceRefs": [{"sourceType": "session_summary"}] }],
  "domainSignals": {
    "<domain>": { "level": "low|medium|high", "trend": "improving|stable|declining", "evidence": "..." }
  },
  "questionsWorthExploring": [{ "question": "...", "rationale": "internal reasoning", "linkedTo": "which formulation part" }],
  "themeOfToday": "one evocative sentence capturing the most salient current thread",
  "copingSteps": [
    {
      "step": "Short action label — warm, specific, ≤8 words",
      "rationale": "1-2 sentences connecting this to what the person has actually shared. Reference their words or experiences, not generic advice.",
      "domain": "connection|momentum|groundedness|meaning|self_regard|vitality"
    }
  ]
}

PROVENANCE: Every root, activator, cycle, strength, and activeState SHOULD include evidenceRefs with the sourceType and the 8-char ID prefix from the memory data below (shown as [xxxxxxxx]). This makes the formulation auditable.

MAPPING RULES:
- life_event + profile_fact → formulation.roots (historical vulnerabilities)
- recurring_trigger → formulation.recentActivators (what triggered current period)
- unresolved_thread + maladaptive coping_strategy → formulation.perpetuatingCycles
- win + goal + supportive relationship → formulation.protectiveStrengths
- Infer activeStates from ALL data (sessions, memories, assessments, moods)
- Use the pre-computed Structured Domain Signals as the PRIMARY source for domainSignals output. Enrich with qualitative evidence from sessions and memories, but NEVER contradict algorithmic signals without explicit evidence.
- Use Action Recommendations to guide questionsWorthExploring.
- themeOfToday: one sentence capturing the most salient current thread (not a mood label)
- copingSteps: Generate 2-4 gentle, actionable suggestions DIRECTLY grounded in the person's own data. Reference their specific experiences (e.g. "You've mentioned sleep has been tough for years — even a small wind-down shift can help"). Frame as invitations, not prescriptions. Use "you might..." or "it could help to...". NO clinical language. NO generic advice that could apply to anyone.

QUESTION DEPTH: ${questionDepth}

DATA CONFIDENCE: ${dataConfidence}
- If "sparse": keep formulation minimal, userReflection gentle, only populate what has clear evidence
- If "emerging": populate more, note uncertainty where appropriate
- If "established": full formulation, deeper questions

=== Session Summaries (${summaryRows.length}) ===
${summaryContext || "None yet."}

=== Memories by Type (deduplicated, ranked by confidence) ===
${memoryContext || "None yet."}

=== Relationships (sub-bucketed) ===
${relationshipContext || "None identified yet."}

=== Assessment Results (${assessmentRows.length}) ===
${assessmentContext || "None yet."}

=== Structured Domain Signals (algorithmically computed) ===
${algorithmicDomainSignals.length > 0 ? algorithmicDomainSignals.map((s) => `${s.domain}: level=${s.level}, score=${s.score.toFixed(2)}, confidence=${s.confidence}, contributors: ${s.contributions.map((c) => `${c.source.assessmentType}${c.source.subscale ? '.' + c.source.subscale : ''}(${c.normalizedScore.toFixed(2)}×${c.weight})`).join(', ')}`).join('\n') : "No assessments yet."}

=== Cross-Instrument Correlations ===
${correlations.length > 0 ? correlations.map((c) => `${c.constructName}: ${c.convergence}${c.divergenceDetail ? ' — ' + c.divergenceDetail : ''}`).join('\n') : "Insufficient data."}

=== Domain Trends (longitudinal) ===
${domainTrends.length > 0 ? domainTrends.map((t) => `${t.domain}: ${t.previousLevel ?? 'n/a'} → ${t.currentLevel} (${t.trend}, ${t.dataPoints} data points, ${t.periodDays} days)`).join('\n') : "Insufficient data."}

=== Action Recommendations ===
${actionRecommendations.length > 0 ? actionRecommendations.map((a) => `[${a.priority}] ${a.domain}: ${a.conversationHint} (${a.evidenceSummary})`).join('\n') : "No specific recommendations."}

=== Mood Trend ===
Direction: ${moodTrend.direction}, Period: ${moodTrend.period}

SAFETY RULES (NON-NEGOTIABLE):
- NEVER surface safety_critical memories as visible labels or content. Use them only to calibrate sensitivity of questions.
- NEVER diagnose or use DSM terminology. Active states are "observed patterns," not traits or conditions.
- NEVER use the word "patient" or position as a therapist. This is a companion observing alongside.
- userReflection.summary must use warm, human language. "We've noticed" not "Clinical assessment indicates."
- Assessments inform but do not dominate. A mild GAD-7 score should not override rich conversational evidence about grief or attachment.
- Cap output to ~1000 tokens.

Respond with ONLY valid JSON, no markdown fences, no explanation.`;

  // ── Call Claude ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let snapshot: Record<string, any> | null = null;

  try {
    const rawResponse = await spawnClaudeStreaming(prompt, () => {});
    if (rawResponse.trim()) {
      let jsonStr = rawResponse.trim();
      const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeFenceMatch?.[1]) jsonStr = codeFenceMatch[1].trim();

      const parsed = JSON.parse(jsonStr);

      // Patch algorithmic domain signals if Claude didn't provide them
      let mergedDomainSignals = parsed.domainSignals ?? {};
      if (Object.keys(mergedDomainSignals).length === 0 && algorithmicDomainSignals.length > 0) {
        mergedDomainSignals = {};
        for (const sig of algorithmicDomainSignals) {
          const trend = domainTrends.find((t) => t.domain === sig.domain);
          mergedDomainSignals[sig.domain] = {
            level: sig.level,
            trend: trend?.trend ?? "stable",
            evidence: `Algorithmically computed from ${sig.contributions.length} instrument(s).`,
            contributions: sig.contributions.map((c) => ({
              assessmentType: c.source.assessmentType,
              subscale: c.source.subscale,
              normalizedScore: c.normalizedScore,
            })),
          };
        }
      }

      snapshot = {
        formulation: {
          presentingTheme: parsed.formulation?.presentingTheme ?? "",
          roots: Array.isArray(parsed.formulation?.roots) ? parsed.formulation.roots : [],
          recentActivators: Array.isArray(parsed.formulation?.recentActivators) ? parsed.formulation.recentActivators : [],
          perpetuatingCycles: Array.isArray(parsed.formulation?.perpetuatingCycles) ? parsed.formulation.perpetuatingCycles : [],
          protectiveStrengths: Array.isArray(parsed.formulation?.protectiveStrengths) ? parsed.formulation.protectiveStrengths : [],
        },
        userReflection: {
          summary: parsed.userReflection?.summary ?? "",
          encouragement: parsed.userReflection?.encouragement ?? "",
        },
        activeStates: Array.isArray(parsed.activeStates) ? parsed.activeStates : [],
        domainSignals: mergedDomainSignals,
        questionsWorthExploring: Array.isArray(parsed.questionsWorthExploring) ? parsed.questionsWorthExploring : [],
        themeOfToday: parsed.themeOfToday ?? "",
        copingSteps: Array.isArray(parsed.copingSteps) ? parsed.copingSteps : [],
        dataConfidence,
        moodTrend,
      };
    }
  } catch (err) {
    console.error("[formulation-service] Failed to generate formulation:", err);
  }

  // Fallback if generation failed — populate with algorithmic data
  if (!snapshot) {
    // Build domain signals from algorithmic computation
    const fallbackDomainSignals: Record<string, unknown> = {};
    for (const sig of algorithmicDomainSignals) {
      const trend = domainTrends.find((t) => t.domain === sig.domain);
      fallbackDomainSignals[sig.domain] = {
        level: sig.level,
        trend: trend?.trend ?? "stable",
        evidence: `Based on ${sig.contributions.length} assessment(s).`,
        contributions: sig.contributions.map((c) => ({
          assessmentType: c.source.assessmentType,
          subscale: c.source.subscale,
          normalizedScore: c.normalizedScore,
        })),
      };
    }

    // Derive activeStates from assessment severity + memory symptom episodes
    const fallbackActiveStates: Array<{ label: string; confidence: number; signal: string; domain: string }> = [];
    for (const a of assessmentRows.slice(0, 5)) {
      if (a.severity === "moderate" || a.severity === "moderately_severe" || a.severity === "severe") {
        const domain = a.type === "phq9" ? "vitality" : a.type === "gad7" ? "groundedness" : "self_regard";
        fallbackActiveStates.push({
          label: `${a.type.toUpperCase()} indicates ${a.severity.replace("_", " ")}`,
          confidence: 0.8,
          signal: `Score: ${a.totalScore}`,
          domain,
        });
      }
    }
    for (const m of memoryGroups.symptom_episode.slice(0, 3)) {
      fallbackActiveStates.push({
        label: m.content.slice(0, 80),
        confidence: m.confidence,
        signal: "From conversation memory",
        domain: "vitality",
      });
    }

    // Derive protectiveStrengths from win/goal/coping_strategy memories
    const fallbackStrengths = [
      ...memoryGroups.win.slice(0, 3).map((m) => ({ content: m.content, sourceType: "win" as const, evidenceRefs: [{ sourceType: "win", sourceId: m.id.slice(0, 8) }] })),
      ...memoryGroups.goal.slice(0, 2).map((m) => ({ content: m.content, sourceType: "goal" as const, evidenceRefs: [{ sourceType: "goal", sourceId: m.id.slice(0, 8) }] })),
      ...memoryGroups.coping_strategy.slice(0, 2).map((m) => ({ content: m.content, sourceType: "coping_strategy" as const, evidenceRefs: [{ sourceType: "coping_strategy", sourceId: m.id.slice(0, 8) }] })),
    ];

    // Derive themeOfToday from most recent session summary themes
    const recentThemes = summaryRows
      .flatMap((s) => s.themes ?? [])
      .filter(Boolean)
      .slice(0, 3);
    const fallbackTheme = recentThemes.length > 0
      ? recentThemes.join(", ")
      : "We're still gathering threads from your conversations.";

    // Derive questionsWorthExploring from action recommendations
    const fallbackQuestions = actionRecommendations.slice(0, 4).map((a) => ({
      question: a.conversationHint,
      rationale: a.evidenceSummary,
      linkedTo: a.domain,
    }));

    // Derive copingSteps from coping_strategy memories
    const fallbackCopingSteps = memoryGroups.coping_strategy.slice(0, 4).map((m) => ({
      step: m.content.slice(0, 60),
      rationale: `Something you've shared with us (confidence: ${m.confidence}).`,
      domain: "groundedness",
    }));

    // Build summary from session summaries if available
    const fallbackSummary = summaryRows.length > 0
      ? `From our recent conversations, we've been exploring ${recentThemes.slice(0, 2).join(" and ") || "several topics together"}.`
      : "We're still gathering threads from your conversations.";

    // Derive presenting theme from recent triggers or themes
    const fallbackPresentingTheme = recentThemes[0] ?? "";

    // Derive roots from life_event memories
    const fallbackRoots = memoryGroups.life_event.slice(0, 3).map((m) => ({
      content: m.content,
      sourceType: "life_event",
      confidence: m.confidence,
      evidenceRefs: [{ sourceType: "life_event", sourceId: m.id.slice(0, 8) }],
    }));

    // Derive recentActivators from recurring_trigger memories
    const fallbackActivators = memoryGroups.recurring_trigger.slice(0, 3).map((m) => ({
      content: m.content,
      confidence: m.confidence,
      evidenceRefs: [{ sourceType: "recurring_trigger", sourceId: m.id.slice(0, 8) }],
    }));

    snapshot = {
      formulation: {
        presentingTheme: fallbackPresentingTheme,
        roots: fallbackRoots,
        recentActivators: fallbackActivators,
        perpetuatingCycles: memoryGroups.unresolved_thread.slice(0, 3).map((m) => ({
          pattern: m.content.slice(0, 80),
          mechanism: "Identified from conversation patterns",
          evidenceRefs: [{ sourceType: "unresolved_thread", sourceId: m.id.slice(0, 8) }],
        })),
        protectiveStrengths: fallbackStrengths,
      },
      userReflection: {
        summary: fallbackSummary,
        encouragement: "Every session helps us understand you better.",
      },
      activeStates: fallbackActiveStates,
      domainSignals: fallbackDomainSignals,
      questionsWorthExploring: fallbackQuestions,
      themeOfToday: fallbackTheme,
      copingSteps: fallbackCopingSteps,
      dataConfidence,
      moodTrend,
    };
    // Do NOT persist fallback — let the next request retry with Claude
    return { snapshot, domainSignals: fallbackDomainSignals, actionRecommendations, dataConfidence };
  }

  // ── Persist to DB ───────────────────────────────────────────
  // Build merged domain signals object for separate storage
  const domainSignalsObj: Record<string, unknown> = {};
  for (const sig of algorithmicDomainSignals) {
    const trend = domainTrends.find((t) => t.domain === sig.domain);
    domainSignalsObj[sig.domain] = {
      level: sig.level,
      score: sig.score,
      confidence: sig.confidence,
      trend: trend?.trend ?? "stable",
      contributions: sig.contributions,
    };
  }

  await persistFormulation(userId, snapshot, domainSignalsObj, actionRecommendations, dataConfidence, triggeredBy);

  return { snapshot, domainSignals: domainSignalsObj, actionRecommendations, dataConfidence };
}

// ── Internal Helpers ──────────────────────────────────────────────

async function persistFormulation(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot: Record<string, any>,
  domainSignals: Record<string, unknown>,
  actionRecommendations: ActionRecommendation[],
  dataConfidence: string,
  triggeredBy: FormulationTrigger,
): Promise<void> {
  // Get next version number
  const [latest] = await db
    .select({ version: userFormulations.version })
    .from(userFormulations)
    .where(eq(userFormulations.userId, userId))
    .orderBy(desc(userFormulations.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  await db.insert(userFormulations).values({
    userId,
    version: nextVersion,
    snapshot,
    domainSignals,
    actionRecommendations,
    dataConfidence,
    triggeredBy,
  });

  console.log(`[formulation-service] Persisted formulation v${nextVersion} for user ${userId} (triggered by: ${triggeredBy})`);
}

/**
 * Collapse near-duplicate memories within the same type.
 * Two memories are "near-duplicates" if they share the same type and
 * their content (lowercased, first 100 chars) matches, AND they were
 * created within 24 hours of each other. Keep the higher-confidence one.
 */
function deduplicateMemories<
  T extends { content: string; memoryType: string; confidence: number; createdAt: Date },
>(rows: T[]): T[] {
  const PROXIMITY_MS = 24 * 60 * 60 * 1000; // 24 hours
  const result: T[] = [];
  const seen = new Map<string, T>();

  for (const row of rows) {
    const key = `${row.memoryType}::${row.content.toLowerCase().trim().slice(0, 100)}`;
    const existing = seen.get(key);
    if (existing) {
      // Only dedup if within 24h proximity
      const timeDiff = Math.abs(row.createdAt.getTime() - existing.createdAt.getTime());
      if (timeDiff <= PROXIMITY_MS) {
        // Keep the higher-confidence one
        if (row.confidence > existing.confidence) {
          seen.set(key, row);
        }
        continue;
      }
    }
    seen.set(key, row);
  }

  // Collect unique values
  const resultSet = new Set(seen.values());
  for (const row of rows) {
    if (resultSet.has(row)) {
      result.push(row);
    }
  }
  return result.length > 0 ? result : [...seen.values()];
}

function computeMoodTrend(moodRows: Array<{ valence: number; arousal: number; createdAt: Date }>): {
  direction: "improving" | "stable" | "declining";
  period: string;
} {
  if (moodRows.length < 2) {
    return { direction: "stable", period: "not enough data" };
  }

  const sorted = [...moodRows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const mid = Math.floor(sorted.length / 2);
  const olderHalf = sorted.slice(0, mid);
  const recentHalf = sorted.slice(mid);

  const avgOlder = olderHalf.reduce((sum, m) => sum + m.valence, 0) / olderHalf.length;
  const avgRecent = recentHalf.reduce((sum, m) => sum + m.valence, 0) / recentHalf.length;

  const diff = avgRecent - avgOlder;
  const earliest = sorted[0]?.createdAt ?? new Date();
  const latest = sorted[sorted.length - 1]?.createdAt ?? new Date();
  const days = Math.max(
    1,
    Math.round((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const period = days <= 7 ? "past week" : days <= 30 ? "past month" : `past ${days} days`;

  if (diff > 0.1) return { direction: "improving", period };
  if (diff < -0.1) return { direction: "declining", period };
  return { direction: "stable", period };
}
