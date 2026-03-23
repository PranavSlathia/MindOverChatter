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
  voice: ServiceStatus;
  lastCheckedAt: string | null;
  isChecking: boolean;

  checkHealth: () => Promise<void>;
}

const DEFAULT_UNAVAILABLE: ServiceStatus = { available: false };

export const useServiceHealthStore = create<ServiceHealthState>((set, get) => ({
  whisper: DEFAULT_UNAVAILABLE,
  tts: DEFAULT_UNAVAILABLE,
  emotion: DEFAULT_UNAVAILABLE,
  memory: DEFAULT_UNAVAILABLE,
  voice: DEFAULT_UNAVAILABLE,
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
        voice: result.voice,
        lastCheckedAt: new Date().toISOString(),
        isChecking: false,
      });
    } catch {
      // Health endpoint unreachable — mark all services as unavailable
      set({
        whisper: DEFAULT_UNAVAILABLE,
        tts: DEFAULT_UNAVAILABLE,
        emotion: DEFAULT_UNAVAILABLE,
        memory: DEFAULT_UNAVAILABLE,
        voice: DEFAULT_UNAVAILABLE,
        isChecking: false,
      });
    }
  },
}));
