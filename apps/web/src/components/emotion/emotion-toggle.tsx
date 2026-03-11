import { useEmotionDetection } from "@/hooks/use-emotion-detection.js";
import { cn } from "@/lib/utils.js";

/** Compact emotion detection toggle for the chat header area. */
export function EmotionToggle() {
  const { isActive, isSupported, isLoading, dominantEmotion, startDetection, stopDetection } =
    useEmotionDetection();

  if (!isSupported) {
    return null;
  }

  const handleToggle = () => {
    if (isActive) {
      stopDetection();
    } else {
      startDetection();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isActive && dominantEmotion && (
        <output
          className="text-xs text-foreground/60"
          aria-label={`Detected emotion: ${dominantEmotion}`}
        >
          {dominantEmotion}
        </output>
      )}

      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={cn(
          "relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
          isActive
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-foreground/15 text-foreground/60 hover:bg-foreground/5 hover:text-foreground",
          isLoading && "cursor-wait opacity-60",
        )}
        aria-label={isActive ? "Disable emotion detection" : "Enable emotion detection"}
        aria-pressed={isActive}
        title="Your camera stays local — only emotion scores are sent"
      >
        {/* Camera icon (simple SVG) */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {isLoading ? "Starting..." : isActive ? "On" : "Off"}
        {isActive && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
        )}
      </button>

      {!isActive && !isLoading && (
        <span className="hidden text-[10px] text-foreground/40 sm:inline">Camera stays local</span>
      )}
    </div>
  );
}
