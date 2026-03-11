import { cn } from "@/lib/utils.js";
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
        <time
          className={cn("mt-1 block text-[11px]", isUser ? "text-white/70" : "text-foreground/50")}
        >
          {formatTime(message.createdAt)}
        </time>
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
