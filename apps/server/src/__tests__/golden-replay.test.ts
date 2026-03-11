/**
 * Golden Replay Test Harness
 *
 * Replays realistic conversation transcripts through the crisis detection,
 * crisis pipeline, and assessment signal detection systems to verify they
 * produce expected outcomes. Purely deterministic — no running services needed.
 */
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

// ── Section 1: Crisis Keyword Detection ────────────────────────────
// Tests import directly from the keyword detector (pure, no side effects).

import { detectKeywords } from "../crisis/keyword-detector.js";

describe("Golden Replay — Crisis Keyword Detection & Negation", () => {
  describe("English negation patterns", () => {
    it("'I do not want to kill myself' → HIGH severity, isNegated=true", () => {
      const result = detectKeywords("I do not want to kill myself");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.isNegated).toBe(true);
      expect(result.matchedPhrases).toContain("kill myself");
    });

    it("'I want to kill myself' → HIGH severity, isNegated=false", () => {
      const result = detectKeywords("I want to kill myself");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.isNegated).toBe(false);
      expect(result.matchedPhrases).toContain("kill myself");
    });

    it("'I'm not suicidal' → HIGH severity, isNegated=true", () => {
      const result = detectKeywords("I'm not suicidal");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.isNegated).toBe(true);
    });

    it("'I would never hurt myself' → HIGH severity, isNegated=true", () => {
      const result = detectKeywords("I would never hurt myself");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.isNegated).toBe(true);
    });
  });

  describe("Hinglish negation patterns", () => {
    it("'marna nahi chahta hun' (negated) → HIGH severity, isNegated=true", () => {
      const result = detectKeywords("marna nahi chahta hun");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.isNegated).toBe(true);
      expect(result.matchedPhrases).toContain("marna chahta");
    });

    it("'marna chahta hun' (non-negated) → HIGH severity, isNegated=false", () => {
      const result = detectKeywords("marna chahta hun");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.isNegated).toBe(false);
    });

    it("'khudkushi nahi karunga' (negated, post-match) → HIGH severity, isNegated=true", () => {
      const result = detectKeywords("khudkushi nahi karunga");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.isNegated).toBe(true);
    });

    it("'mar jaunga' (non-negated) → HIGH severity, isNegated=false", () => {
      const result = detectKeywords("mar jaunga");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.isNegated).toBe(false);
    });
  });

  describe("mixed negation scenarios", () => {
    it("'I don't want to die but sometimes I feel hopeless' → HIGH negated via 'want to die'", () => {
      // "want to die" is HIGH, negated by "don't" nearby
      // "hopeless" alone is not a keyword
      const result = detectKeywords(
        "I don't want to die but sometimes I feel hopeless",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.isNegated).toBe(true);
      expect(result.matchedPhrases).toContain("want to die");
    });

    it("'I don't want to kill myself but I want to die' → HIGH, isNegated=false (mixed)", () => {
      // "kill myself" is negated, but "want to die" is NOT negated (too far from "don't")
      const result = detectKeywords(
        "I don't want to kill myself but I want to die",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      // isNegated=false because NOT all high matches are negated
      expect(result.isNegated).toBe(false);
    });

    it("KNOWN DESIGN LIMITATION — negation spillover: 'I'm not suicidal but I want to die'", () => {
      // The word "not" in "not suicidal" falls within the 25-char window before "want to die".
      // This causes isNegated=true at the keyword level, which routes through Haiku (Stage 2).
      // This is NOT a safety gap because:
      //   1. Haiku sees the full message and will classify "want to die" as crisis.
      //   2. If Haiku fails, the fallback is isCrisis=true (conservative).
      const result = detectKeywords(
        "I'm not suicidal but I want to die",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      // isNegated=true due to spillover — "not" in "not suicidal" is within 25 chars of "want to die"
      // This routes to Haiku which will correctly identify crisis from full context
      expect(result.isNegated).toBe(true);
    });

    it("distant negation does NOT suppress: 'I'm not feeling well and I want to kill myself'", () => {
      const result = detectKeywords(
        "I'm not feeling well and I want to kill myself",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      // The "not" is too far from "kill myself" → not negated
      expect(result.isNegated).toBe(false);
    });
  });

  describe("multi-message realistic conversation replay", () => {
    // Simulates checking each message in a therapeutic conversation
    const conversationTranscript = [
      {
        text: "I've been having a really hard time lately",
        expectedDetected: false,
      },
      {
        text: "Sometimes I feel like there's no reason to live",
        expectedDetected: true,
        expectedSeverity: "high" as const,
        expectedNegated: false,
      },
      {
        text: "But I'm not suicidal or anything like that",
        expectedDetected: true,
        expectedSeverity: "high" as const,
        expectedNegated: true,
      },
      {
        text: "I just feel stuck, you know?",
        expectedDetected: false,
      },
      {
        // "self-harm" is detected but NOT negated because "never" appears
        // AFTER the match and English negation only checks BEFORE. This is
        // an acceptable false positive — safety over precision.
        text: "My friend told me about self-harm but I would never do that",
        expectedDetected: true,
        expectedSeverity: "high" as const,
        expectedNegated: false,
      },
    ];

    for (const turn of conversationTranscript) {
      it(`message: "${turn.text.slice(0, 50)}..."`, () => {
        const result = detectKeywords(turn.text);
        expect(result.detected).toBe(turn.expectedDetected);
        if (turn.expectedDetected) {
          expect(result.severity).toBe(turn.expectedSeverity);
          expect(result.isNegated).toBe(turn.expectedNegated);
        }
      });
    }
  });
});

// ── Section 2: Crisis Pipeline (detector.ts) ──────────────────────
// Mocks the Haiku classifier to test the pipeline orchestration logic.

vi.mock("../crisis/haiku-classifier.js", () => ({
  classifyWithHaiku: vi.fn(),
}));

import { detectCrisis } from "../crisis/detector.js";
import { classifyWithHaiku } from "../crisis/haiku-classifier.js";
import type { HaikuResult } from "../crisis/types.js";

const mockClassify = classifyWithHaiku as Mock;

function haikuResult(
  risk_level: HaikuResult["risk_level"],
  confidence = 0.9,
): HaikuResult {
  return {
    risk_level,
    reasoning: `test: classified as ${risk_level}`,
    confidence,
    stage: "haiku",
  };
}

describe("Golden Replay — Crisis Pipeline Orchestration", () => {
  beforeEach(() => {
    mockClassify.mockReset();
  });

  describe("negated HIGH + Haiku returning low → NOT crisis", () => {
    it("'I do not want to kill myself' with Haiku 'low' → isCrisis=false", async () => {
      mockClassify.mockResolvedValue(haikuResult("low"));
      const result = await detectCrisis("I do not want to kill myself");

      expect(result.isCrisis).toBe(false);
      expect(mockClassify).toHaveBeenCalled();
      expect(result.stages).toContain("haiku");
      expect(result.haikuResult?.risk_level).toBe("low");
      expect(result.response).toBeNull();
    });

    it("'I do not want to kill myself' with Haiku 'none' → isCrisis=false", async () => {
      mockClassify.mockResolvedValue(haikuResult("none"));
      const result = await detectCrisis("I do not want to kill myself");

      expect(result.isCrisis).toBe(false);
      expect(result.response).toBeNull();
    });

    it("Hinglish negated: 'marna nahi chahta' with Haiku 'none' → isCrisis=false", async () => {
      mockClassify.mockResolvedValue(haikuResult("none"));
      const result = await detectCrisis("marna nahi chahta hun");

      expect(result.isCrisis).toBe(false);
      expect(mockClassify).toHaveBeenCalled();
    });
  });

  describe("non-negated HIGH → immediate crisis (no Haiku)", () => {
    it("'I want to kill myself' → isCrisis=true, no Haiku called", async () => {
      const result = await detectCrisis("I want to kill myself");

      expect(result.isCrisis).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.stages).toEqual(["keyword"]);
      expect(result.haikuResult).toBeNull();
      expect(mockClassify).not.toHaveBeenCalled();
      expect(result.response).not.toBeNull();
      expect(result.response?.helplines.length).toBe(3);
    });

    it("'suicide' → immediate crisis, no Haiku", async () => {
      const result = await detectCrisis("suicide");

      expect(result.isCrisis).toBe(true);
      expect(result.severity).toBe("high");
      expect(mockClassify).not.toHaveBeenCalled();
    });

    it("Hinglish non-negated: 'mar jaunga' → immediate crisis, no Haiku", async () => {
      const result = await detectCrisis("mar jaunga");

      expect(result.isCrisis).toBe(true);
      expect(result.severity).toBe("high");
      expect(mockClassify).not.toHaveBeenCalled();
    });
  });

  describe("negated HIGH + Haiku says crisis/elevated → still crisis (Haiku overrides negation)", () => {
    it("negated high + Haiku 'crisis' → isCrisis=true", async () => {
      mockClassify.mockResolvedValue(haikuResult("crisis"));
      const result = await detectCrisis(
        "I don't want to kill myself... actually maybe I do",
      );

      expect(result.isCrisis).toBe(true);
    });

    it("negated high + Haiku 'elevated' → isCrisis=true", async () => {
      mockClassify.mockResolvedValue(haikuResult("elevated"));
      const result = await detectCrisis(
        "I'm not suicidal but I feel terrible",
      );

      expect(result.isCrisis).toBe(true);
    });
  });

  describe("DESIGN LIMITATION — negation spillover routes through Haiku safely", () => {
    it("'I'm not suicidal but I want to die' → Haiku sees full context, catches crisis", async () => {
      // The keyword detector marks isNegated=true due to spillover.
      // But Haiku classifies correctly from the full message.
      mockClassify.mockResolvedValue(haikuResult("crisis"));
      const result = await detectCrisis("I'm not suicidal but I want to die");

      expect(result.isCrisis).toBe(true);
      expect(mockClassify).toHaveBeenCalled(); // Routed to Haiku (not short-circuited)
      expect(result.stages).toContain("haiku");
    });

    it("'I'm not suicidal but I want to die' → Haiku fails → safety fallback to crisis", async () => {
      mockClassify.mockResolvedValue(null);
      const result = await detectCrisis("I'm not suicidal but I want to die");

      expect(result.isCrisis).toBe(true); // Conservative fallback
    });
  });

  describe("negated HIGH + Haiku fails (null) → err on caution (crisis)", () => {
    it("negated high + Haiku failure → isCrisis=true (safety fallback)", async () => {
      mockClassify.mockResolvedValue(null);
      const result = await detectCrisis("I'm not suicidal at all");

      expect(result.isCrisis).toBe(true);
      expect(result.haikuResult).toBeNull();
    });
  });

  describe("safe messages → no crisis, no Haiku", () => {
    it("'I had a great day today' → isCrisis=false, fast path", async () => {
      const result = await detectCrisis("I had a great day today!");

      expect(result.isCrisis).toBe(false);
      expect(result.severity).toBe("low");
      expect(result.stages).toEqual(["keyword"]);
      expect(mockClassify).not.toHaveBeenCalled();
    });
  });

  describe("full conversation replay through pipeline", () => {
    it("processes a 5-turn conversation correctly", async () => {
      const transcript = [
        { text: "I feel really down today", expectCrisis: false },
        { text: "I want to kill myself", expectCrisis: true },
        { text: "I don't want to hurt myself, I'm just venting", expectCrisis: false, haikuResponse: "low" as const },
        { text: "Thanks for listening", expectCrisis: false },
        { text: "marna chahta hun", expectCrisis: true },
      ];

      for (const turn of transcript) {
        mockClassify.mockReset();
        if (turn.haikuResponse) {
          mockClassify.mockResolvedValue(haikuResult(turn.haikuResponse));
        }

        const result = await detectCrisis(turn.text);
        expect(result.isCrisis).toBe(turn.expectCrisis);
      }
    });
  });
});

