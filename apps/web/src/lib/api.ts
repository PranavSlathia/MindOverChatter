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
};
