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

export type SessionStatus = "active" | "completed" | "crisis_escalated";

export type CrisisLevel = "safe" | "elevated_risk" | "crisis";

// ── WebSocket JSON-RPC Method Types ───────────────────────────

/** Client → Server methods */
export type ClientMethod =
  | "session.start"
  | "session.end"
  | "message.send"
  | "emotion.face_update"
  | "assessment.submit"
  | "mood.log"
  | "memory.query"
  | "session.history";

/** Server → Client methods */
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

// ── JSON-RPC 2.0 Interfaces ──────────────────────────────────

/** Request (client → server) */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

/** Response (server → client) */
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

/** Notification (server → client, no ID = no response expected) */
export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
}
