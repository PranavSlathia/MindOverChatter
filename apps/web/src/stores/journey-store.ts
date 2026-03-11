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

// Formulation types match the backend JourneyFormulation schema
export type DomainKey =
  | "connection"
  | "momentum"
  | "groundedness"
  | "meaning"
  | "self_regard"
  | "vitality";

export interface JourneyFormulation {
  formulation: {
    presentingTheme: string;
    roots: Array<{ content: string; sourceType: string; confidence: number; evidenceRefs?: Array<{ sourceType: string; sourceId?: string }> }>;
    recentActivators: Array<{ content: string; confidence: number; evidenceRefs?: Array<{ sourceType: string; sourceId?: string }> }>;
    perpetuatingCycles: Array<{ pattern: string; mechanism: string; evidenceRefs?: Array<{ sourceType: string; sourceId?: string }> }>;
    protectiveStrengths: Array<{ content: string; sourceType: string; evidenceRefs?: Array<{ sourceType: string; sourceId?: string }> }>;
  };
  userReflection: {
    summary: string;
    encouragement: string;
  };
  activeStates: Array<{
    label: string;
    confidence: number;
    signal: string;
    domain: DomainKey;
  }>;
  domainSignals: Partial<
    Record<
      DomainKey,
      {
        level: "low" | "medium" | "high";
        trend: "improving" | "stable" | "declining";
        evidence: string;
      }
    >
  >;
  questionsWorthExploring: Array<{
    question: string;
    rationale: string;
    linkedTo: string;
  }>;
  themeOfToday: string;
  dataConfidence: "sparse" | "emerging" | "established";
  moodTrend: {
    direction: "improving" | "stable" | "declining";
    period: string;
  };
  cachedAt?: string;
}

interface JourneyState {
  timeline: TimelineItem[];
  insights: JourneyFormulation | null;
  isLoadingTimeline: boolean;
  isLoadingInsights: boolean;
  error: string | null;

  setTimeline: (items: TimelineItem[]) => void;
  setInsights: (insights: JourneyFormulation) => void;
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
