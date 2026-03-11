// ── Journey Routes ────────────────────────────────────────────────
// GET /timeline   — Unified timeline of sessions, memories, assessments, moods
// GET /insights   — AI-generated formulation (cached)
// GET /assessments — Assessment history

import { zValidator } from "@hono/zod-validator";
import { AssessmentHistoryQuerySchema, JourneyTimelineQuerySchema } from "@moc/shared";
import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray } from "drizzle-orm";
import { Hono } from "hono";
import { getOrCreateUser } from "../db/helpers.js";
import { db } from "../db/index.js";
import { assessments, memories, messages, moodLogs, sessionSummaries, sessions } from "../db/schema/index";
import { spawnClaudeStreaming } from "../sdk/session-manager.js";

// ── Formulation Cache ───────────────────────────────────────────
// In-memory cache with 1-hour TTL. Invalidated on new session end.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let formulationCache: { data: Record<string, any>; cachedAt: Date } | null = null;
const FORMULATION_TTL_MS = 60 * 60 * 1000; // 1 hour

export function invalidateInsightsCache() {
  formulationCache = null;
}

// ── Route Definitions ────────────────────────────────────────────

const app = new Hono()

  // ── GET /timeline — Unified Timeline ────────────────────────
  .get("/timeline", zValidator("query", JourneyTimelineQuerySchema), async (c) => {
    const { limit, offset, from, to } = c.req.valid("query");
    const user = await getOrCreateUser();

    // Build date conditions
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    // Over-fetch from each source so the merged result has enough rows
    // for correct offset + limit slicing across all types.
    const fetchLimit = limit + offset;

    // Fetch all four data types in parallel
    const [sessionRows, memoryRows, assessmentRows, moodRows] = await Promise.all([
      // Sessions with summaries
      db
        .select({
          id: sessions.id,
          startedAt: sessions.startedAt,
          endedAt: sessions.endedAt,
          summaryContent: sessionSummaries.content,
          themes: sessionSummaries.themes,
        })
        .from(sessions)
        .leftJoin(
          sessionSummaries,
          and(eq(sessions.id, sessionSummaries.sessionId), eq(sessionSummaries.level, "session")),
        )
        .where(
          and(
            eq(sessions.userId, user.id),
            eq(sessions.status, "completed"),
            fromDate ? gte(sessions.startedAt, fromDate) : undefined,
            toDate ? lte(sessions.startedAt, toDate) : undefined,
          ),
        )
        .orderBy(desc(sessions.startedAt))
        .limit(fetchLimit),

      // Memories (non-superseded, high confidence only)
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
            eq(memories.userId, user.id),
            isNull(memories.supersededBy),
            gte(memories.confidence, 0.5),
            fromDate ? gte(memories.createdAt, fromDate) : undefined,
            toDate ? lte(memories.createdAt, toDate) : undefined,
          ),
        )
        .orderBy(desc(memories.createdAt))
        .limit(fetchLimit),

      // Assessments
      db
        .select({
          id: assessments.id,
          type: assessments.type,
          totalScore: assessments.totalScore,
          severity: assessments.severity,
          createdAt: assessments.createdAt,
        })
        .from(assessments)
        .where(
          and(
            eq(assessments.userId, user.id),
            fromDate ? gte(assessments.createdAt, fromDate) : undefined,
            toDate ? lte(assessments.createdAt, toDate) : undefined,
          ),
        )
        .orderBy(desc(assessments.createdAt))
        .limit(fetchLimit),

      // Mood logs
      db
        .select({
          id: moodLogs.id,
          valence: moodLogs.valence,
          arousal: moodLogs.arousal,
          createdAt: moodLogs.createdAt,
        })
        .from(moodLogs)
        .where(
          and(
            eq(moodLogs.userId, user.id),
            fromDate ? gte(moodLogs.createdAt, fromDate) : undefined,
            toDate ? lte(moodLogs.createdAt, toDate) : undefined,
          ),
        )
        .orderBy(desc(moodLogs.createdAt))
        .limit(fetchLimit),
    ]);

    // Merge into a unified timeline sorted by date (descending)
    type TimelineItem =
      | {
          type: "session";
          data: {
            id: string;
            startedAt: string;
            endedAt: string | null;
            summary: string | null;
            themes: string[] | null;
          };
          sortDate: Date;
        }
      | {
          type: "memory";
          data: {
            id: string;
            content: string;
            memoryType: string;
            confidence: number;
            createdAt: string;
          };
          sortDate: Date;
        }
      | {
          type: "assessment";
          data: {
            id: string;
            type: string;
            totalScore: number;
            severity: string;
            createdAt: string;
          };
          sortDate: Date;
        }
      | {
          type: "mood";
          data: { id: string; valence: number; arousal: number; createdAt: string };
          sortDate: Date;
        };

    const items: TimelineItem[] = [];

    for (const r of sessionRows) {
      items.push({
        type: "session",
        data: {
          id: r.id,
          startedAt: r.startedAt.toISOString(),
          endedAt: r.endedAt?.toISOString() ?? null,
          summary: r.summaryContent ?? null,
          themes: r.themes ?? null,
        },
        sortDate: r.startedAt,
      });
    }

    for (const r of memoryRows) {
      items.push({
        type: "memory",
        data: {
          id: r.id,
          content: r.content,
          memoryType: r.memoryType,
          confidence: r.confidence,
          createdAt: r.createdAt.toISOString(),
        },
        sortDate: r.createdAt,
      });
    }

    for (const r of assessmentRows) {
      items.push({
        type: "assessment",
        data: {
          id: r.id,
          type: r.type,
          totalScore: r.totalScore,
          severity: r.severity,
          createdAt: r.createdAt.toISOString(),
        },
        sortDate: r.createdAt,
      });
    }

    for (const r of moodRows) {
      items.push({
        type: "mood",
        data: {
          id: r.id,
          valence: r.valence,
          arousal: r.arousal,
          createdAt: r.createdAt.toISOString(),
        },
        sortDate: r.createdAt,
      });
    }

    // Sort by date descending, then apply offset/limit
    items.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
    const paged = items.slice(offset, offset + limit);

    // Strip sortDate from response
    const response = paged.map(({ sortDate: _, ...rest }) => rest);

    return c.json({ items: response, limit, offset });
  })

  // ── GET /insights — AI-Generated Formulation ──────────────────
  .get("/insights", async (c) => {
    const user = await getOrCreateUser();

    // Check cache validity
    if (formulationCache && Date.now() - formulationCache.cachedAt.getTime() < FORMULATION_TTL_MS) {
      return c.json(formulationCache.data);
    }

    // Fetch ALL data sources in parallel (including session count for confidence)
    const [sessionCountRows, summaryRows, memoryRows, assessmentRows, moodRows] = await Promise.all([
      // Session count + date spread for dataConfidence
      db
        .select({
          id: sessions.id,
          startedAt: sessions.startedAt,
        })
        .from(sessions)
        .where(and(eq(sessions.userId, user.id), eq(sessions.status, "completed")))
        .orderBy(desc(sessions.startedAt)),

      // Session summaries (cap at 7, with cognitivePatterns and themes)
      db
        .select({
          content: sessionSummaries.content,
          themes: sessionSummaries.themes,
          cognitivePatterns: sessionSummaries.cognitivePatterns,
          actionItems: sessionSummaries.actionItems,
          createdAt: sessionSummaries.createdAt,
        })
        .from(sessionSummaries)
        .where(and(eq(sessionSummaries.userId, user.id), eq(sessionSummaries.level, "session")))
        .orderBy(desc(sessionSummaries.createdAt))
        .limit(7),

      // ALL non-session_summary memory types, non-superseded, ordered by confidence
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
            eq(memories.userId, user.id),
            isNull(memories.supersededBy),
            inArray(memories.memoryType, [
              "life_event",
              "profile_fact",
              "recurring_trigger",
              "unresolved_thread",
              "coping_strategy",
              "relationship",
              "symptom_episode",
              "win",
              "goal",
              "safety_critical",
            ]),
          ),
        )
        .orderBy(desc(memories.confidence))
        .limit(100),

      // ALL assessments with scores + timestamps
      db
        .select({
          type: assessments.type,
          totalScore: assessments.totalScore,
          severity: assessments.severity,
          createdAt: assessments.createdAt,
        })
        .from(assessments)
        .where(eq(assessments.userId, user.id))
        .orderBy(desc(assessments.createdAt)),

      // Recent mood entries for trend
      db
        .select({
          valence: moodLogs.valence,
          arousal: moodLogs.arousal,
          createdAt: moodLogs.createdAt,
        })
        .from(moodLogs)
        .where(eq(moodLogs.userId, user.id))
        .orderBy(desc(moodLogs.createdAt))
        .limit(30),
    ]);

    // ── Compute dataConfidence from evidence density ──────────
    const completedSessions = sessionCountRows.length;
    const uniqueDays = new Set(
      sessionCountRows.map((s) => s.startedAt.toISOString().slice(0, 10)),
    ).size;
    const memoryTypeCount = new Set(memoryRows.map((m) => m.memoryType)).size;
    const hasAssessments = assessmentRows.length > 0;
    const hasSummaries = summaryRows.length > 0;

    // Evidence density score: sessions + day spread + memory diversity + assessments + summaries
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

    // ── Check for active crisis state (safety gating) ───────────
    const hasSafetyCritical = memoryRows.some((m) => m.memoryType === "safety_critical");

    // If there's no data at all, return sparse empty formulation
    if (summaryRows.length === 0 && memoryRows.length === 0) {
      const emptyFormulation = {
        formulation: {
          presentingTheme: "",
          roots: [] as Array<{ content: string; sourceType: string; confidence: number }>,
          recentActivators: [] as Array<{ content: string; confidence: number }>,
          perpetuatingCycles: [] as Array<{ pattern: string; mechanism: string }>,
          protectiveStrengths: [] as Array<{ content: string; sourceType: string }>,
        },
        userReflection: {
          summary: "Your journey is just beginning. Each conversation adds to a richer picture.",
          encouragement: "We're here whenever you're ready to talk.",
        },
        activeStates: [] as Array<{ label: string; confidence: number; signal: string; domain: string }>,
        domainSignals: {},
        questionsWorthExploring: [] as Array<{ question: string; rationale: string; linkedTo: string }>,
        themeOfToday: "Your journey is just beginning. Each conversation adds to a richer picture.",
        dataConfidence,
        moodTrend,
        cachedAt: new Date().toISOString(),
      };
      formulationCache = { data: emptyFormulation, cachedAt: new Date() };
      return c.json(emptyFormulation);
    }

    // ── Pre-prompt consolidation: dedup + rank ──────────────────
    // Collapse near-duplicate memories (same content prefix within same type)
    const deduped = deduplicateMemories(memoryRows);

    // Group deduplicated memories by type (cap each at 8 after dedup)
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

    // Heuristic relationship sub-buckets (inferred from content, no schema change)
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

    // Build prompt context
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

    const memoryContext = Object.entries(memoryGroups)
      .filter(([, items]) => items.length > 0)
      .map(
        ([type, items]) =>
          `=== ${type} ===\n${items.map((m) => `- [${m.id.slice(0, 8)}] ${m.content} (confidence: ${m.confidence}, date: ${m.createdAt})`).join("\n")}`,
      )
      .join("\n\n");

    // Format relationship sub-buckets separately for richer prompt context
    const relationshipContext = Object.entries(relationshipBuckets)
      .filter(([, items]) => items.length > 0)
      .map(
        ([bucket, items]) =>
          `--- ${bucket} ---\n${items.map((r) => `- [${r.id.slice(0, 8)}] ${r.content} (confidence: ${r.confidence})`).join("\n")}`,
      )
      .join("\n");

    // Safety gating: suppress deep questions during crisis/destabilization
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
- Infer domainSignals across 6 domains: connection, momentum, groundedness, meaning, self_regard, vitality
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let formulation: Record<string, any> | null = null;

    try {
      const rawResponse = await spawnClaudeStreaming(prompt, () => {});
      if (rawResponse.trim()) {
        let jsonStr = rawResponse.trim();
        const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeFenceMatch?.[1]) jsonStr = codeFenceMatch[1].trim();

        const parsed = JSON.parse(jsonStr);

        // Build the formulation response, with safe defaults for missing fields
        formulation = {
          formulation: {
            presentingTheme: parsed.formulation?.presentingTheme ?? "",
            roots: Array.isArray(parsed.formulation?.roots) ? parsed.formulation.roots : [],
            recentActivators: Array.isArray(parsed.formulation?.recentActivators)
              ? parsed.formulation.recentActivators
              : [],
            perpetuatingCycles: Array.isArray(parsed.formulation?.perpetuatingCycles)
              ? parsed.formulation.perpetuatingCycles
              : [],
            protectiveStrengths: Array.isArray(parsed.formulation?.protectiveStrengths)
              ? parsed.formulation.protectiveStrengths
              : [],
          },
          userReflection: {
            summary: parsed.userReflection?.summary ?? "",
            encouragement: parsed.userReflection?.encouragement ?? "",
          },
          activeStates: Array.isArray(parsed.activeStates) ? parsed.activeStates : [],
          domainSignals: parsed.domainSignals ?? {},
          questionsWorthExploring: Array.isArray(parsed.questionsWorthExploring)
            ? parsed.questionsWorthExploring
            : [],
          themeOfToday: parsed.themeOfToday ?? "",
          dataConfidence,
          moodTrend,
          cachedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.error("[journey] Failed to generate formulation:", err);
    }

    // Fallback if generation failed
    if (!formulation) {
      formulation = {
        formulation: {
          presentingTheme: "",
          roots: [] as Array<{ content: string; sourceType: string; confidence: number }>,
          recentActivators: [] as Array<{ content: string; confidence: number }>,
          perpetuatingCycles: [] as Array<{ pattern: string; mechanism: string }>,
          protectiveStrengths: [] as Array<{ content: string; sourceType: string }>,
        },
        userReflection: {
          summary: "We're still gathering threads from your conversations.",
          encouragement: "Every session helps us understand you better.",
        },
        activeStates: [] as Array<{ label: string; confidence: number; signal: string; domain: string }>,
        domainSignals: {},
        questionsWorthExploring: [] as Array<{ question: string; rationale: string; linkedTo: string }>,
        themeOfToday: "We're still gathering threads from your conversations.",
        dataConfidence,
        moodTrend,
        cachedAt: new Date().toISOString(),
      };
    }

    formulationCache = { data: formulation, cachedAt: new Date() };
    return c.json(formulation);
  })

  // ── GET /assessments — Assessment History ───────────────────
  .get("/assessments", zValidator("query", AssessmentHistoryQuerySchema), async (c) => {
    const { limit, offset } = c.req.valid("query");
    const user = await getOrCreateUser();

    const rows = await db
      .select({
        id: assessments.id,
        type: assessments.type,
        totalScore: assessments.totalScore,
        severity: assessments.severity,
        createdAt: assessments.createdAt,
      })
      .from(assessments)
      .where(eq(assessments.userId, user.id))
      .orderBy(desc(assessments.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      assessments: rows.map((r) => ({
        id: r.id,
        type: r.type,
        totalScore: r.totalScore,
        severity: r.severity,
        createdAt: r.createdAt.toISOString(),
      })),
      limit,
      offset,
    });
  })

  // ── POST /backfill-summaries — Generate missing session summaries ──
  .post("/backfill-summaries", async (c) => {
    const user = await getOrCreateUser();

    // Find completed sessions that have NO session_summaries row
    const existingSummarySessionIds = db
      .select({ sessionId: sessionSummaries.sessionId })
      .from(sessionSummaries)
      .where(
        and(
          eq(sessionSummaries.userId, user.id),
          eq(sessionSummaries.level, "session"),
        ),
      );

    const missingSessions = await db
      .select({ id: sessions.id, startedAt: sessions.startedAt, endedAt: sessions.endedAt })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, user.id),
          eq(sessions.status, "completed"),
          notInArray(sessions.id, existingSummarySessionIds),
        ),
      )
      .orderBy(asc(sessions.startedAt));

    if (missingSessions.length === 0) {
      return c.json({ backfilled: 0, message: "All sessions already have summaries." });
    }

    let backfilled = 0;
    const errors: string[] = [];

    for (const session of missingSessions) {
      // Load conversation messages for this session
      const msgRows = await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.sessionId, session.id))
        .orderBy(asc(messages.createdAt));

      if (msgRows.length === 0) {
        errors.push(`${session.id}: no messages found`);
        continue;
      }

      // Format and generate summary using the same prompt as session-end
      const conversationText = msgRows
        .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join("\n\n");

      const summaryPrompt = `You are a summarization assistant for MindOverChatter, an AI wellness companion (NOT a therapist).

Given a conversation between a user and their wellness companion, generate a structured summary in JSON format.

Your response must be ONLY valid JSON with this exact structure:
{
  "content": "A 2-4 sentence narrative summary of what was discussed and any insights gained. Use warm, non-clinical language. Focus on the user's experience and progress.",
  "themes": ["theme1", "theme2"],
  "cognitive_patterns": ["pattern1", "pattern2"],
  "action_items": ["item1", "item2"]
}

Rules:
- "content": 2-4 sentences. Warm, empathetic tone.
- "themes": 1-5 short topic labels.
- "cognitive_patterns": 0-4 thinking patterns observed. Everyday language, not DSM.
- "action_items": 0-3 concrete next steps. If none, use an empty array.

NEVER diagnose, use clinical terminology, or refer to user as "patient" or "client".

Conversation:
${conversationText}`;

      try {
        const rawResponse = await spawnClaudeStreaming(summaryPrompt, () => {});
        if (!rawResponse.trim()) {
          errors.push(`${session.id}: empty response`);
          continue;
        }

        let jsonStr = rawResponse.trim();
        const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeFenceMatch?.[1]) jsonStr = codeFenceMatch[1].trim();

        const parsed = JSON.parse(jsonStr) as {
          content?: string;
          themes?: string[];
          cognitive_patterns?: string[];
          action_items?: string[];
        };

        const content = parsed.content;
        if (!content || typeof content !== "string") {
          errors.push(`${session.id}: missing content field`);
          continue;
        }

        const themes = Array.isArray(parsed.themes)
          ? parsed.themes.filter((t): t is string => typeof t === "string")
          : [];
        const cognitivePatterns = Array.isArray(parsed.cognitive_patterns)
          ? parsed.cognitive_patterns.filter((p): p is string => typeof p === "string")
          : [];
        const actionItems = Array.isArray(parsed.action_items)
          ? parsed.action_items.filter((a): a is string => typeof a === "string")
          : [];

        await db.insert(sessionSummaries).values({
          userId: user.id,
          sessionId: session.id,
          level: "session",
          content,
          themes: themes.length > 0 ? themes : null,
          cognitivePatterns: cognitivePatterns.length > 0 ? cognitivePatterns : null,
          actionItems: actionItems.length > 0 ? actionItems : null,
          periodStart: session.startedAt,
          periodEnd: session.endedAt ?? new Date(),
        });

        backfilled++;
        console.log(`[backfill] Generated summary for session ${session.id}`);
      } catch (err) {
        errors.push(`${session.id}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }

    // Invalidate cache so next insights request uses the new summaries
    invalidateInsightsCache();

    return c.json({
      backfilled,
      total: missingSessions.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  });

// ── Helpers ──────────────────────────────────────────────────────

/** Collapse near-duplicate memories within the same type.
 *  Two memories are "near-duplicates" if they share the same type and
 *  their content (lowercased, first 60 chars) matches. Keep the higher-confidence one. */
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

  // Split into first half and second half (recent vs older)
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

// ── Export ────────────────────────────────────────────────────────

export type JourneyRoutes = typeof app;
export default app;
