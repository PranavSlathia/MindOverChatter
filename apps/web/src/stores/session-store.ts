import { create } from "zustand";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface CrisisResponse {
  message: string;
  helplines: Array<{ name: string; number: string; country: string }>;
}

interface SessionState {
  sessionId: string | null;
  status: "idle" | "active" | "completed" | "crisis_escalated";
  messages: Message[];
  isConnected: boolean;
  isStreaming: boolean;
  streamingContent: string;
  isCrisis: boolean;
  crisisResponse: CrisisResponse | null;
  sessionSummary: string | null;

  setSessionId: (id: string | null) => void;
  setStatus: (status: SessionState["status"]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  setConnected: (connected: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamingContent: (chunk: string) => void;
  clearStreamingContent: () => void;
  setCrisis: (response: CrisisResponse) => void;
  clearCrisis: () => void;
  setSessionSummary: (summary: string | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: "idle",
  messages: [],
  isConnected: false,
  isStreaming: false,
  streamingContent: "",
  isCrisis: false,
  crisisResponse: null,
  sessionSummary: null,

  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (status) => set({ status }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, content } : m)),
    })),
  setConnected: (connected) => set({ isConnected: connected }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  appendStreamingContent: (chunk) =>
    set((state) => ({ streamingContent: state.streamingContent + chunk })),
  clearStreamingContent: () => set({ streamingContent: "" }),
  setCrisis: (response) =>
    set({ isCrisis: true, crisisResponse: response, status: "crisis_escalated" }),
  clearCrisis: () => set({ isCrisis: false, crisisResponse: null }),
  setSessionSummary: (summary) => set({ sessionSummary: summary }),
  reset: () =>
    set({
      sessionId: null,
      status: "idle",
      messages: [],
      isConnected: false,
      isStreaming: false,
      streamingContent: "",
      isCrisis: false,
      crisisResponse: null,
      sessionSummary: null,
    }),
}));
