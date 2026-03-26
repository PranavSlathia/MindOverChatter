// ── Reflective Questions — Interactive Card UI ──────────────────────
// Fetches reflective questions from the backend and lets the user
// write/edit reflections inline with a draft/submit flow.
// Crisis-safe: if the backend flags a submitted reflection, a crisis
// alert is shown with helpline numbers.

import { useCallback, useRef, useState } from "react";
import { useReflectiveQuestions } from "@/hooks/use-reflective-questions.js";
import type { ReflectionStatus, ReflectiveQuestion } from "@/lib/api.js";
import { cn } from "@/lib/utils.js";

// ── Constants ────────────────────────────────────────────────────────

const MAX_CHARS = 5000;
const MAX_UNANSWERED_SHOWN = 5;

// ── Integration status labels ────────────────────────────────────────

const REFLECTION_STATUS_LABELS: Record<ReflectionStatus, string> = {
  draft: "Draft saved",
  submitted: "Submitted \u2014 will help guide future sessions",
  reviewed: "Reviewed",
  integrated: "Woven into your journey",
};

const REFLECTION_STATUS_STYLES: Record<ReflectionStatus, string> = {
  draft: "text-foreground/40 italic",
  submitted: "text-primary/70",
  reviewed: "text-primary/80",
  integrated: "text-primary",
};

// ── Sub-components ───────────────────────────────────────────────────

/** Skeleton placeholder while questions are loading. */
function QuestionSkeleton() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-busy="true"
      aria-label="Loading reflective questions"
    >
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-foreground/8 bg-white p-5">
          <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-foreground/8" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-foreground/5" />
        </div>
      ))}
    </div>
  );
}

/** Crisis alert displayed when a reflection triggers crisis detection. */
function CrisisAlert({
  message,
  helplines,
  onDismiss,
}: {
  message: string;
  helplines: Array<{ name: string; number: string; country: string }>;
  onDismiss: () => void;
}) {
  return (
    <div
      className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-5"
      role="alert"
      aria-live="assertive"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">
          &#9888;
        </span>
        <h3 className="font-semibold text-destructive">We want to make sure you are safe</h3>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-foreground/90">{message}</p>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
          Reach out now
        </p>
        {helplines.map((helpline) => (
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
      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 text-xs text-foreground/50 underline underline-offset-2 hover:text-foreground/70"
      >
        Dismiss
      </button>
    </div>
  );
}

/** Inline status badge for reflection state. */
function ReflectionStatusBadge({ status }: { status: ReflectionStatus }) {
  return (
    <output className={cn("text-[11px]", REFLECTION_STATUS_STYLES[status])}>
      {status === "reviewed" && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mr-0.5 inline h-3 w-3"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {REFLECTION_STATUS_LABELS[status]}
    </output>
  );
}

// ── Question Card ────────────────────────────────────────────────────

interface QuestionCardProps {
  question: ReflectiveQuestion;
  isSaving: boolean;
  onSave: (questionId: string, text: string, submit: boolean) => Promise<boolean>;
  onDefer: (questionId: string) => Promise<void>;
}

function QuestionCard({ question, isSaving, onSave, onDefer }: QuestionCardProps) {
  const hasReflection = question.reflectionText !== null;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(question.reflectionText ?? "");
  const [showPreviousAnswer, setShowPreviousAnswer] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const openEditor = useCallback(
    (reflectAgain = false) => {
      // "Reflect again" opens a fresh textarea; regular edit keeps the current text
      setDraft(reflectAgain ? "" : (question.reflectionText ?? ""));
      if (reflectAgain && hasReflection) {
        setShowPreviousAnswer(true);
      }
      setIsEditing(true);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        adjustHeight();
      });
    },
    [question.reflectionText, hasReflection, adjustHeight],
  );

  const closeEditor = useCallback(() => {
    setIsEditing(false);
    setDraft(question.reflectionText ?? "");
    setShowPreviousAnswer(false);
  }, [question.reflectionText]);

  const handleSave = useCallback(
    async (submit: boolean) => {
      const trimmed = draft.trim();
      if (!trimmed) return;
      const success = await onSave(question.id, trimmed, submit);
      if (success) {
        setIsEditing(false);
        setShowPreviousAnswer(false);
      }
    },
    [draft, question.id, onSave],
  );

  const handleDefer = useCallback(async () => {
    await onDefer(question.id);
  }, [question.id, onDefer]);

  const charsUsed = draft.length;
  const charsRemaining = MAX_CHARS - charsUsed;
  const isOverLimit = charsRemaining < 0;

  // ── Answered state (not editing) ───────────────────────────────
  if (hasReflection && !isEditing) {
    return (
      <div className="rounded-xl border border-foreground/8 bg-white p-5 transition-shadow hover:shadow-sm">
        <p className="text-base leading-relaxed text-foreground/80">{question.question}</p>

        {/* Reflection text */}
        <div className="mt-3 rounded-lg bg-primary/5 px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/70">
            {question.reflectionText}
          </p>
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {question.linkedTo && <p className="text-xs text-foreground/35">Connected to: {question.linkedTo}</p>}
            {question.answeredAt && (
              <time className="text-[11px] text-foreground/30">
                {formatRelativeDate(question.answeredAt)}
              </time>
            )}
          </div>
          <div className="flex items-center gap-3">
            {question.reflectionStatus && (
              <ReflectionStatusBadge status={question.reflectionStatus} />
            )}
            <button
              type="button"
              onClick={() => openEditor(true)}
              className="text-xs text-foreground/40 transition-colors hover:text-foreground/60"
              aria-label={`Reflect again on: ${question.question}`}
            >
              Reflect again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Open / editing state ───────────────────────────────────────
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-5 transition-all",
        isEditing ? "border-primary/30 shadow-sm" : "border-foreground/8",
      )}
    >
      <p className="text-base leading-relaxed text-foreground/80">{question.question}</p>
      {question.linkedTo && <p className="mt-1.5 text-xs text-foreground/35">Connected to: {question.linkedTo}</p>}

      {/* Show previous answer collapsed when doing "Reflect again" */}
      {showPreviousAnswer && question.reflectionText && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-foreground/40 hover:text-foreground/60">
            Previous reflection
          </summary>
          <div className="mt-2 rounded-lg bg-foreground/[0.03] px-3.5 py-2.5">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/50">
              {question.reflectionText}
            </p>
          </div>
        </details>
      )}

      {/* Draft status indicator for questions with a saved draft */}
      {!isEditing && question.reflectionStatus === "draft" && question.reflectionText && (
        <div className="mt-3 rounded-lg border border-dashed border-foreground/10 bg-foreground/[0.02] px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-sm italic leading-relaxed text-foreground/50">
            {question.reflectionText}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <ReflectionStatusBadge status="draft" />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openEditor(false)}
                className="text-xs text-foreground/40 transition-colors hover:text-foreground/60"
              >
                Continue editing
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditing ? (
        <div className="mt-3">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              adjustHeight();
            }}
            placeholder="Write your reflection..."
            rows={3}
            className={cn(
              "w-full resize-none rounded-lg border bg-foreground/[0.02] px-3.5 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-foreground/30 focus:outline-none",
              isOverLimit
                ? "border-destructive/40 focus:border-destructive"
                : "border-foreground/10 focus:border-primary/40",
            )}
            aria-label={`Write your reflection for: ${question.question}`}
          />

          <div className="mt-2 flex items-center justify-between">
            <span
              className={cn("text-[11px]", isOverLimit ? "text-destructive" : "text-foreground/30")}
            >
              {charsUsed.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg px-3 py-1.5 text-xs text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={!draft.trim() || isOverLimit || isSaving}
                className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSaving ? "Saving..." : "Save draft"}
              </button>
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={!draft.trim() || isOverLimit || isSaving}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Prompt to write — only if no draft exists */
        !question.reflectionText && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => openEditor(false)}
              className="flex-1 rounded-lg border border-dashed border-foreground/10 px-3.5 py-2.5 text-left text-sm text-foreground/30 transition-colors hover:border-primary/20 hover:text-foreground/40"
              aria-label={`Write your reflection for: ${question.question}`}
            >
              Write your reflection...
            </button>
            <button
              type="button"
              onClick={handleDefer}
              className="shrink-0 rounded-lg px-2.5 py-2.5 text-xs text-foreground/30 transition-colors hover:bg-foreground/5 hover:text-foreground/50"
              aria-label={`Defer question: ${question.question}`}
              title="Not now"
            >
              Not now
            </button>
          </div>
        )
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ── Main Component ───────────────────────────────────────────────────

