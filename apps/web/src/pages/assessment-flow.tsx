import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { getAssessmentDefinition } from "@/data/assessment-questions.js";
import { api } from "@/lib/api.js";
import { cn } from "@/lib/utils.js";

const SEVERITY_LABELS: Record<string, string> = {
  minimal: "Minimal",
  mild: "Mild",
  moderate: "Moderate",
  moderately_severe: "Moderately Severe",
  severe: "Severe",
};

const SEVERITY_COLORS: Record<string, string> = {
  minimal: "text-emerald-600",
  mild: "text-yellow-600",
  moderate: "text-orange-600",
  moderately_severe: "text-red-500",
  severe: "text-red-700",
};

// Non-clinical result descriptions
const SEVERITY_DESCRIPTIONS: Record<string, string> = {
  minimal: "Your responses suggest you're doing well in this area.",
  mild: "Your responses suggest some mild concerns. It may be worth keeping an eye on how you feel.",
  moderate: "Your responses suggest moderate concerns. Consider exploring this further in a chat session.",
  moderately_severe: "Your responses indicate notable concerns. We'd encourage talking through this with your wellness companion.",
  severe: "Your responses suggest significant concerns. Please consider reaching out to a professional for support.",
};

export function AssessmentFlowPage() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const definition = type ? getAssessmentDefinition(type) : undefined;

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(() =>
    new Array(definition?.questions.length ?? 0).fill(null),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ severity: string } | null>(null);
  // Gate question state (e.g., PC-PTSD-5 trauma exposure gate)
  const [gateAnswer, setGateAnswer] = useState<number | null>(null);
  const hasGate = !!definition?.gateQuestion;
  const gateDeclined = hasGate && gateAnswer === 0;
  const gatePassed = !hasGate || gateAnswer === 1;

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
    if (!allAnswered || !definition) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await api.submitAssessment({
        type: definition.type,
        answers: answers as number[],
      });
      setResult({ severity: res.severity });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit assessment");
    } finally {
      setSubmitting(false);
    }
  }, [allAnswered, definition, answers]);

  // Unknown assessment type
  if (!definition) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm text-foreground/60">Assessment not found</p>
        <Link to="/assessments" className="text-sm text-primary hover:underline">
          Back to assessments
        </Link>
      </div>
    );
  }

  // Gate declined — user answered "No" to the gate question
  if (gateDeclined) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
          <div className="mb-4 text-center">
            <h2 className="text-lg font-semibold text-foreground">{definition!.name}</h2>
            <p className="mt-1 text-xs text-foreground/50">{definition!.description}</p>
          </div>
          <p className="mb-6 text-center text-sm leading-relaxed text-foreground/70">
            Thank you for answering. Based on your response, the remaining questions don't apply. No further screening is needed at this time.
          </p>
          <p className="mb-6 text-center text-[11px] text-foreground/40">
            This is not a diagnosis. If you ever want to revisit this, the assessment is always available.
          </p>
          <button
            type="button"
            onClick={() => navigate("/assessments")}
            className="w-full rounded-lg border border-foreground/10 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  // Results screen
  if (result) {
    const isPersonality = definition.category === "personality";
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
          <div className="mb-4 text-center">
            <h2 className="text-lg font-semibold text-foreground">{definition.name} Complete</h2>
            <p className="mt-1 text-xs text-foreground/50">{definition.description}</p>
          </div>

          {isPersonality ? (
            <div className="mb-5 rounded-xl bg-muted/50 p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Recorded</p>
              <p className="mt-1 text-xl font-bold text-primary">Profile Saved</p>
            </div>
          ) : (
            <div className="mb-5 rounded-xl bg-muted/50 p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-foreground/50">Result</p>
              <p className={cn("mt-1 text-xl font-bold", SEVERITY_COLORS[result.severity])}>
                {SEVERITY_LABELS[result.severity] ?? result.severity}
              </p>
            </div>
          )}

          <p className="mb-6 text-center text-sm leading-relaxed text-foreground/70">
            {isPersonality
              ? "Your personality profile has been recorded. These traits describe your tendencies — there are no right or wrong results. You can discuss your profile in a chat session."
              : (SEVERITY_DESCRIPTIONS[result.severity] ??
                "Thank you for completing this assessment.")}
          </p>

          <p className="mb-6 text-center text-[11px] text-foreground/40">
            {isPersonality
              ? "Personality traits are descriptive, not diagnostic. They reflect tendencies, not problems."
              : "This is not a diagnosis. These results are for self-reflection and to help guide your conversations."}
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/assessments")}
              className="flex-1 rounded-lg border border-foreground/10 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted"
            >
              Back to Library
            </button>
            <button
              type="button"
              onClick={() => navigate("/chat")}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Talk About It
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question = definition.questions[currentQuestion];

  // Gate question screen (shown before main questions)
  if (hasGate && gateAnswer === null) {
    const gate = definition.gateQuestion!;
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/assessments"
            className="flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground/80"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </Link>
          <span className="text-xs font-medium text-foreground/50">{definition.name}</span>
        </div>
        <div className="rounded-2xl border border-foreground/10 bg-white shadow-sm">
          <div className="border-b border-foreground/5 px-5 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-primary">{definition.name}</h2>
          </div>
          <div className="px-5 pt-4 pb-2">
            <p className="text-sm leading-relaxed text-foreground">{gate.text}</p>
          </div>
          <fieldset className="px-5 pb-5" aria-label="Gate question">
            <legend className="sr-only">Select your response</legend>
            <div className="flex flex-col gap-2">
              {gate.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setGateAnswer(option.value)}
                  className="rounded-lg border border-foreground/10 bg-background px-3.5 py-2.5 text-sm text-foreground/80 transition-colors hover:border-accent/40 hover:bg-accent/5"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/assessments"
          className="flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground/80"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </Link>
        <span className="text-xs font-medium text-foreground/50">
          {currentQuestion + 1} / {totalQuestions}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-muted"
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

      {/* Question card */}
      <form
        className="rounded-2xl border border-foreground/10 bg-white shadow-sm"
        aria-label={`${definition.name} assessment`}
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="border-b border-foreground/5 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold text-primary">{definition.name}</h2>
          <p className="text-xs text-foreground/50">{definition.preamble}</p>
        </div>

        <div className="px-5 pt-4 pb-2">
          <p className="text-sm leading-relaxed text-foreground">{question}</p>
        </div>

        <fieldset className="px-5 pb-3" aria-label="Response options">
          <legend className="sr-only">Select your response</legend>
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

        {error && (
          <div className="px-5 pb-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-foreground/5 px-5 py-3">
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
