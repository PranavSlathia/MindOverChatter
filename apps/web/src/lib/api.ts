import type { AppType } from "@moc/server/routes/index.js";
import type { InferRequestType, InferResponseType } from "hono/client";
import { hc } from "hono/client";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ── Hono RPC Client ────────────────────────────────────────────────
// Type-safe client inferred from server route definitions.
// No manually-maintained interfaces — types flow from Drizzle -> Zod -> Hono -> here.
const client = hc<AppType>(API_BASE);

// ── Error Handling ─────────────────────────────────────────────────

/**
 * Throw if the response is not ok (non-2xx).
 * After this guard, the caller can safely assume the response is a success variant.
 */
async function throwIfError(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
}

/** Handle raw fetch response and parse JSON. */
async function handleResponse<T>(response: Response): Promise<T> {
  await throwIfError(response);
  return response.json() as Promise<T>;
}

// ── Inferred Response Types ────────────────────────────────────────
// Exported for consumers that need to reference response shapes in
// component state (e.g., `useState<SessionSummary[]>`).

type GetSessionsSuccess = InferResponseType<typeof client.api.sessions.$get, 200>;
export type SessionSummary = GetSessionsSuccess["sessions"][number];

type GetSessionMessagesSuccess = InferResponseType<
  (typeof client.api.sessions)[":id"]["messages"]["$get"],
  200
>;
export type SessionMessage = GetSessionMessagesSuccess["messages"][number];

// UserProfile: the server returns jsonb fields (coreTraits, patterns, goals)
// which Hono infers as JSONValue. We refine these to string[] since the Zod
// validators guarantee the shape. This avoids casting in every consumer.
type RawUserProfile = InferResponseType<typeof client.api.user.$get, 200>;
export type UserProfile = Omit<RawUserProfile, "coreTraits" | "patterns" | "goals"> & {
  coreTraits: string[] | null;
  patterns: string[] | null;
  goals: string[] | null;
};

export type MoodLogEntry = InferResponseType<
  (typeof client.api)["mood-logs"]["$get"],
  200
>["entries"][number];

export type HomeSummary = GetHomeSummarySuccess;

export interface ServiceStatus {
  available: boolean;
}

export interface ServiceHealthResponse {
  whisper: ServiceStatus;
  tts: ServiceStatus;
  emotion: ServiceStatus;
  memory: ServiceStatus;
  voice: ServiceStatus;
}

export type ServiceHealth = ServiceHealthResponse;

// ── CLI Status Types ─────────────────────────────────────────────

export interface CliToolStatus {
  installed: boolean;
  loggedIn: boolean;
  email?: string;
  model?: string;
}

export interface CliStatusResponse {
  claude: CliToolStatus;
  gemini: CliToolStatus;
  codex: CliToolStatus;
}

// ── Inferred Request Types ─────────────────────────────────────────
// Derived from the hc client so parameter types stay in sync with the
// server's Zod validators. No manual duplication.

type SubmitAssessmentInput = InferRequestType<typeof client.api.assessments.$post>["json"];
type SubmitEmotionInput = InferRequestType<typeof client.api.emotions.$post>["json"];
type CreateMoodLogInput = InferRequestType<(typeof client.api)["mood-logs"]["$post"]>["json"];

// ── Success Response Types (for union-returning routes) ────────────
// Routes that return different shapes for different status codes produce
// union types from hc. These narrow to the success variant only.

type CreateSessionSuccess = InferResponseType<typeof client.api.sessions.$post, 201>;
type SendMessageSuccess = InferResponseType<
  (typeof client.api.sessions)[":id"]["messages"]["$post"],
  200
>;
type EndSessionSuccess = InferResponseType<
  (typeof client.api.sessions)[":id"]["end"]["$post"],
  200
>;
type SubmitAssessmentSuccess = InferResponseType<typeof client.api.assessments.$post, 201>;
type SubmitCBTSuccess = InferResponseType<typeof client.api.assessments.cbt.$post, 201>;
type SubmitEmotionSuccess = InferResponseType<typeof client.api.emotions.$post, 201>;
type CreateMoodLogSuccess = InferResponseType<(typeof client.api)["mood-logs"]["$post"], 201>;
type DeleteSessionSuccess = InferResponseType<(typeof client.api.sessions)[":id"]["$delete"], 200>;
type ResumeSessionSuccess = InferResponseType<
  (typeof client.api.sessions)[":id"]["resume"]["$post"],
  200
>;
type GetJourneyTimelineSuccess = InferResponseType<typeof client.api.journey.timeline.$get, 200>;
type GetJourneyInsightsSuccess = InferResponseType<typeof client.api.journey.insights.$get, 200>;
type GetJourneyAssessmentsSuccess = InferResponseType<
  typeof client.api.journey.assessments.$get,
  200
>;
type GetTherapyPlanGoalsSuccess = InferResponseType<
  (typeof client.api.journey)["therapy-plan"]["$get"],
  200
>;
type GetHomeSummarySuccess = InferResponseType<typeof client.api.home.summary.$get, 200>;
type GetAssessmentLibrarySuccess = InferResponseType<
  typeof client.api.assessments.library.$get,
  200
