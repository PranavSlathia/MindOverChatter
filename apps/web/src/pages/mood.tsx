import { useEffect } from "react";
import { MoodChart } from "@/components/mood/mood-chart.js";
import { MoodEntryWidget } from "@/components/mood/mood-entry-widget.js";
import { api } from "@/lib/api.js";
import { useMoodStore } from "@/stores/mood-store.js";

export function MoodPage() {
  const entries = useMoodStore((s) => s.entries);
  const isLoading = useMoodStore((s) => s.isLoading);
  const setEntries = useMoodStore((s) => s.setEntries);
  const setLoading = useMoodStore((s) => s.setLoading);

  // Fetch mood history on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchMoodLogs() {
      setLoading(true);
      try {
        const result = await api.getMoodLogs();
        if (!cancelled) {
          setEntries(result.entries);
        }
      } catch (err) {
        console.error("Failed to fetch mood logs:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMoodLogs();
    return () => {
      cancelled = true;
    };
  }, [setEntries, setLoading]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <MoodEntryWidget />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-foreground/50">Loading mood history...</p>
        </div>
      ) : (
        <MoodChart entries={entries} />
      )}
    </div>
  );
}
