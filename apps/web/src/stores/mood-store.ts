import { create } from "zustand";

export interface MoodEntry {
  id: string;
  valence: number;
  arousal: number;
  source: string;
  sessionId: string | null;
  createdAt: string;
}

interface MoodState {
  entries: MoodEntry[];
  isLoading: boolean;
  lastEntry: MoodEntry | null;

  addEntry: (entry: MoodEntry) => void;
  setEntries: (entries: MoodEntry[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useMoodStore = create<MoodState>((set) => ({
  entries: [],
  isLoading: false,
  lastEntry: null,

  addEntry: (entry) =>
    set((state) => ({
      entries: [...state.entries, entry],
      lastEntry: entry,
    })),
  setEntries: (entries) =>
    set({ entries, lastEntry: entries.length > 0 ? entries[entries.length - 1] : null }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
