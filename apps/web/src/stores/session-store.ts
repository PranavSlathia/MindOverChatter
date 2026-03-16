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

export interface ActiveAssessment {
  assessmentType: string;
  /** Parent assessment ID for screener chaining (set after first submission). */
  parentAssessmentId?: string;
}

export interface AssessmentResult {
  assessmentId: string;
  /** Human-readable severity string (e.g. "Moderate Depression"), NOT the raw enum value. Comes from SEVERITY_DESCRIPTIONS map on the server. */
  severity: string;
  nextScreener: string | null;
}

interface SessionState {
  sessionId: string | null;
  status: "idle" | "active" | "completed" | "crisis_escalated";
  messages: Message[];
  isConnected: boolean;
  isThinking: boolean;
  isStreaming: boolean;
  /** True while the server is running critical end-of-session hooks (summary generation). */
  isEnding: boolean;
  streamingContent: string;
  isCrisis: boolean;
  crisisResponse: CrisisResponse | null;
  // Assessment state
  activeAssessment: ActiveAssessment | null;
  assessmentResult: AssessmentResult | null;

  setSessionId: (id: string | null) => void;
  setStatus: (status: SessionState["status"]) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  updateMessage: (id: string, content: string) => void;
  setConnected: (connected: boolean) => void;
  setThinking: (thinking: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setEnding: (ending: boolean) => void;
  appendStreamingContent: (chunk: string) => void;
  clearStreamingContent: () => void;
  setCrisis: (response: CrisisResponse) => void;
  clearCrisis: () => void;
  startAssessment: (assessment: ActiveAssessment) => void;
  completeAssessment: (result: AssessmentResult) => void;
  dismissAssessment: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: "idle",
  messages: [],
  isConnected: false,
  isThinking: false,
  isStreaming: false,
  isEnding: false,
  streamingContent: "",
  isCrisis: false,
  crisisResponse: null,
  activeAssessment: null,
  assessmentResult: null,

  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (status) => set({ status }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, content } : m)),
    })),
  setConnected: (connected) => set({ isConnected: connected }),
  setThinking: (thinking) => set({ isThinking: thinking }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setEnding: (ending) => set({ isEnding: ending }),
  appendStreamingContent: (chunk) =>
    set((state) => ({ streamingContent: state.streamingContent + chunk })),
  clearStreamingContent: () => set({ streamingContent: "" }),
  setCrisis: (response) =>
    set({ isCrisis: true, crisisResponse: response, status: "crisis_escalated" }),
  clearCrisis: () => set({ isCrisis: false, crisisResponse: null }),
  startAssessment: (assessment) => set({ activeAssessment: assessment, assessmentResult: null }),
  completeAssessment: (result) => set({ assessmentResult: result }),
  dismissAssessment: () => set({ activeAssessment: null, assessmentResult: null }),
  reset: () =>
    set({
      sessionId: null,
      status: "idle",
      messages: [],
      isConnected: false,
      isThinking: false,
      isStreaming: false,
      isEnding: false,
      streamingContent: "",
      isCrisis: false,
      crisisResponse: null,
      activeAssessment: null,
      assessmentResult: null,
    }),
}));
