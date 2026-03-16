import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api.js";
import { cn } from "@/lib/utils.js";
import { useServiceHealthStore } from "@/stores/service-health-store.js";
import type { CrisisResponse, Message } from "@/stores/session-store.js";

interface MessageBubbleProps {
  message: Message;
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Small speaker button for TTS playback on assistant messages. */
function TTSButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const ttsAvailable = useServiceHealthStore((s) => s.tts.available);

  // Clean up object URL and audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handleClick = useCallback(async () => {
    // If currently playing, stop it
    if (state === "playing" && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState("idle");
      return;
    }

    setState("loading");
    try {
      const blob = await api.synthesize(text);
      // Clean up previous object URL if any
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setState("idle");
      };
      audio.onerror = () => {
        setState("error");
        // Auto-reset to idle after a moment
        setTimeout(() => setState("idle"), 2000);
      };

      await audio.play();
      setState("playing");
    } catch {
      setState("error");
      // Auto-reset to idle after a moment so the user can retry
      setTimeout(() => setState("idle"), 2000);
    }
  }, [text, state]);

  // Hide entirely when TTS service is unavailable
  if (!ttsAvailable) {
    return null;
  }

  if (state === "error") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "loading"}
      className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-foreground/40 transition-colors hover:bg-foreground/10 hover:text-foreground/60 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={state === "playing" ? "Stop reading aloud" : "Read aloud"}
      title={state === "playing" ? "Stop reading aloud" : "Read aloud"}
    >
      {state === "loading" ? (
        <svg
          className="h-3 w-3 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : state === "playing" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden="true"
        >
          {/* Square/stop icon */}
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden="true"
        >
          {/* Speaker/volume icon */}
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 shadow-sm",
          isUser ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
        <div
          className={cn("mt-1 flex items-center gap-1", isUser ? "justify-end" : "justify-between")}
        >
          <time className={cn("text-[11px]", isUser ? "text-white/70" : "text-foreground/50")}>
            {formatTime(message.createdAt)}
          </time>
          {!isUser && (
            <span role="status" aria-live="polite">
              <TTSButton text={message.content} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface StreamingBubbleProps {
  content: string;
}

export function StreamingBubble({ content }: StreamingBubbleProps) {
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-foreground shadow-sm">
        {content ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {content}
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-foreground/40" />
          </p>
        ) : (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}

export function ThinkingBubble() {
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
          <span className="text-xs text-foreground/50">Thinking...</span>
        </div>
      </div>
    </div>
  );
}

interface CrisisBannerProps {
  crisisResponse: CrisisResponse;
}

export function CrisisBanner({ crisisResponse }: CrisisBannerProps) {
  return (
    <div
      className="mx-2 my-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-5"
      role="alert"
      aria-live="assertive"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg" role="img" aria-label="warning">
          &#9888;
        </span>
        <h3 className="font-semibold text-destructive">We want to make sure you are safe</h3>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-foreground/90">{crisisResponse.message}</p>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
          Reach out now
        </p>
        {crisisResponse.helplines.map((helpline) => (
          <a
            key={helpline.number}
            href={`tel:${helpline.number.replace(/[^0-9+]/g, "")}`}
            className="flex items-center justify-between rounded-lg bg-white/80 px-4 py-3 transition-colors hover:bg-white"
            aria-label={`Call ${helpline.name} at ${helpline.number}`}
          >
            <div>
              <span className="font-medium text-foreground">{helpline.name}</span>
              <span className="ml-2 text-sm text-foreground/60">({helpline.country})</span>
            </div>
            <span className="font-semibold text-primary">{helpline.number}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
