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
  "themeOfToday": "one evocative sentence capturing the most salient current thread"
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
- Cap output to ~800 tokens.

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
        dataConfidence,
        moodTrend,
      };
    }
  } catch (err) {
    console.error("[formulation-service] Failed to generate formulation:", err);
  }

  // Fallback if generation failed
  if (!snapshot) {
    snapshot = {
      formulation: {
        presentingTheme: "",
        roots: [],
        recentActivators: [],
        perpetuatingCycles: [],
        protectiveStrengths: [],
      },
      userReflection: {
        summary: "We're still gathering threads from your conversations.",
        encouragement: "Every session helps us understand you better.",
      },
      activeStates: [],
      domainSignals: {},
      questionsWorthExploring: [],
      themeOfToday: "We're still gathering threads from your conversations.",
      dataConfidence,
      moodTrend,
    };
    // Do NOT persist fallback — let the next request retry
    return { snapshot, domainSignals: {}, actionRecommendations, dataConfidence };
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

function deduplicateMemories<
  T extends { content: string; memoryType: string; confidence: number },
>(rows: T[]): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.memoryType}::${row.content.toLowerCase().trim().slice(0, 60)}`;
    const existing = seen.get(key);
    if (!existing || row.confidence > existing.confidence) {
      seen.set(key, row);
    }
  }
  return [...seen.values()];
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