>;
type GetAssessmentHistorySuccess = InferResponseType<
  (typeof client.api.assessments.history)[":type"]["$get"],
  200
>;

// ── Observability Types ────────────────────────────────────────────
type GetObservabilityStatsSuccess = InferResponseType<
  typeof client.api.observability.stats.$get,
  200
>;
type GetObservabilityTurnsSuccess = InferResponseType<
  typeof client.api.observability.turns.$get,
  200
>;
type GetObservabilityAlertsSuccess = InferResponseType<
  typeof client.api.observability.alerts.$get,
  200
>;

export type ObservabilityStats = GetObservabilityStatsSuccess;
export type ObservabilityTurn = GetObservabilityTurnsSuccess["turns"][number];
export type ObservabilityAlert = GetObservabilityAlertsSuccess["alerts"][number];

export interface VoiceStartResponse {
  url: string;
  token: string;
  sessionId: string;
  voiceSessionId: string;
}

export interface VoiceStopResponse {
  status: string;
  voiceSessionId: string;
}

// ── Transcribe Response (raw fetch — FormData upload) ──────────────

export interface TranscribeResponse {
  text: string;
  language: string;
  duration: number;
}

// ── API Object ─────────────────────────────────────────────────────

export const api = {
  createSession: async (): Promise<CreateSessionSuccess> => {
    const res = await client.api.sessions.$post();
    await throwIfError(res);
    return (await res.json()) as CreateSessionSuccess;
  },

  sendMessage: async (sessionId: string, text: string): Promise<SendMessageSuccess> => {
    const res = await client.api.sessions[":id"].messages.$post({
      param: { id: sessionId },
      json: { text },
    });
    await throwIfError(res);
    return (await res.json()) as SendMessageSuccess;
  },

  endSession: async (sessionId: string, reason?: string): Promise<EndSessionSuccess> => {
    const res = await client.api.sessions[":id"].end.$post({
      param: { id: sessionId },
      json: { reason },
    });
    await throwIfError(res);
    return (await res.json()) as EndSessionSuccess;
  },

  /** SSE subscription — cannot use hc (EventSource, not JSON). */
  subscribeToEvents: (sessionId: string): EventSource =>
    new EventSource(`${API_BASE}/api/sessions/${sessionId}/events`),

  submitAssessment: async (body: SubmitAssessmentInput): Promise<SubmitAssessmentSuccess> => {
    const res = await client.api.assessments.$post({ json: body });
    await throwIfError(res);
    return (await res.json()) as SubmitAssessmentSuccess;
  },

  submitCBT: async (body: { sessionId: string; answers: string[] }): Promise<SubmitCBTSuccess> => {
    const res = await client.api.assessments.cbt.$post({ json: body });
    await throwIfError(res);
    return (await res.json()) as SubmitCBTSuccess;
  },

  submitEmotion: async (body: SubmitEmotionInput): Promise<SubmitEmotionSuccess> => {
    const res = await client.api.emotions.$post({ json: body });
    await throwIfError(res);
    return (await res.json()) as SubmitEmotionSuccess;
  },

  createMoodLog: async (body: CreateMoodLogInput): Promise<CreateMoodLogSuccess> => {
    const res = await client.api["mood-logs"].$post({ json: body });
    await throwIfError(res);
    return (await res.json()) as CreateMoodLogSuccess;
  },

  getMoodLogs: async () => {
    const res = await client.api["mood-logs"].$get();
    await throwIfError(res);
    return await res.json();
  },

  getSessions: async (limit = 20, offset = 0) => {
    const res = await client.api.sessions.$get({
      query: { limit: String(limit), offset: String(offset) },
    });
    await throwIfError(res);
    return await res.json();
  },

  getSessionMessages: async (sessionId: string): Promise<GetSessionMessagesSuccess> => {
    const res = await client.api.sessions[":id"].messages.$get({
      param: { id: sessionId },
    });
    await throwIfError(res);
    return (await res.json()) as GetSessionMessagesSuccess;
  },

  /** Send audio blob to whisper service for transcription. Uses multipart/form-data — cannot use hc. */
  transcribe: async (audioBlob: Blob): Promise<TranscribeResponse> => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");
    const response = await fetch(`${API_BASE}/api/transcribe`, {
      method: "POST",
      body: formData,
    });
    return handleResponse<TranscribeResponse>(response);
  },

  /** Send text to TTS service and return audio blob for playback — cannot use hc (Blob response). */
  synthesize: async (text: string, voice?: string): Promise<Blob> => {
    const response = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
    }
    return response.blob();
  },

  deleteSession: async (sessionId: string): Promise<DeleteSessionSuccess> => {
    const res = await client.api.sessions[":id"].$delete({
      param: { id: sessionId },
    });
    await throwIfError(res);
    return (await res.json()) as DeleteSessionSuccess;
  },

  resumeSession: async (sessionId: string): Promise<ResumeSessionSuccess> => {
    const res = await client.api.sessions[":id"].resume.$post({
      param: { id: sessionId },
    });
    await throwIfError(res);
    return (await res.json()) as ResumeSessionSuccess;
  },

  getUserProfile: async (): Promise<UserProfile> => {
    const res = await client.api.user.$get();
    await throwIfError(res);
    // Cast jsonb fields from JSONValue to string[] — safe because the server
    // route always returns arrays (Zod-validated on write, explicit map on read).
    return (await res.json()) as UserProfile;
  },

  updateUserProfile: async (body: {
    displayName?: string | null;
    coreTraits?: string[];
    patterns?: string[];
    goals?: string[];
  }): Promise<UserProfile> => {
    const res = await client.api.user.$patch({ json: body });
    await throwIfError(res);
    return (await res.json()) as UserProfile;
  },

  getJourneyTimeline: async (limit = 50, offset = 0): Promise<GetJourneyTimelineSuccess> => {
    const res = await client.api.journey.timeline.$get({
      query: { limit: String(limit), offset: String(offset) },
    });
    await throwIfError(res);
    return (await res.json()) as GetJourneyTimelineSuccess;
  },

  getJourneyInsights: async (): Promise<GetJourneyInsightsSuccess> => {
    const res = await client.api.journey.insights.$get();
    await throwIfError(res);
    return (await res.json()) as GetJourneyInsightsSuccess;
  },

  getJourneyAssessments: async (limit = 20, offset = 0): Promise<GetJourneyAssessmentsSuccess> => {
    const res = await client.api.journey.assessments.$get({
      query: { limit: String(limit), offset: String(offset) },
    });
    await throwIfError(res);
    return (await res.json()) as GetJourneyAssessmentsSuccess;
  },

  getHomeSummary: async (): Promise<GetHomeSummarySuccess> => {
    const res = await client.api.home.summary.$get();
    await throwIfError(res);
    return (await res.json()) as GetHomeSummarySuccess;
  },

  getServiceHealth: async (): Promise<ServiceHealthResponse> => {
    const res = await client.api.home.health.services.$get();
    await throwIfError(res);
    return (await res.json()) as ServiceHealthResponse;
  },

  /** Fetch CLI tool auth status (Claude, Gemini, Codex). Uses plain fetch — not typed by Hono RPC. */
  getCliStatus: async (): Promise<CliStatusResponse> => {
    const response = await fetch(`${API_BASE}/api/settings/cli-status`);
    return handleResponse<CliStatusResponse>(response);
  },

  stopVoice: async (
    voiceSessionId: string,
    options?: { keepalive?: boolean },
  ): Promise<VoiceStopResponse> => {
    const response = await fetch(`${API_BASE}/api/voice/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceSessionId }),
      keepalive: options?.keepalive ?? false,
    });
    return handleResponse<VoiceStopResponse>(response);
  },

  getAssessmentLibrary: async (): Promise<GetAssessmentLibrarySuccess> => {
    const res = await client.api.assessments.library.$get();
    await throwIfError(res);
    return (await res.json()) as GetAssessmentLibrarySuccess;
  },

  getAssessmentHistory: async (type: string): Promise<GetAssessmentHistorySuccess> => {
    const res = await client.api.assessments.history[":type"].$get({
      param: { type },
    });
    await throwIfError(res);
    return (await res.json()) as GetAssessmentHistorySuccess;
  },

  getTherapyPlanGoals: async (): Promise<GetTherapyPlanGoalsSuccess> => {
    const res = await client.api.journey["therapy-plan"].$get();
    await throwIfError(res);
    return (await res.json()) as GetTherapyPlanGoalsSuccess;
  },

  // ── Observability ──────────────────────────────────────────────────

  getObservabilityStats: async (params?: {
    sessionId?: string;
    from?: string;
    to?: string;
  }): Promise<GetObservabilityStatsSuccess> => {
    const query: Record<string, string> = {};
    if (params?.sessionId) query.sessionId = params.sessionId;
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;
    const res = await client.api.observability.stats.$get({ query });
    await throwIfError(res);
    return (await res.json()) as GetObservabilityStatsSuccess;
  },

  getObservabilityTurns: async (params?: {
    sessionId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<GetObservabilityTurnsSuccess> => {
    const query: Record<string, string> = {};
    if (params?.sessionId) query.sessionId = params.sessionId;
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;
    if (params?.limit != null) query.limit = String(params.limit);
    if (params?.offset != null) query.offset = String(params.offset);
    const res = await client.api.observability.turns.$get({ query });
    await throwIfError(res);
    return (await res.json()) as GetObservabilityTurnsSuccess;
  },

  getObservabilityAlerts: async (params?: {
    type?: "depth" | "unsafe" | "all";
    limit?: number;
    offset?: number;
  }): Promise<GetObservabilityAlertsSuccess> => {
    const query: Record<string, string> = {};
    if (params?.type) query.type = params.type;
    if (params?.limit != null) query.limit = String(params.limit);
    if (params?.offset != null) query.offset = String(params.offset);
    const res = await client.api.observability.alerts.$get({ query });
    await throwIfError(res);
    return (await res.json()) as GetObservabilityAlertsSuccess;
  },
};
