// ── CBT Thought Record Widget ────────────────────────────────────────
// 7-step guided reflection following the CBT Thought Record framework.
// Appears in the chat flow when an `assessment.start` SSE event arrives
// with `assessmentType: "cbt_thought_record"`.

import { useCallback, useState } from "react";
import { api } from "@/lib/api.js";
import { cn } from "@/lib/utils.js";
import { useSessionStore } from "@/stores/session-store.js";

// ── Step definitions ────────────────────────────────────────────────

type StepKind = "textarea" | "textarea+slider" | "slider";

interface Step {
  id: string;
  label: string;
  prompt: string;
  hint: string;
  kind: StepKind;
  sliderLabel?: string;
}

const STEPS: Step[] = [
  {
    id: "situation",
    label: "Situation",
    prompt: "What happened?",
    hint: "Describe where you were, when it happened, and who was involved.",
    kind: "textarea",
  },
  {
    id: "automatic_thought",
    label: "Automatic Thought",
    prompt: "What went through your mind automatically?",
    hint: "The first thought or image that came to mind in that moment.",
    kind: "textarea",
  },
  {
    id: "emotions",
    label: "Emotions",
    prompt: "What did you feel?",
    hint: "Name the emotion (e.g. anxious, sad, angry) and rate its intensity.",
    kind: "textarea+slider",
    sliderLabel: "Intensity",
  },
  {
    id: "evidence_for",
    label: "Evidence For",
    prompt: "What supports this thought being true?",
    hint: "Facts or observations that seem to confirm your automatic thought.",
    kind: "textarea",
  },
  {
    id: "evidence_against",
    label: "Evidence Against",
    prompt: "What evidence suggests it might not be entirely true?",
    hint: "Facts, past experiences, or alternative explanations that challenge the thought.",
    kind: "textarea",
  },
  {
    id: "balanced_thought",
    label: "Balanced Thought",
    prompt: "A more balanced perspective that considers both sides.",
    hint: "Try to write a thought that is fair to yourself and acknowledges the full picture.",
    kind: "textarea",
  },
  {
    id: "outcome",
    label: "Outcome",
    prompt: "How do you feel now?",
    hint: "Re-rate the intensity of your emotion after this reflection.",
    kind: "textarea+slider",
    sliderLabel: "Intensity now",
  },
];

const TOTAL_STEPS = STEPS.length;

// ── State shape ─────────────────────────────────────────────────────

interface StepAnswer {
  text: string;
  intensity: number; // 0–100, only used for steps with sliders
}

function blankAnswers(): StepAnswer[] {
  return STEPS.map(() => ({ text: "", intensity: 50 }));
}

// ── Slider component ────────────────────────────────────────────────
// Native range input styled to match the calming theme.

interface SliderProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function IntensitySlider({ id, label, value, onChange }: SliderProps) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-foreground/70">
          {label}
        </label>
        <span className="text-xs font-semibold text-primary">{value}%</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        aria-label={`${label}: ${String(value)} percent`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      />
      <div className="mt-0.5 flex justify-between">
        <span className="text-[10px] text-foreground/40">None</span>
        <span className="text-[10px] text-foreground/40">Intense</span>
      </div>
    </div>
  );
}

// ── Main widget ─────────────────────────────────────────────────────

