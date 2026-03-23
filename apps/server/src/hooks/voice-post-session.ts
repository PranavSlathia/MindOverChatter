// ── Voice Post-Session Analysis Hook ─────────────────────────────
// Runs as an onEnd hook (priority: early background) for voice sessions.
// Spawns Claude Opus to analyze the full transcript + voice metrics,
// then sets ctx.voiceAnalysis for downstream hooks (session-summary,
// therapy-plan, formulation, user-memory-blocks) to consume.
//
// Gated on session.voiceMetrics != null — text sessions skip entirely.

import { registerOnEnd } from "../sdk/session-lifecycle.js";
import type { OnEndContext } from "../sdk/session-lifecycle.js";
import type { ConversationMessage } from "../sdk/session-manager.js";
import { spawnCliForJson } from "../services/cli-spawner.js";
import { db } from "../db/index.js";
import { sessions } from "../db/schema/index";
import { eq } from "drizzle-orm";
import { env } from "../env.js";

// ── Types ───────────────────────────────────────────────────────

interface VoiceMetricsPayload {
  transcript?: Array<{
    role: string;
    content: string;
    createdAt: string;
    turnIndex: number;
    durationSecs: number;
    pauseBeforeSecs: number;
    wordCount: number;
    wasInterrupted: boolean;
  }>;
  emotions?: Array<{
    turnIndex: number;
    timestamp: string;
    emotionLabel: string;
    confidence: number;
    pitchMean: number;
    pitchStd: number;
    energyMean: number;
    energyStd: number;
    speakingRate: number;
    mfccSummary: number[] | null;
  }>;
  sessionSummary?: {
    totalUserSpeechSecs: number;
    totalSilenceSecs: number;
    speechToSilenceRatio: number;
    interruptionCount: number;
    avgUserTurnLengthWords: number;
    engagementTrajectory: number[];
    emotionArc: [number, string, number][];
  };
}

interface VoiceAnalysisResult {
  observations: string[];
  contradictions: string[];
  engagementAssessment: string;
  therapyPlanRecommendations: string[];
  emotionArcNarrative: string;
}

// ── Prompt Builder ──────────────────────────────────────────────

function buildVoiceAnalysisPrompt(
  conversationHistory: ConversationMessage[],
  voiceMetrics: VoiceMetricsPayload,
): string {
  const transcriptSection = voiceMetrics.transcript
    ? voiceMetrics.transcript
        .map((t) => {
          const meta = [
            `turn=${String(t.turnIndex)}`,
            `duration=${t.durationSecs.toFixed(1)}s`,
            `pause_before=${t.pauseBeforeSecs.toFixed(1)}s`,
            `words=${String(t.wordCount)}`,
            t.wasInterrupted ? "INTERRUPTED" : "",
          ]
            .filter(Boolean)
            .join(", ");
          return `[${t.role.toUpperCase()}] (${meta}): ${t.content}`;
        })
        .join("\n")
    : conversationHistory
        .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join("\n");

  const emotionsSection = voiceMetrics.emotions
    ? voiceMetrics.emotions
        .map(
          (e) =>
            `Turn ${String(e.turnIndex)}: ${e.emotionLabel} (conf=${e.confidence.toFixed(2)}, pitch_mean=${e.pitchMean.toFixed(0)}Hz, pitch_std=${e.pitchStd.toFixed(1)}, energy=${e.energyMean.toFixed(2)}, rate=${e.speakingRate.toFixed(1)}wpm)`,
        )
        .join("\n")
    : "(no emotion data)";

  const summarySection = voiceMetrics.sessionSummary
    ? [
        `Total user speech: ${voiceMetrics.sessionSummary.totalUserSpeechSecs.toFixed(1)}s`,
        `Total silence: ${voiceMetrics.sessionSummary.totalSilenceSecs.toFixed(1)}s`,
        `Speech-to-silence ratio: ${voiceMetrics.sessionSummary.speechToSilenceRatio.toFixed(2)}`,
        `Interruptions: ${String(voiceMetrics.sessionSummary.interruptionCount)}`,
        `Avg user turn length: ${voiceMetrics.sessionSummary.avgUserTurnLengthWords.toFixed(1)} words`,
        `Engagement trajectory (word counts): [${voiceMetrics.sessionSummary.engagementTrajectory.join(", ")}]`,
        `Emotion arc: ${voiceMetrics.sessionSummary.emotionArc.map(([_ts, label, conf]) => `${label}@${conf.toFixed(2)}`).join(" -> ")}`,
      ].join("\n")
    : "(no session summary data)";

  return `You are a clinical voice analysis system for a wellness companion app. Analyze this voice session transcript along with prosody, emotion, and timing data.

---TRANSCRIPT WITH TIMING---
${transcriptSection}
---END TRANSCRIPT---

---PER-TURN EMOTION AND PROSODY---
${emotionsSection}
---END EMOTION DATA---

---SESSION SUMMARY METRICS---
${summarySection}
---END METRICS---

Produce a JSON analysis with this exact structure:
{
  "observations": ["list of voice-specific observations — energy drops, pace changes, pitch patterns, silence patterns, speaking rate shifts"],
  "contradictions": ["cross-signal contradictions — where text content contradicts voice prosody or emotion, e.g. 'said I'm fine but voice showed distress'"],
  "engagementAssessment": "overall engagement narrative — did the user open up or withdraw? How did engagement change over the session?",
  "therapyPlanRecommendations": ["specific recommendations for therapy plan updates based on voice signals — topics to revisit, emotional patterns to track, approaches that seemed effective"],
  "emotionArcNarrative": "narrative description of the emotional journey through the session based on the emotion arc data"
}

Rules:
- Return ONLY valid JSON, no preamble, no code fences
- observations: 3-7 specific, evidence-based observations referencing turn numbers
- contradictions: 0-5 items, only include genuine text-vs-voice mismatches
- engagementAssessment: 2-4 sentences
- therapyPlanRecommendations: 2-5 actionable items
- emotionArcNarrative: 2-4 sentences describing the emotional trajectory
- Be specific: reference turn numbers, metrics, and exact observations
- Never diagnose, use clinical labels, or claim to be a therapist`;
}