// ── Section 3: Assessment Signal Detection ─────────────────────────
// We need to mock heavy imports from sessions.ts to isolate the pure function.

// Mock all heavy dependencies that sessions.ts imports
vi.mock("../../src/db/index.js", () => ({
  db: {},
}));
vi.mock("../../src/env.js", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    GROQ_API_KEY: undefined,
    PORT: 3000,
    NODE_ENV: "test",
  },
}));
vi.mock("../../src/db/schema/index", () => ({
  sessions: {},
  messages: {},
  sessionSummaries: {},
  assessments: {},
}));
vi.mock("../../src/db/helpers.js", () => ({
  getOrCreateUser: vi.fn(),
}));
vi.mock("../../src/crisis/index.js", () => ({
  detectCrisis: vi.fn(),
}));
vi.mock("../../src/sse/emitter.js", () => ({
  sessionEmitter: { emit: vi.fn(), subscribe: vi.fn() },
}));
vi.mock("../../src/sdk/session-manager.js", () => ({
  createSdkSession: vi.fn(),
  sendMessage: vi.fn(),
  endSdkSession: vi.fn(),
  loadSkillFiles: vi.fn().mockReturnValue(new Map()),
  selectRelevantSkills: vi.fn().mockReturnValue([]),
  injectSessionContext: vi.fn(),
  isSessionActive: vi.fn(),
  spawnClaudeStreaming: vi.fn(),
}));
vi.mock("../../src/services/memory-client.js", () => ({
  getAllMemories: vi.fn(),
  searchMemories: vi.fn().mockResolvedValue([]),
  addMemoriesAsync: vi.fn(),
  summarizeSessionAsync: vi.fn(),
}));
vi.mock("../../src/routes/journey.js", () => ({
  invalidateInsightsCache: vi.fn(),
}));
vi.mock("../../src/services/formulation-service.js", () => ({
  generateAndPersistFormulation: vi.fn(),
  getLatestFormulation: vi.fn().mockResolvedValue(null),
}));

