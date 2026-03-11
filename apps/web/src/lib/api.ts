const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface CreateSessionResponse {
  sessionId: string;
  status: "active";
  startedAt: string;
}

export interface SendMessageResponse {
  userMessageId: string;
  crisis: boolean;
  assistantMessageId?: string;
  response?: string;
}

export interface EndSessionResponse {
  sessionId: string;
  status: "completed";
  endedAt: string;
}

export interface SubmitAssessmentResponse {
  assessmentId: string;
  totalScore: number;
  severity: string;
  nextScreener: string | null;
}

export interface SubmitEmotionBody {
  sessionId: string;
  channel: string;
  emotionLabel: string;
  confidence: number;
  signalWeight: number;
  rawScores?: Record<string, number>;
}

export interface SubmitEmotionResponse {
  id: string;
  createdAt: string;
}

export interface CreateMoodLogBody {
  sessionId?: string;
  valence: number;
  arousal: number;
  source: string;
}

export interface CreateMoodLogResponse {
  id: string;
  valence: number;
  arousal: number;
  source: string;
  createdAt: string;
}

export interface MoodLogEntry {
  id: string;
  valence: number;
  arousal: number;
  source: string;
  sessionId: string | null;
  createdAt: string;
}

export interface GetMoodLogsResponse {
  entries: MoodLogEntry[];
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  createSession: (): Promise<CreateSessionResponse> =>
    fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).then((r) => handleResponse<CreateSessionResponse>(r)),

  sendMessage: (sessionId: string, text: string): Promise<SendMessageResponse> =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => handleResponse<SendMessageResponse>(r)),

  endSession: (sessionId: string, reason?: string): Promise<EndSessionResponse> =>
    fetch(`${API_BASE}/api/sessions/${sessionId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).then((r) => handleResponse<EndSessionResponse>(r)),

  subscribeToEvents: (sessionId: string): EventSource =>
    new EventSource(`${API_BASE}/api/sessions/${sessionId}/events`),

  submitAssessment: (body: {
    sessionId: string;
    type: string;
    answers: number[];
    parentAssessmentId?: string;
  }): Promise<SubmitAssessmentResponse> =>
    fetch(`${API_BASE}/api/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handleResponse<SubmitAssessmentResponse>(r)),

  submitEmotion: (body: SubmitEmotionBody): Promise<SubmitEmotionResponse> =>
    fetch(`${API_BASE}/api/emotions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handleResponse<SubmitEmotionResponse>(r)),

  createMoodLog: (body: CreateMoodLogBody): Promise<CreateMoodLogResponse> =>
    fetch(`${API_BASE}/api/mood-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handleResponse<CreateMoodLogResponse>(r)),

  getMoodLogs: (): Promise<GetMoodLogsResponse> =>
    fetch(`${API_BASE}/api/mood-logs`).then((r) => handleResponse<GetMoodLogsResponse>(r)),
};