// ── Parse Response ──────────────────────────────────────────────

function parseVoiceAnalysis(raw: string): VoiceAnalysisResult | null {
  try {
    let jsonStr = raw.trim();
    const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeFenceMatch?.[1]) {
      jsonStr = codeFenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Validate required fields with defensive defaults
    const observations = Array.isArray(parsed.observations)
      ? (parsed.observations as unknown[]).filter((o): o is string => typeof o === "string")
      : [];
    const contradictions = Array.isArray(parsed.contradictions)
      ? (parsed.contradictions as unknown[]).filter((c): c is string => typeof c === "string")
      : [];
    const engagementAssessment =
      typeof parsed.engagementAssessment === "string"
        ? parsed.engagementAssessment
        : "";
    const therapyPlanRecommendations = Array.isArray(
      parsed.therapyPlanRecommendations,
    )
      ? (parsed.therapyPlanRecommendations as unknown[]).filter(
          (r): r is string => typeof r === "string",
        )
      : [];
    const emotionArcNarrative =
      typeof parsed.emotionArcNarrative === "string"
        ? parsed.emotionArcNarrative
        : "";

    if (observations.length === 0 && engagementAssessment === "") {
      console.warn("[voice-post-session] Parsed analysis has no useful content");
      return null;
    }

    return {
      observations,
      contradictions,
      engagementAssessment,
      therapyPlanRecommendations,
      emotionArcNarrative,
    };
  } catch (err) {
    console.error(
      "[voice-post-session] Failed to parse voice analysis JSON:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ── Hook Registration ───────────────────────────────────────────

export function registerVoicePostSessionHook(): void {
  registerOnEnd(
    "voice-post-session-analysis",
    async (ctx: OnEndContext) => {
      // 1. Check if this session has voiceMetrics (voice session indicator)
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, ctx.sessionId),
        columns: { voiceMetrics: true },
      });

      if (!session?.voiceMetrics) return; // text session, skip

      console.log(
        `[voice-post-session] Starting Opus analysis for session ${ctx.sessionId}`,
      );

      // 2. Build voice-specific analysis prompt
      const metrics = session.voiceMetrics as VoiceMetricsPayload;
      const analysisPrompt = buildVoiceAnalysisPrompt(
        ctx.conversationHistory,
        metrics,
      );

      // 3. Spawn Claude Opus for deep analysis
      const raw = await spawnCliForJson({
        cli: "claude",
        model: env.CLAUDE_OPUS_MODEL,
        prompt: analysisPrompt,
        timeoutMs: 180_000, // 3 minutes — Opus is slower
        label: "voice-post-session",
      });

      if (!raw) {
        console.warn(
          `[voice-post-session] Opus returned null for session ${ctx.sessionId} — skipping`,
        );
        return;
      }

      // 4. Parse structured output
      const analysis = parseVoiceAnalysis(raw);
      if (!analysis) {
        console.warn(
          `[voice-post-session] Could not parse analysis for session ${ctx.sessionId} — skipping`,
        );
        return;
      }

      // 5. Set ctx.voiceAnalysis for downstream hooks
      ctx.voiceAnalysis = analysis;

      console.log(
        `[voice-post-session] Opus analysis complete for session ${ctx.sessionId}: ${String(analysis.observations.length)} observations, ${String(analysis.contradictions.length)} contradictions`,
      );
    },
    "background",
  );
}
