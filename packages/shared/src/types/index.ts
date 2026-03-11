// ── Emotion Types ──────────────────────────────────────────────

export type EmotionLabel =
  | "happy"
  | "sad"
  | "angry"
  | "neutral"
  | "fearful"
  | "disgusted"
  | "surprised";

export type FacialEmotion = Record<EmotionLabel, number>;

export interface VoiceEmotion {
  label: EmotionLabel;
  confidence: number;
}

export interface ProsodyFeatures {
  pitch_mean: number;
  pitch_std: number;
  energy_mean: number;
  energy_std: number;
  speaking_rate: number;
  mfcc_summary?: number[];
}

// ── Session Types ──────────────────────────────────────────────

// SessionStatus is exported from validators/session.ts (Zod-inferred)

export type CrisisLevel = "safe" | "elevated_risk" | "crisis";

// ── SSE Event Types ──────────────────────────────────────────

/** Server -> Client SSE event types */
export type SSEEventType =
  | "ai.chunk"
  | "ai.thinking"
  | "ai.response_complete"
  | "ai.tool_use"
  | "ai.audio_ready"
  | "ai.error"
  | "session.started"
  | "session.ended"
  | "session.crisis"
  | "emotion.ai_detected"
  | "assessment.due";

// ── Summary Types ──────────────────────────────────────────────

export type SummaryLevel = "turn" | "session" | "weekly" | "monthly" | "profile";

