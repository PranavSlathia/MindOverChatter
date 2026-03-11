import { useEmotionDetection } from "@/hooks/use-emotion-detection.js";
import { cn } from "@/lib/utils.js";

/** Compact emotion detection toggle for the chat header area. */
export function EmotionToggle() {
  const { isActive, isSupported, isLoading, startError, dominantEmotion, startDetection, stopDetection } =
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
          "relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
          "font-medium transition-colors",
          isActive
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-foreground/15 text-foreground/60 hover:bg-foreground/5 hover:text-foreground",
          isLoading && "cursor-wait opacity-60",
        )}
        aria-label={
          isActive
            ? "Disable facial emotion detection"
            : "Enable facial emotion detection — camera stays local"
        }
        aria-pressed={isActive}
        title="Face Emotion — your camera stays local, only emotion scores are sent"
      >
        {/* Face/smile icon — clearly communicates emotion detection, not photo capture */}
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
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
        {isLoading ? "Starting..." : isActive ? "Emotion On" : "Emotion"}
        {isActive && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
        )}
      </button>

      {startError && (
        <span className="text-[10px] text-destructive/80">{startError}</span>
      )}
      {!isActive && !isLoading && !startError && (
        <span className="hidden text-[10px] text-foreground/40 sm:inline">Camera stays local</span>
      )}
    </div>
  );
}
