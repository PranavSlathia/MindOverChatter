import { create } from "zustand";

export interface TimelineSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  themes: string[] | null;
}

export interface TimelineMemory {
  id: string;
  content: string;
  memoryType: string;
  confidence: number;
  createdAt: string;
}

export interface TimelineAssessment {
  id: string;
  type: string;
  totalScore: number;
  severity: string;
  createdAt: string;
}

export interface TimelineMood {
  id: string;
  valence: number;
  arousal: number;
  createdAt: string;
}

export type TimelineItem =
  | { type: "session"; data: TimelineSession }
  | { type: "memory"; data: TimelineMemory }
  | { type: "assessment"; data: TimelineAssessment }
  | { type: "mood"; data: TimelineMood };

export interface JourneyInsights {
  clinicalUnderstanding: string;
  userReflection: string;
  actionItems: string[];
  patterns: {
    recurring_triggers: Array<{ id: string; content: string }>;
    unresolved_threads: Array<{ id: string; content: string }>;
    wins: Array<{ id: string; content: string }>;
  };
  moodTrend: {
    direction: "improving" | "stable" | "declining";
    period: string;
  };
  cachedAt?: string;
}

interface JourneyState {
  timeline: TimelineItem[];
  insights: JourneyInsights | null;
  isLoadingTimeline: boolean;
  isLoadingInsights: boolean;
  error: string | null;

  setTimeline: (items: TimelineItem[]) => void;
  setInsights: (insights: JourneyInsights) => void;
  setLoadingTimeline: (loading: boolean) => void;
  setLoadingInsights: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useJourneyStore = create<JourneyState>((set) => ({
  timeline: [],
  insights: null,
  isLoadingTimeline: false,
  isLoadingInsights: false,
  error: null,

  setTimeline: (items) => set({ timeline: items }),
  setInsights: (insights) => set({ insights }),
  setLoadingTimeline: (loading) => set({ isLoadingTimeline: loading }),
  setLoadingInsights: (loading) => set({ isLoadingInsights: loading }),
  setError: (error) => set({ error }),
}));
