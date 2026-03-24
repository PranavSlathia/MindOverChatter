// ── Turn Event Collector ─────────────────────────────────────────
// Builder pattern that accumulates pipeline telemetry throughout
// a single message turn. `persist()` writes to the `turn_events`
// table fire-and-forget — it NEVER blocks the message pipeline,
// NEVER throws, and silently logs failures.

import { db } from "../db/index.js";
import { turnEvents } from "../db/schema/index";
import type { NewTurnEvent } from "../db/schema/index";
import type { CrisisResult } from "../crisis/types.js";
import type { SupervisorOutput } from "./session-supervisor.js";
import type { ValidationResult } from "./response-validator.js";
import type { ReviewerResult } from "./multi-validator.js";
import type { TextEmotionResult } from "./text-emotion-classifier.js";

// ── Public Interface ────────────────────────────────────────────

export interface TurnEventBuilder {
  setCrisisResult(result: CrisisResult): void;
  setModeShift(before: string | null, after: string | null, source: "regex" | "supervisor" | "none"): void;
  setSupervisorResult(output: SupervisorOutput | null, latencyMs: number): void;
  setValidatorResult(result: ValidationResult | null, latencyMs: number): void;
  setReviewerResults(results: ReviewerResult[]): void;
  setActiveSkills(skills: string[]): void;
  setMemoryContext(memoriesCount: number, liveNotesCount: number): void;
  setAssessmentMarkers(markers: string[]): void;
  setTextEmotion(result: TextEmotionResult | null): void;
  setClaudeLatency(ms: number): void;
  setMessageIds(userMessageId: string, assistantMessageId?: string): void;
  setTurnNumber(n: number): void;
  setTotalPipeline(ms: number): void;
  persist(): void;
}

// ── Factory ─────────────────────────────────────────────────────

export function createTurnEventCollector(sessionId: string): TurnEventBuilder {
  const data: Partial<NewTurnEvent> = {
    sessionId,
  };

  return {
    setCrisisResult(result: CrisisResult) {
      data.crisisDetected = result.isCrisis;
      data.crisisSeverity = result.severity;
      data.crisisStages = result.stages;
      data.crisisMatchedPhrases = result.matchedPhrases.length > 0
        ? result.matchedPhrases
        : null;
    },

    setModeShift(before, after, source) {
      data.modeBefore = before;
      data.modeAfter = after ?? before;
      data.modeShiftSource = source;
    },

    setSupervisorResult(output, latencyMs) {
      data.supervisorRan = true;
      data.supervisorLatencyMs = latencyMs;
      if (output) {
        data.supervisorConfidence = output.confidence;
        data.supervisorDepth = output.probingDepth;
        data.supervisorSkills = output.activateSkills.length > 0
          ? output.activateSkills
          : null;
        data.supervisorFocus = output.contextFocus || null;
        data.depthAlertFired = (output.contextFocus ?? "").startsWith("DEPTH ALERT:");
      }
    },

    setValidatorResult(result, latencyMs) {
      data.validatorRan = true;
      data.validatorLatencyMs = latencyMs;
      if (result) {
        data.validatorScore = result.score;
        data.validatorSafe = result.safe;
        data.validatorIssues = result.issues.length > 0 ? result.issues : null;
      }
    },

    setReviewerResults(results) {
      data.reviewerResults = results.length > 0 ? results : null;
      // Populate the legacy validator fields from the first successful reviewer
      // (Gemini is now the primary reviewer; the old "primary" Haiku path was removed).
      const primaryResult = results.find((r) => !r.failed);
      if (primaryResult) {
        data.validatorRan = true;
        data.validatorScore = primaryResult.score;
        data.validatorSafe = primaryResult.issues.every(
          (i) => i.severity !== "high",
        );
        data.validatorIssues = primaryResult.issues.length > 0
          ? primaryResult.issues
          : null;
        data.validatorLatencyMs = primaryResult.latencyMs;
      }
    },

    setActiveSkills(skills) {
      data.activeSkills = skills.length > 0 ? skills : null;
    },

    setMemoryContext(memoriesCount, liveNotesCount) {
      data.memoriesInjectedCount = memoriesCount;
      data.memoryNotesInjected = liveNotesCount;
    },

    setAssessmentMarkers(markers) {
      data.assessmentMarkers = markers.length > 0 ? markers : null;
    },

    setTextEmotion(result) {
      if (result) {
        data.textEmotionLabel = result.emotion;
        data.textEmotionConfidence = result.confidence;
      }
    },

    setClaudeLatency(ms) {
      data.claudeResponseMs = ms;
    },

    setMessageIds(userMessageId, assistantMessageId) {
      data.userMessageId = userMessageId;
      data.assistantMessageId = assistantMessageId ?? null;
    },

    setTurnNumber(n) {
      data.turnNumber = n;
    },

    setTotalPipeline(ms) {
      data.totalPipelineMs = ms;
    },

    persist() {
      // Fire-and-forget — never awaited, never throws
      db.insert(turnEvents)
        .values(data as NewTurnEvent)
        .then(() => {
          console.log(
            `[turn-event] persisted session=${sessionId} turn=${data.turnNumber ?? "?"}`,
          );
        })
        .catch((err: unknown) => {
          console.warn(
            "[turn-event] failed to persist:",
            err instanceof Error ? err.message : err,
          );
        });
    },
  };
}
