import { useCallback, useState } from "react";
import { api } from "@/lib/api.js";
import { useMoodStore } from "@/stores/mood-store.js";
import { useSessionStore } from "@/stores/session-store.js";

export function MoodEntryWidget() {
  const sessionId = useSessionStore((s) => s.sessionId);
  const addEntry = useMoodStore((s) => s.addEntry);

  const [valence, setValence] = useState(0);
  const [arousal, setArousal] = useState(0.5);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    try {
      const result = await api.createMoodLog({
        sessionId: sessionId ?? undefined,
        valence,
        arousal,
        source: "user_input",
      });

      addEntry({
        id: result.id,
        valence: result.valence,
        arousal: result.arousal,
        source: result.source,
        sessionId: sessionId,
        createdAt: result.createdAt,
      });

      setSubmitted(true);
      // Reset after a delay
      setTimeout(() => {
        setSubmitted(false);
        setValence(0);
        setArousal(0.5);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log mood");
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, valence, arousal, addEntry]);

  if (submitted) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
        <p className="text-sm font-medium text-primary">Mood logged</p>
        <p className="mt-1 text-xs text-foreground/60">Thank you for checking in with yourself.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-foreground">How are you feeling?</h3>
      <p className="mb-5 text-xs text-foreground/50">
        Move the sliders to reflect your current mood.
      </p>

      {/* Valence slider: -1 to +1 */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="valence-slider" className="text-xs font-medium text-foreground/70">
            Valence
          </label>
          <span className="text-xs text-foreground/50">
            {valence < -0.33 ? "Unpleasant" : valence > 0.33 ? "Pleasant" : "Neutral"}
          </span>
        </div>
        <input
          id="valence-slider"
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={valence}
          onChange={(e) => setValence(Number.parseFloat(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          aria-label="Valence: unpleasant to pleasant"
        />
        <div className="mt-1 flex justify-between text-[10px] text-foreground/40">
          <span>Unpleasant</span>
          <span>Pleasant</span>
        </div>
      </div>

      {/* Arousal slider: 0 to 1 */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="arousal-slider" className="text-xs font-medium text-foreground/70">
            Arousal
          </label>
          <span className="text-xs text-foreground/50">
            {arousal < 0.33 ? "Calm" : arousal > 0.66 ? "Activated" : "Moderate"}
          </span>
        </div>
        <input
          id="arousal-slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={arousal}
          onChange={(e) => setArousal(Number.parseFloat(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-accent"
          aria-label="Arousal: calm to activated"
        />
        <div className="mt-1 flex justify-between text-[10px] text-foreground/40">
          <span>Calm</span>
          <span>Activated</span>
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Log mood entry"
      >
        {submitting ? "Logging..." : "Log Mood"}
      </button>
    </div>
  );
}