export function ReflectiveQuestions() {
  const {
    questions,
    isLoading,
    error,
    savingId,
    crisisData,
    dismissCrisis,
    saveReflection,
    deferQuestion,
  } = useReflectiveQuestions();

  // Partition by status: open first (capped), then answered, hide deferred/retired
  const openQuestions = questions.filter((q) => q.status === "open").slice(0, MAX_UNANSWERED_SHOWN);
  const answeredQuestions = questions.filter((q) => q.status === "answered");
  const hasQuestions = openQuestions.length > 0 || answeredQuestions.length > 0;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Questions Worth Exploring</h2>
      <p className="mb-5 text-xs text-foreground/40">
        Reflections that emerged from your conversations
      </p>

      {/* Error notice */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Crisis alert */}
      {crisisData && (
        <div className="mb-4">
          <CrisisAlert
            message={crisisData.message}
            helplines={crisisData.helplines}
            onDismiss={dismissCrisis}
          />
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && <QuestionSkeleton />}

      {/* Empty state */}
      {!isLoading && !hasQuestions && (
        <p className="py-4 text-center text-sm leading-relaxed text-foreground/40">
          Your questions will appear here after a few conversations
        </p>
      )}

      {/* Question list */}
      {!isLoading && hasQuestions && (
        <div className="space-y-3">
          {openQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              isSaving={savingId === q.id}
              onSave={saveReflection}
              onDefer={deferQuestion}
            />
          ))}

          {answeredQuestions.length > 0 && openQuestions.length > 0 && (
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-foreground/8" />
              <span className="text-[11px] text-foreground/30">Reflected on</span>
              <div className="h-px flex-1 bg-foreground/8" />
            </div>
          )}

          {answeredQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              isSaving={savingId === q.id}
              onSave={saveReflection}
              onDefer={deferQuestion}
            />
          ))}
        </div>
      )}
    </section>
  );
}