import { detectAssessmentSignals } from "../routes/sessions.js";

describe("Golden Replay — Assessment Signal Detection", () => {
  describe("depressive conversation → PHQ-9 detection", () => {
    const depressiveConversation = [
      { role: "user", content: "I have been feeling really sad and down lately, everything feels empty" },
      { role: "assistant", content: "I hear you. Can you tell me more about what you've been experiencing?" },
      { role: "user", content: "I have no energy at all, I am so tired and exhausted all the time. It has been going on for weeks" },
      { role: "assistant", content: "That sounds really tough. How has your sleep been?" },
      { role: "user", content: "I can't sleep at night and I have lost my appetite completely" },
      { role: "assistant", content: "I appreciate you sharing that. Are there activities you used to enjoy?" },
      { role: "user", content: "I have lost interest in everything. Nothing excites me anymore. I feel worthless and guilty all the time" },
      { role: "assistant", content: "Those feelings are valid. Have you noticed any changes in your ability to focus?" },
      { role: "user", content: "I can't concentrate on anything. My brain feels foggy and I've been really sluggish" },
      { role: "assistant", content: "Thank you for being so open with me." },
      { role: "user", content: "I've been withdrawing from everyone. I stopped going out and I don't meet anyone anymore" },
      { role: "assistant", content: "Isolation can make things harder. I'm glad you're talking to me." },
    ];

    it("detects PHQ-9 score >= 3", () => {
      const signals = detectAssessmentSignals(depressiveConversation);
      expect(signals.phq9Score).toBeGreaterThanOrEqual(3);
    });

    it("detects evidence across >= 2 messages", () => {
      const signals = detectAssessmentSignals(depressiveConversation);
      expect(signals.evidenceMessages).toBeGreaterThanOrEqual(2);
    });

    it("would qualify for PHQ-9 assessment suggestion (score>=3 && evidence>=2)", () => {
      const signals = detectAssessmentSignals(depressiveConversation);
      expect(signals.phq9Score >= 3 && signals.evidenceMessages >= 2).toBe(true);
    });
  });

  describe("anxiety conversation → GAD-7 detection", () => {
    const anxiousConversation = [
      { role: "user", content: "I keep worrying about everything and I can't stop thinking about it" },
      { role: "assistant", content: "Tell me more about these worries." },
      { role: "user", content: "My mind won't stop racing. I overthink everything and can't relax at all" },
      { role: "assistant", content: "That sounds exhausting." },
      { role: "user", content: "I feel so on edge constantly. My heart keeps racing and I'm trembling" },
      { role: "assistant", content: "Physical symptoms can be really distressing." },
      { role: "user", content: "I am so irritable and afraid something awful will happen. I feel out of control" },
      { role: "assistant", content: "Those are understandable reactions. Let's work through this together." },
    ];

    it("detects GAD-7 score >= 3", () => {
      const signals = detectAssessmentSignals(anxiousConversation);
      expect(signals.gad7Score).toBeGreaterThanOrEqual(3);
    });

    it("detects evidence across >= 2 messages", () => {
      const signals = detectAssessmentSignals(anxiousConversation);
      expect(signals.evidenceMessages).toBeGreaterThanOrEqual(2);
    });

    it("would qualify for GAD-7 assessment suggestion", () => {
      const signals = detectAssessmentSignals(anxiousConversation);
      expect(signals.gad7Score >= 3 && signals.evidenceMessages >= 2).toBe(true);
    });
  });

  describe("neutral conversation → no assessment signals", () => {
    const neutralConversation = [
      { role: "user", content: "I had a good day today at work" },
      { role: "assistant", content: "That is great to hear!" },
      { role: "user", content: "Yeah, I finished a project and my boss was happy with the results" },
      { role: "assistant", content: "That must feel rewarding." },
      { role: "user", content: "I am going to cook dinner for my family tonight, maybe try a new recipe" },
      { role: "assistant", content: "Sounds lovely. What are you thinking of making?" },
      { role: "user", content: "Probably pasta, my kids love it. We had a fun outing together recently" },
      { role: "assistant", content: "Family time is wonderful." },
    ];

    it("PHQ-9 score is 0", () => {
      const signals = detectAssessmentSignals(neutralConversation);
      expect(signals.phq9Score).toBe(0);
    });

    it("GAD-7 score is 0", () => {
      const signals = detectAssessmentSignals(neutralConversation);
      expect(signals.gad7Score).toBe(0);
    });

    it("evidence messages is 0", () => {
      const signals = detectAssessmentSignals(neutralConversation);
      expect(signals.evidenceMessages).toBe(0);
    });
  });

  describe("mixed conversation → correctly separates PHQ-9 from GAD-7", () => {
    const mixedConversation = [
      { role: "user", content: "I've been feeling sad and depressed" },
      { role: "assistant", content: "I'm sorry to hear that." },
      { role: "user", content: "But I'm also worried about everything, anxiety is killing me" },
      { role: "assistant", content: "That's a lot to carry." },
      { role: "user", content: "I can't sleep and I have no energy. My appetite is gone too" },
      { role: "assistant", content: "Sleep and appetite changes can be really hard." },
      { role: "user", content: "And the racing thoughts won't stop. I'm so irritable and on edge" },
      { role: "assistant", content: "Let's talk through some of this." },
    ];

    it("detects both PHQ-9 and GAD-7 signals", () => {
      const signals = detectAssessmentSignals(mixedConversation);
      expect(signals.phq9Score).toBeGreaterThanOrEqual(2);
      expect(signals.gad7Score).toBeGreaterThanOrEqual(2);
    });

    it("evidence spans multiple messages", () => {
      const signals = detectAssessmentSignals(mixedConversation);
      expect(signals.evidenceMessages).toBeGreaterThanOrEqual(2);
    });
  });

  describe("single message is insufficient for assessment", () => {
    it("one depressive message gives evidence=1 (below threshold)", () => {
      const singleMsg = [
        { role: "user", content: "I feel sad and I have no energy and I can't sleep" },
      ];
      const signals = detectAssessmentSignals(singleMsg);
      // Multiple indicators in one message → high score but only 1 evidence message
      expect(signals.phq9Score).toBeGreaterThanOrEqual(2);
      expect(signals.evidenceMessages).toBe(1);
    });
  });

  describe("only user messages are analyzed (assistant messages ignored)", () => {
    it("assistant mentioning symptoms does not inflate scores", () => {
      const conversation = [
        { role: "user", content: "I want to talk about my day" },
        { role: "assistant", content: "I hear you might be feeling sad, tired, no energy, can't sleep, worthless, no interest" },
        { role: "user", content: "No, actually I'm doing fine. Just wanted to chat." },
        { role: "assistant", content: "That's great to hear!" },
      ];
      const signals = detectAssessmentSignals(conversation);
      // Only user messages are checked, and user messages are neutral
      expect(signals.phq9Score).toBe(0);
      expect(signals.gad7Score).toBe(0);
    });
  });
});

