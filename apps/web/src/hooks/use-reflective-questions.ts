import { useCallback, useEffect, useState } from "react";
import { api, type ReflectiveQuestion } from "@/lib/api.js";

interface CrisisData {
  message: string;
  helplines: ReadonlyArray<{ name: string; number: string; country: string }>;
}

interface UseReflectiveQuestionsReturn {
  questions: ReflectiveQuestion[];
  isLoading: boolean;
  error: string | null;
  /** Currently saving question ID, or null */
  savingId: string | null;
  /** Crisis response data if the backend flagged a reflection as crisis */
  crisisData: CrisisData | null;
  dismissCrisis: () => void;
  /** Save draft (no crisis check) or submit (triggers crisis check). */
  saveReflection: (questionId: string, text: string, submit: boolean) => Promise<boolean>;
  /** Defer a question — hides/deprioritizes it. */
  deferQuestion: (questionId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useReflectiveQuestions(): UseReflectiveQuestionsReturn {
  const [questions, setQuestions] = useState<ReflectiveQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [crisisData, setCrisisData] = useState<CrisisData | null>(null);

  const fetchQuestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getReflectiveQuestions();
      setQuestions(data);
    } catch {
      setError("Could not load your reflective questions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchQuestions is stable (useCallback with no deps)
  useEffect(() => {
    fetchQuestions();
  }, []);

  const saveReflection = useCallback(
    async (questionId: string, text: string, submit: boolean): Promise<boolean> => {
      setSavingId(questionId);

      // Optimistic update
      const snapshot = [...questions];
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? {
                ...q,
                reflectionText: text,
                reflectionStatus: submit ? ("submitted" as const) : ("draft" as const),
                status: submit ? ("answered" as const) : q.status,
                answeredAt: submit ? new Date().toISOString() : q.answeredAt,
              }
            : q,
        ),
      );

      try {
        const result = await api.saveReflection(questionId, text, submit);

        if ("crisis" in result && result.crisis) {
          // Rollback — crisis means the reflection was NOT saved as submitted
          setQuestions(snapshot);
          setCrisisData(result.response);
          return false;
        }

        // Update with server response (authoritative timestamps + statuses)
        setQuestions((prev) =>
          prev.map((q) => (q.id === questionId ? (result as ReflectiveQuestion) : q)),
        );
        return true;
      } catch {
        setQuestions(snapshot);
        setError("Could not save your reflection. Please try again.");
        setTimeout(() => setError(null), 5000);
        return false;
      } finally {
        setSavingId(null);
      }
    },
    [questions],
  );

  const deferQuestion = useCallback(
    async (questionId: string) => {
      const snapshot = [...questions];
      // Optimistic: mark as deferred
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, status: "deferred" as const } : q)),
      );

      try {
        await api.deferReflectiveQuestion(questionId);
      } catch {
        setQuestions(snapshot);
        setError("Could not defer question. Please try again.");
        setTimeout(() => setError(null), 5000);
      }
    },
    [questions],
  );

  const dismissCrisis = useCallback(() => {
    setCrisisData(null);
  }, []);

  return {
    questions,
    isLoading,
    error,
    savingId,
    crisisData,
    dismissCrisis,
    saveReflection,
    deferQuestion,
    refetch: fetchQuestions,
  };
}
