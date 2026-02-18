import { create } from "zustand";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface SessionState {
  sessionId: string | null;
  status: "idle" | "active" | "completed" | "crisis_escalated";
  messages: Message[];
  isConnected: boolean;
  setSessionId: (id: string | null) => void;
  setStatus: (status: SessionState["status"]) => void;
  addMessage: (message: Message) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: "idle",
  messages: [],
  isConnected: false,
  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (status) => set({ status }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setConnected: (connected) => set({ isConnected: connected }),
  reset: () => set({ sessionId: null, status: "idle", messages: [], isConnected: false }),
}));
