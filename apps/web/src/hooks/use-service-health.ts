import { useEffect } from "react";
import { useServiceHealthStore } from "@/stores/service-health-store.js";

const POLL_INTERVAL_MS = 60_000; // Re-check every 60 seconds

/**
 * Hook that starts polling service health on mount and stops on unmount.
 * Call this once at the chat page level (or app level).
 * Individual components read from useServiceHealthStore directly.
 */
export function useServiceHealth() {
  const checkHealth = useServiceHealthStore((s) => s.checkHealth);

  useEffect(() => {
    // Fire initial check (non-blocking)
    checkHealth();

    const interval = setInterval(checkHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkHealth]);
}
