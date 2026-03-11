import { create } from "zustand";

export interface EmotionScores {
  happy: number;
  sad: number;
  angry: number;
  fearful: number;
  disgusted: number;
  surprised: number;
  neutral: number;
}

interface EmotionState {
  isDetectionActive: boolean;
  dominantEmotion: string | null;
  rawScores: EmotionScores | null;
  lastDetectedAt: string | null;

  setActive: (active: boolean) => void;
  setEmotion: (label: string, scores: EmotionScores) => void;
  reset: () => void;
}

export const useEmotionStore = create<EmotionState>((set) => ({
  isDetectionActive: false,
  dominantEmotion: null,
  rawScores: null,
  lastDetectedAt: null,

  setActive: (active) => set({ isDetectionActive: active }),
  setEmotion: (label, scores) =>
    set({ dominantEmotion: label, rawScores: scores, lastDetectedAt: new Date().toISOString() }),
  reset: () =>
    set({ isDetectionActive: false, dominantEmotion: null, rawScores: null, lastDetectedAt: null }),
}));
