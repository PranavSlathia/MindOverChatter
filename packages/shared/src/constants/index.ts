// ── Emotion Constants ──────────────────────────────────────────

export const EMOTION_LABELS = [
  "happy",
  "sad",
  "angry",
  "neutral",
  "fearful",
  "disgusted",
  "surprised",
] as const;

/** Signal weight per channel — emotion signals are WEAK, prompt follow-ups */
export const SIGNAL_WEIGHTS = {
  text: 0.8,
  voice: 0.5,
  face: 0.3,
} as const;

// ── Memory Constants ──────────────────────────────────────────

export const MEMORY_TYPES = [
  "profile_fact",
  "relationship",
  "goal",
  "coping_strategy",
  "recurring_trigger",
  "life_event",
  "symptom_episode",
  "unresolved_thread",
  "safety_critical",
  "win",
  "session_summary",
] as const;

// ── Session Constants ──────────────────────────────────────────

export const SESSION_STATUSES = [
  "active",
  "completed",
  "crisis_escalated",
] as const;

/** Inactivity timeout before orphan cleanup (milliseconds) */
export const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Orphan sweep interval (milliseconds) */
export const ORPHAN_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── Helpline Constants (NON-NEGOTIABLE) ────────────────────────

export const HELPLINES = [
  { name: "988 Suicide & Crisis Lifeline", number: "988", country: "US" },
  { name: "iCall", number: "9152987821", country: "IN" },
  { name: "Vandrevala Foundation", number: "1860-2662-345", country: "IN" },
] as const;

// ── Error Codes ──────────────────────────────────────────────

export const ERROR_CODES = {
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_ENDED: "SESSION_ENDED",
  MESSAGE_EMPTY: "MESSAGE_EMPTY",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  CRISIS_DETECTED: "CRISIS_DETECTED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;
