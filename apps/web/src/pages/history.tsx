import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { SessionMessage, SessionSummary } from "@/lib/api.js";
import { api } from "@/lib/api.js";
import { cn } from "@/lib/utils.js";

const PAGE_SIZE = 20;

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "Ongoing";
  try {
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    const diffMs = end - start;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "< 1 min";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  } catch {
    return "";
  }
}

const STATUS_STYLES: Record<string, { label: string; dotClass: string }> = {
  active: { label: "Active", dotClass: "bg-green-500" },
  completed: { label: "Completed", dotClass: "bg-foreground/30" },
  crisis_escalated: { label: "Support Mode", dotClass: "bg-destructive" },
};

interface SessionCardProps {
  session: SessionSummary;
  onContinue: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

function SessionCard({ session, onContinue, onDelete }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusConfig = STATUS_STYLES[session.status] ?? {
    label: session.status,
    dotClass: "bg-foreground/30",
  };

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    // Only fetch if not already loaded
    if (messages.length > 0) return;

    setLoadingMessages(true);
    setMessagesError(null);
    try {
      const result = await api.getSessionMessages(session.id);
      setMessages(result.messages);
    } catch (err) {
      console.error("Failed to fetch session messages:", err);
      setMessagesError("Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  }, [expanded, messages.length, session.id]);

  return (
    <div className="rounded-xl border border-foreground/10 bg-background shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={expanded}
        aria-label={`Session from ${formatDate(session.startedAt)}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {formatDate(session.startedAt)}
            </span>
            <span className="text-xs text-foreground/50">{formatTime(session.startedAt)}</span>
          </div>

          <div className="mt-1 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className={cn("inline-block h-2 w-2 rounded-full", statusConfig.dotClass)}
                aria-hidden="true"
              />
              <span className="text-xs text-foreground/60">{statusConfig.label}</span>
            </div>
            <span className="text-xs text-foreground/40">
              {formatDuration(session.startedAt, session.endedAt)}
            </span>
          </div>

          {session.summary && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground/60">
              {session.summary}
            </p>
          )}
        </div>

        <span
          className={cn("mt-1 text-foreground/40 transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        >
          &#9660;
        </span>
      </button>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-foreground/5 px-5 py-2.5">
        <button
          type="button"
          onClick={() => onContinue(session.id)}
          className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          aria-label={`Continue session from ${formatDate(session.startedAt)}`}
        >
          Continue
        </button>

        {confirmDelete ? (
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-foreground/50">Delete?</span>
            <button
              type="button"
              onClick={async () => {
                setDeleting(true);
                try {
                  await api.deleteSession(session.id);
                  onDelete(session.id);
                } catch (err) {
                  console.error("Failed to delete session:", err);
                  setDeleting(false);
                  setConfirmDelete(false);
                }
              }}
              disabled={deleting}
              className="rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              aria-label="Confirm delete"
            >
              {deleting ? "..." : "Yes"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-foreground/15 px-2.5 py-1 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5"
              aria-label="Cancel delete"
            >
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/50 transition-colors hover:border-destructive/30 hover:text-destructive"
            aria-label={`Delete session from ${formatDate(session.startedAt)}`}
          >
            Delete
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-foreground/5 px-5 py-4">
          {loadingMessages && (
            <div className="flex items-center justify-center py-6">
              <p className="text-xs text-foreground/50">Loading messages...</p>
            </div>
          )}

          {messagesError && (
            <div className="py-4 text-center">
              <p className="text-xs text-destructive">{messagesError}</p>
            </div>
          )}

          {!loadingMessages && !messagesError && messages.length === 0 && (
            <div className="py-4 text-center">
              <p className="text-xs text-foreground/50">No messages in this session</p>
            </div>
          )}

          {messages.length > 0 && (
            <div className="flex max-h-96 flex-col gap-2.5 overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex w-full",
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2.5 shadow-sm",
                      msg.role === "user"
                        ? "rounded-br-sm bg-primary text-white"
                        : "rounded-bl-sm bg-muted text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                      {msg.content}
                    </p>
                    <time
                      className={cn(
                        "mt-0.5 block text-[10px]",
                        msg.role === "user" ? "text-white/70" : "text-foreground/50",
                      )}
                    >
                      {formatTime(msg.createdAt)}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleContinue = useCallback(
    (sessionId: string) => {
      navigate(`/chat/${sessionId}`);
    },
    [navigate],
  );

  const handleDelete = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;

    async function fetchSessions() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await api.getSessions(PAGE_SIZE, 0);
        if (!cancelled) {
          setSessions(result.sessions);
          setOffset(PAGE_SIZE);
          setHasMore(result.sessions.length >= PAGE_SIZE);
        }
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
        if (!cancelled) {
          setLoadError("Failed to load session history");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const result = await api.getSessions(PAGE_SIZE, offset);
      setSessions((prev) => [...prev, ...result.sessions]);
      setOffset((prev) => prev + PAGE_SIZE);
      setHasMore(result.sessions.length >= PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load more sessions:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [offset]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-foreground/10 bg-background px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold leading-tight text-primary">Session History</h1>
          <p className="text-xs text-foreground/60">Review past conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/mood"
            className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label="Mood tracker"
          >
            Mood
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
      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Loading state */}
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-foreground/50">Loading session history...</p>
          </div>
        )}

        {/* Error state */}
        {loadError && !isLoading && (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-foreground/15 px-4 py-2 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !loadError && sessions.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <p className="text-sm text-foreground/50">No previous sessions yet</p>
            <Link
              to="/chat"
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              aria-label="Start your first session"
            >
              Start Your First Session
            </Link>
          </div>
        )}

        {/* Session list */}
        {!isLoading && !loadError && sessions.length > 0 && (
          <div className="flex flex-col gap-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onContinue={handleContinue}
                onDelete={handleDelete}
              />
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg border border-foreground/15 px-6 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Load more sessions"
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