export function CBTThoughtRecordWidget() {
  const sessionId = useSessionStore((s) => s.sessionId);
  const dismissAssessment = useSessionStore((s) => s.dismissAssessment);

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<StepAnswer[]>(blankAnswers);
  const [submitted, setSubmitted] = useState(false);

  const step = STEPS[currentStep]!;
  const answer = answers[currentStep]!;
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOTAL_STEPS - 1;
  const progressPct = ((currentStep + 1) / TOTAL_STEPS) * 100;

  const updateText = useCallback(
    (text: string) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[currentStep] = { ...next[currentStep]!, text };
        return next;
      });
    },
    [currentStep],
  );

  const updateIntensity = useCallback(
    (intensity: number) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[currentStep] = { ...next[currentStep]!, intensity };
        return next;
      });
    },
    [currentStep],
  );

  const goBack = useCallback(() => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  }, [isFirst]);

  const goNext = useCallback(() => {
    if (!isLast) setCurrentStep((s) => s + 1);
  }, [isLast]);

  const handleComplete = useCallback(() => {
    setSubmitted(true);
    // Fire-and-forget POST — CBT records are stored as text answers (score=0, severity=minimal)
    if (sessionId) {
      // Serialize text + intensity for slider steps so nothing is silently discarded
      const serialized = answers.map((a, i) => {
        const step = STEPS[i]!;
        if (step.kind === "textarea+slider") {
          return `${a.text}\n[Intensity: ${String(a.intensity)}%]`;
        }
        return a.text;
      });
      api
        .submitCBT({
          sessionId,
          answers: serialized,
        })
        .catch((err: unknown) => {
          console.warn("[cbt] failed to persist thought record:", err instanceof Error ? err.message : err);
        });
    }
    setTimeout(() => {
      dismissAssessment();
    }, 2500);
  }, [sessionId, answers, dismissAssessment]);

  const canProceed = answer.text.trim().length > 0;

  // ── Submitted confirmation ────────────────────────────────────────

  if (submitted) {
    return (
      <div className="mx-2 my-3 flex w-full justify-start">
        <div className="max-w-[85%] rounded-2xl border border-accent/30 bg-accent/10 p-5">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">
              &#10003;
            </span>
            <p className="text-sm font-medium text-foreground">
              Thought record complete. Well done.
            </p>
          </div>
          <p className="mt-1 text-xs text-foreground/60">
            Taking a moment to examine your thoughts takes real courage. Your companion will follow
            up shortly.
          </p>
        </div>
      </div>
    );
  }

  // ── Active widget ─────────────────────────────────────────────────

  return (
    <div className="mx-2 my-3 flex w-full justify-start">
      <div
        className="max-w-[85%] rounded-2xl border border-accent/30 bg-white shadow-sm"
        role="region"
        aria-label="CBT Thought Record"
      >
        {/* Header */}
        <div className="border-b border-accent/20 px-5 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-primary">CBT Thought Record</h3>
              <p className="text-xs text-foreground/60">
                A structured reflection to examine and rebalance your thinking.
              </p>
            </div>
            <span className="text-xs font-medium text-foreground/50">
              Step {currentStep + 1} of {TOTAL_STEPS}
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={currentStep + 1}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            aria-label={`Step ${String(currentStep + 1)} of ${String(TOTAL_STEPS)}`}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${String(progressPct)}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="px-5 pt-4 pb-3">
          {/* Step label pill */}
          <span className="mb-2 inline-block rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
            {step.label}
          </span>

          {/* Prompt */}
          <p className="mb-1 text-sm font-medium leading-snug text-foreground">{step.prompt}</p>
          <p className="mb-3 text-xs leading-relaxed text-foreground/55">{step.hint}</p>

          {/* Textarea */}
          {(step.kind === "textarea" || step.kind === "textarea+slider") && (
            <textarea
              id={`cbt-step-${step.id}`}
              value={answer.text}
              onChange={(e) => updateText(e.target.value)}
              rows={3}
              placeholder="Write your response here..."
              aria-label={step.prompt}
              className={cn(
                "w-full resize-none rounded-lg border px-3 py-2.5 text-sm text-foreground",
                "placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/40",
                "border-foreground/10 bg-background transition-colors",
              )}
            />
          )}

          {/* Intensity slider (steps 3 and 7) */}
          {step.kind === "textarea+slider" && (
            <IntensitySlider
              id={`cbt-intensity-${step.id}`}
              label={step.sliderLabel ?? "Intensity"}
              value={answer.intensity}
              onChange={updateIntensity}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-accent/20 px-5 py-3">
          <button
            type="button"
            onClick={goBack}
            disabled={isFirst}
            aria-label="Previous step"
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:invisible"
          >
            Back
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={handleComplete}
              disabled={!canProceed}
              aria-label="Complete thought record"
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Complete
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed}
              aria-label="Next step"
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