// ── Section 4: Crisis Response Content Validation ──────────────────
// Validates that hard-coded crisis responses contain the required helplines.

import { getCrisisResponse } from "../crisis/crisis-response.js";

describe("Golden Replay — Crisis Response Integrity", () => {
  it("high severity response includes all 3 helplines", () => {
    const response = getCrisisResponse("high");
    expect(response.helplines).toHaveLength(3);

    const numbers = response.helplines.map((h) => h.number);
    expect(numbers).toContain("988");
    expect(numbers).toContain("9152987821");
    expect(numbers).toContain("1860-2662-345");
  });

  it("medium severity response includes all 3 helplines", () => {
    const response = getCrisisResponse("medium");
    expect(response.helplines).toHaveLength(3);
  });

  it("high severity response contains 'wellness companion' framing", () => {
    const response = getCrisisResponse("high");
    expect(response.message.toLowerCase()).toContain("wellness companion");
  });

  it("high severity response never says 'therapist'", () => {
    const response = getCrisisResponse("high");
    expect(response.message.toLowerCase()).not.toContain("therapist");
  });

  it("medium severity response never says 'therapist'", () => {
    const response = getCrisisResponse("medium");
    expect(response.message.toLowerCase()).not.toContain("therapist");
  });

  it("response message is non-empty for all severity levels", () => {
    for (const severity of ["high", "medium", "low"] as const) {
      const response = getCrisisResponse(severity);
      expect(response.message.length).toBeGreaterThan(0);
    }
  });
});
