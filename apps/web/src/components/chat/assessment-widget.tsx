// ── Assessment Widget ──────────────────────────────────────────────
// Inline card for PHQ-9 / GAD-7 questionnaires. Appears in the chat
// flow when an `assessment.start` SSE event arrives.
// Questions presented one at a time with Likert-scale radio options.

import { useCallback, useState } from "react";
import { getAssessmentDefinition } from "@/data/assessment-questions.js";
import { api } from "@/lib/api.js";
import { cn } from "@/lib/utils.js";
import { useSessionStore } from "@/stores/session-store.js";

interface AssessmentWidgetProps {
  assessmentType: string;
  parentAssessmentId?: string;
}

export function AssessmentWidget({ assessmentType, parentAssessmentId }: AssessmentWidgetProps) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const completeAssessment = useSessionStore((s) => s.completeAssessment);
  const dismissAssessment = useSessionStore((s) => s.dismissAssessment);

  const definition = getAssessmentDefinition(assessmentType);

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(() =>
    new Array(definition?.questions.length ?? 0).fill(null),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalQuestions = definition?.questions.length ?? 0;
  const currentAnswer = answers[currentQuestion] ?? null;
  const isLastQuestion = currentQuestion === totalQuestions - 1;
  const allAnswered = answers.every((a) => a !== null);
  const progressPct = totalQuestions > 0 ? ((currentQuestion + 1) / totalQuestions) * 100 : 0;

  const selectAnswer = useCallback(
    (value: number) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[currentQuestion] = value;
        return next;
      });
      setError(null);
    },
    [currentQuestion],
  );

  const goNext = useCallback(() => {
    if (currentAnswer === null) return;
    if (!isLastQuestion) {
      setCurrentQuestion((q) => q + 1);
    }
  }, [currentAnswer, isLastQuestion]);

  const goPrev = useCallback(() => {
    if (currentQuestion > 0) {
      setCurrentQuestion((q) => q - 1);
    }
  }, [currentQuestion]);

  const handleSubmit = useCallback(async () => {
    if (!sessionId || !allAnswered || !definition) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await api.submitAssessment({
        sessionId,
        type: definition.type,
        answers: answers as number[],
        parentAssessmentId,
      });

      completeAssessment({
        assessmentId: result.assessmentId,
        severity: result.severity,
        nextScreener: result.nextScreener,
      });
      setSubmitted(true);

      // Auto-dismiss after a short delay
      setTimeout(() => {
        dismissAssessment();
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit assessment");
    } finally {
      setSubmitting(false);
    }
  }, [
    sessionId,
    allAnswered,
    definition,
    answers,
    parentAssessmentId,
    completeAssessment,
    dismissAssessment,
  ]);

  // Unknown assessment type — don't render
  if (!definition) {
    return null;
  }

  // Submitted confirmation
  if (submitted) {
    return (
      <div className="mx-2 my-3 flex w-full justify-start">
        <div className="max-w-[85%] rounded-2xl border border-accent/30 bg-accent/10 p-5">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">
              &#10003;
            </span>
            <p className="text-sm font-medium text-foreground">
              Thank you for completing the {definition.name}
            </p>
          </div>
          <p className="mt-1 text-xs text-foreground/60">
            Your responses have been recorded. Your companion will follow up shortly.
          </p>
        </div>
      </div>
    );
  }

  const question = definition.questions[currentQuestion];

  return (
    <div className="mx-2 my-3 flex w-full justify-start">
      <form
        className="max-w-[85%] rounded-2xl border border-accent/30 bg-white shadow-sm"
        aria-label={`${definition.name} assessment`}
        onSubmit={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="border-b border-accent/20 px-5 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-primary">{definition.name}</h3>
              <p className="text-xs text-foreground/60">{definition.description}</p>
            </div>
            <span className="text-xs font-medium text-foreground/50">
              {currentQuestion + 1} of {totalQuestions}
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={currentQuestion + 1}
            aria-valuemin={1}
            aria-valuemax={totalQuestions}
            aria-label={`Question ${currentQuestion + 1} of ${totalQuestions}`}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${String(progressPct)}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="px-5 pt-4 pb-2">
          <p className="mb-1 text-xs text-foreground/50">{definition.preamble}</p>
          <p className="text-sm leading-relaxed text-foreground">{question}</p>
        </div>

        {/* Likert options */}
        <fieldset className="px-5 pb-3" aria-label="Response options">
          <legend className="sr-only">
            Select how often you have been bothered by this problem
          </legend>
          <div className="flex flex-col gap-2">
            {definition.options.map((option) => {
              const isSelected = currentAnswer === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
                    isSelected
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-foreground/10 bg-background text-foreground/80 hover:border-accent/40 hover:bg-accent/5",
                  )}
                >
                  <input
                    type="radio"
                    name={`q-${String(currentQuestion)}`}
                    value={option.value}
                    checked={isSelected}
                    onChange={() => selectAnswer(option.value)}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      isSelected ? "border-primary bg-primary" : "border-foreground/30",
                    )}
                    aria-hidden="true"
                  >
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Error message */}
        {error && (
          <div className="px-5 pb-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-accent/20 px-5 py-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={currentQuestion === 0}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:invisible"
            aria-label="Previous question"
          >
            Back
          </button>

          {isLastQuestion ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Submit assessment"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={currentAnswer === null}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next question"
            >
              Next
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
