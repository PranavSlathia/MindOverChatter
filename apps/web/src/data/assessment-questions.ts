// ── Standardized Assessment Instruments ────────────────────────────
// Static question data for PHQ-9 and GAD-7 validated screening tools.
// These are standardized instruments — question text must not be altered.

export interface AssessmentDefinition {
  type: string;
  name: string;
  description: string;
  preamble: string;
  questions: string[];
  options: Array<{ label: string; value: number }>;
}

const LIKERT_OPTIONS = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 },
] as const;

export const ASSESSMENT_DEFINITIONS: Record<string, AssessmentDefinition> = {
  phq9: {
    type: "phq9",
    name: "PHQ-9",
    description: "Patient Health Questionnaire",
    preamble: "Over the last 2 weeks, how often have you been bothered by...",
    questions: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading the newspaper or watching television",
      "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead or of hurting yourself in some way",
    ],
    options: [...LIKERT_OPTIONS],
  },

  gad7: {
    type: "gad7",
    name: "GAD-7",
    description: "Generalized Anxiety Disorder Assessment",
    preamble: "Over the last 2 weeks, how often have you been bothered by...",
    questions: [
      "Feeling nervous, anxious, or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid as if something awful might happen",
    ],
    options: [...LIKERT_OPTIONS],
  },
};

/**
 * Look up an assessment definition by type string.
 * Returns undefined for unknown types (e.g., screeners not yet defined in the UI).
 */
export function getAssessmentDefinition(type: string): AssessmentDefinition | undefined {
  return ASSESSMENT_DEFINITIONS[type];
}
