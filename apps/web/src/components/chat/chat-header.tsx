import { Link } from "react-router";
import { EmotionToggle } from "@/components/emotion/emotion-toggle.js";
import { cn } from "@/lib/utils.js";

interface ChatHeaderProps {
  status: "idle" | "active" | "completed" | "crisis_escalated";
  onEndSession: () => void;
}

const STATUS_CONFIG: Record<ChatHeaderProps["status"], { label: string; dotClass: string }> = {
  idle: { label: "Starting...", dotClass: "bg-foreground/40" },
  active: { label: "Active", dotClass: "bg-green-500" },
  completed: { label: "Ended", dotClass: "bg-foreground/30" },
  crisis_escalated: { label: "Support Mode", dotClass: "bg-destructive" },
};

export function ChatHeader({ status, onEndSession }: ChatHeaderProps) {
  const config = STATUS_CONFIG[status];
  const canEnd = status === "active";

  return (
    <header className="flex items-center justify-between border-b border-foreground/10 bg-background px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg leading-tight font-semibold text-primary">MindOverChatter</h1>
          <p className="text-xs text-foreground/60">Wellness Companion</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {status === "active" && <EmotionToggle />}

        <Link
          to="/mood"
          className="rounded-lg border border-foreground/15 px-2.5 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
          aria-label="Mood tracker"
        >
          Mood
        </Link>

        <output
          className="flex items-center gap-1.5"
          aria-label={`Session status: ${config.label}`}
        >
          <span
            className={cn("inline-block h-2 w-2 rounded-full", config.dotClass)}
            aria-hidden="true"
          />
          <span className="text-xs text-foreground/60">{config.label}</span>
        </output>

        {canEnd && (
          <button
            type="button"
            onClick={onEndSession}
            className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label="End session"
          >
            End Session
          </button>
        )}
      </div>
    </header>
  );
}
