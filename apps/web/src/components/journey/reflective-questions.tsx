import type { JourneyFormulation } from "@/stores/journey-store.js";

interface ReflectiveQuestionsProps {
  formulation: JourneyFormulation;
}

export function ReflectiveQuestions({ formulation }: ReflectiveQuestionsProps) {
  const questions = formulation.questionsWorthExploring.slice(0, 3);
  if (questions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Questions Worth Exploring</h2>
      <p className="mb-5 text-xs text-foreground/40">
        Reflections that emerged from your conversations
      </p>

      <div className="space-y-5">
        {questions.map((q, i) => (
          <div key={`q-${i}`}>
            <p className="text-base leading-relaxed text-foreground/80">{q.question}</p>
            <p className="mt-1.5 text-xs text-foreground/35">Connected to: {q.linkedTo}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
