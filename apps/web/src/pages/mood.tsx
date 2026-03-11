import { useEffect } from "react";
import { Link } from "react-router";
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-foreground/10 bg-background px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold leading-tight text-primary">Mood Tracker</h1>
          <p className="text-xs text-foreground/60">Track how you feel over time</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/history"
            className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label="Session history"
          >
            History
          </Link>
          <Link
            to="/chat"
            className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label="Back to chat"
          >
            Back to Chat
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <MoodEntryWidget />

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-foreground/50">Loading mood history...</p>
          </div>
        ) : (
          <MoodChart entries={entries} />
        )}
      </main>
    </div>
  );
}
