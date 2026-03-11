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

// ── Legacy WebSocket Types (DEPRECATED) ────────────────────────
// TODO: Remove once Pixel migrates frontend from WebSocket to REST+SSE

/** @deprecated Use REST+SSE instead of WebSocket JSON-RPC */
export type ClientMethod =
  | "session.start"
  | "session.end"
  | "message.send"
  | "emotion.face_update"
  | "assessment.submit"
  | "mood.log"
  | "memory.query"
  | "session.history";

/** @deprecated Use SSEEventType instead */
export type ServerMethod =
  | "ai.chunk"
  | "ai.thinking"
  | "ai.response_complete"
  | "ai.audio_ready"
  | "session.started"
  | "session.ended"
  | "session.crisis"
  | "emotion.ai_detected"
  | "assessment.due"
  | "error";

/** @deprecated Use REST requests instead of JSON-RPC */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

/** @deprecated Use REST responses instead of JSON-RPC */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** @deprecated Use SSE notifications instead of JSON-RPC */
export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
}
