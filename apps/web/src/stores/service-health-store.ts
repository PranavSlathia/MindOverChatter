import { create } from "zustand";
import { api } from "@/lib/api.js";

interface ServiceStatus {
  available: boolean;
}

interface ServiceHealthState {
  whisper: ServiceStatus;
  tts: ServiceStatus;
  emotion: ServiceStatus;
  memory: ServiceStatus;
  lastCheckedAt: string | null;
  isChecking: boolean;

  checkHealth: () => Promise<void>;
}

const DEFAULT_AVAILABLE: ServiceStatus = { available: true };

export const useServiceHealthStore = create<ServiceHealthState>((set, get) => ({
  whisper: DEFAULT_AVAILABLE,
  tts: DEFAULT_AVAILABLE,
  emotion: DEFAULT_AVAILABLE,
  memory: DEFAULT_AVAILABLE,
  lastCheckedAt: null,
  isChecking: false,

  checkHealth: async () => {
    if (get().isChecking) return;
    set({ isChecking: true });

    try {
      const result = await api.getServiceHealth();
      set({
        whisper: result.whisper,
        tts: result.tts,
        emotion: result.emotion,
        memory: result.memory,
        lastCheckedAt: new Date().toISOString(),
        isChecking: false,
      });
    } catch {
      // If health endpoint itself is unreachable, default to available
      // so we don't block the user unnecessarily
      set({ isChecking: false });
    }
  },
}));
