import { describe, expect, it } from "vitest";
import { detectKeywords } from "../keyword-detector.js";

// ── Helper ──────────────────────────────────────────────────────
function expectDetected(message: string, severity: "high" | "medium") {
  const result = detectKeywords(message);
  expect(result.detected, `Expected "${message}" to be detected`).toBe(true);
  expect(result.severity).toBe(severity);
  expect(result.matchedPhrases.length).toBeGreaterThan(0);
  expect(result.stage).toBe("keyword");
}

function expectNotDetected(message: string) {
  const result = detectKeywords(message);
  expect(result.detected, `Expected "${message}" to NOT be detected`).toBe(false);
  expect(result.severity).toBe("low");
  expect(result.matchedPhrases).toEqual([]);
  expect(result.stage).toBe("keyword");
}

// ═══════════════════════════════════════════════════════════════
// HIGH SEVERITY — Suicidal Ideation (English)
// ═══════════════════════════════════════════════════════════════
describe("keyword-detector", () => {
  describe("HIGH severity — suicidal ideation (English)", () => {
    it.each([
      ["kill myself"],
      ["want to die"],
      ["end my life"],
      ["suicide"],
      ["end it all"],
      ["no reason to live"],
      ["better off dead"],
      ["not worth living"],
      ["suicidal"],
      ["take my own life"],
      ["don't want to be alive"],
      ["wish i was dead"],
      ["wish i were dead"],
    ])('detects "%s" as high severity', (phrase) => {
      expectDetected(phrase, "high");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // HIGH SEVERITY — Self-harm
  // ═══════════════════════════════════════════════════════════════
  describe("HIGH severity — self-harm", () => {
    it.each([
      ["cut myself"],
      ["hurt myself"],
      ["self harm"],
      ["self-harm"],
      ["burn myself"],
      ["cutting myself"],
      ["hurting myself"],
    ])('detects "%s" as high severity', (phrase) => {
      expectDetected(phrase, "high");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // HIGH SEVERITY — Immediate danger
  // ═══════════════════════════════════════════════════════════════
  describe("HIGH severity — immediate danger", () => {
    it.each([
      ["I have a gun"],
      ["I have pills"],
      ["standing on the edge"],
      ["about to jump"],
      ["going to jump"],
      ["overdose"],
      ["pull the trigger"],
      ["slit my wrists"],
    ])('detects "%s" as high severity', (phrase) => {
      expectDetected(phrase, "high");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // HIGH SEVERITY — Hinglish suicidal ideation
  // ═══════════════════════════════════════════════════════════════
  describe("HIGH severity — Hinglish suicidal ideation", () => {
    it.each([
      ["mar jaunga"],
      ["mar jaungi"],
      ["jeena nahi hai"],
      ["khatam karna hai"],
      ["zindagi khatam"],
      ["marna chahta"],
      ["marna chahti"],
      ["khudkushi"],
      ["maut chahiye"],
      ["mar jaana chahta"],
      ["mar jaana chahti"],
      ["jaan de dunga"],
      ["jaan de dungi"],
    ])('detects "%s" as high severity', (phrase) => {
      expectDetected(phrase, "high");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MEDIUM SEVERITY — Harm to others
  // ═══════════════════════════════════════════════════════════════
  describe("MEDIUM severity — harm to others", () => {
    it.each([
      ["kill someone"],
      ["hurt someone"],
      ["want to hurt"],
      ["kill him"],
      ["kill her"],
      ["kill them"],
    ])('detects "%s" as medium severity', (phrase) => {
      expectDetected(phrase, "medium");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MEDIUM SEVERITY — Passive ideation / hopelessness
  // ═══════════════════════════════════════════════════════════════
  describe("MEDIUM severity — passive ideation / hopelessness", () => {
    it.each([
      ["don't want to live"],
      ["can't go on"],
      ["no point in living"],
      ["life is pointless"],
      ["I give up on life"],
      ["want it to be over"],
      ["want this to end"],
    ])('detects "%s" as medium severity', (phrase) => {
      expectDetected(phrase, "medium");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MEDIUM SEVERITY — Hinglish passive ideation
  // ═══════════════════════════════════════════════════════════════
  describe("MEDIUM severity — Hinglish passive ideation", () => {
    it.each([
      ["jeene ka mann nahi"],
      ["sab khatam"],
      ["koi fayda nahi"],
    ])('detects "%s" as medium severity', (phrase) => {
      expectDetected(phrase, "medium");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CASE INSENSITIVITY
  // ═══════════════════════════════════════════════════════════════
  describe("case insensitivity", () => {
    it("detects uppercase 'KILL MYSELF' as high", () => {
      expectDetected("KILL MYSELF", "high");
    });

    it("detects mixed case 'Kill MySelf' as high", () => {
      expectDetected("Kill MySelf", "high");
    });

    it("detects uppercase 'SUICIDE' as high", () => {
      expectDetected("SUICIDE", "high");
    });

    it("detects mixed case 'Want To Die' as high", () => {
      expectDetected("Want To Die", "high");
    });

    it("detects uppercase 'SELF-HARM' as high", () => {
      expectDetected("SELF-HARM", "high");
    });

    it("detects uppercase Hinglish 'KHUDKUSHI' as high", () => {
      expectDetected("KHUDKUSHI", "high");
    });

    it("detects uppercase 'KILL SOMEONE' as medium", () => {
      expectDetected("KILL SOMEONE", "medium");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHRASES EMBEDDED IN LONGER SENTENCES
  // ═══════════════════════════════════════════════════════════════
  describe("phrases embedded in longer sentences", () => {
    it("detects 'I want to kill myself right now' as high", () => {
      expectDetected("I want to kill myself right now", "high");
    });

    it("detects 'I just want to die already' as high", () => {
      expectDetected("I just want to die already", "high");
    });

    it("detects 'I've been thinking about suicide lately' as high", () => {
      expectDetected("I've been thinking about suicide lately", "high");
    });

    it("detects 'Sometimes I feel like there's no reason to live' as high", () => {
      expectDetected("Sometimes I feel like there's no reason to live", "high");
    });

    it("detects 'mar jaunga bhai' (Hinglish in sentence) as high", () => {
      expectDetected("mar jaunga bhai", "high");
    });

    it("detects 'jeena nahi hai yaar' (Hinglish in sentence) as high", () => {
      expectDetected("jeena nahi hai yaar", "high");
    });

    it("detects 'bhai mujhe khudkushi karni hai' (Hinglish embedded) as high", () => {
      expectDetected("bhai mujhe khudkushi karni hai", "high");
    });

    it("detects 'I really want to hurt someone badly' as medium", () => {
      expectDetected("I really want to hurt someone badly", "medium");
    });

    it("detects 'I don't want to live anymore you know' as medium", () => {
      expectDetected("I don't want to live anymore you know", "medium");
    });

    it("detects 'feels like life is pointless at this stage' as medium", () => {
      expectDetected("feels like life is pointless at this stage", "medium");
    });

    it("detects 'mujhe lagta hai sab khatam ho gaya' as medium", () => {
      expectDetected("mujhe lagta hai sab khatam ho gaya", "medium");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MIXED LANGUAGE MESSAGES
  // ═══════════════════════════════════════════════════════════════
  describe("mixed language messages", () => {
    it("detects 'I am feeling really bad, mar jaunga' as high", () => {
      expectDetected("I am feeling really bad, mar jaunga", "high");
    });

    it("detects 'Zindagi khatam, there is nothing left for me' as high", () => {
      expectDetected("Zindagi khatam, there is nothing left for me", "high");
    });

    it("detects 'My life sucks and jeena nahi hai anymore' as high", () => {
      expectDetected("My life sucks and jeena nahi hai anymore", "high");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEVERITY ESCALATION (multiple matches)
  // ═══════════════════════════════════════════════════════════════
  describe("severity escalation with multiple matches", () => {
    it("escalates to high when both high and medium phrases present", () => {
      const result = detectKeywords("I want to kill myself and also hurt someone");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.matchedPhrases.length).toBeGreaterThan(1);
    });

    it("stays medium when only medium phrases present", () => {
      const result = detectKeywords("I want to hurt someone and kill them");
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("medium");
      expect(result.matchedPhrases.length).toBeGreaterThan(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SAFE MESSAGES (no detection)
  // ═══════════════════════════════════════════════════════════════
  describe("safe messages — no detection", () => {
    it.each([
      ["I'm having a good time, no problems here"],
      ["I feel a bit sad today"],
      ["I had a great day at work"],
      ["The weather is nice today"],
      ["I just finished a puzzle and I'm happy"],
      ["My cat is sleeping on my lap"],
      ["Going to the grocery store later"],
      ["I cooked dinner for my family tonight"],
      ["Thank you for listening to me"],
      ["I've been reading a nice book"],
    ])('does NOT detect "%s"', (message) => {
      expectNotDetected(message);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FALSE POSITIVE AVOIDANCE — word boundary checks
  // ═══════════════════════════════════════════════════════════════
  describe("false positive avoidance — word boundary checks", () => {
    it("does NOT detect 'I was discussing killing time at the mall'", () => {
      // "kill" is a substring of "killing" but "kill myself" / "kill someone" etc.
      // shouldn't match here. "killing time" doesn't match any crisis phrase.
      const result = detectKeywords("I was discussing killing time at the mall");
      // None of the exact phrases match: no "kill myself", "kill someone", etc.
      expect(result.matchedPhrases).not.toContain("kill myself");
      expect(result.matchedPhrases).not.toContain("kill someone");
      expect(result.matchedPhrases).not.toContain("kill him");
      expect(result.matchedPhrases).not.toContain("kill her");
      expect(result.matchedPhrases).not.toContain("kill them");
    });

    it("does NOT detect 'discuss' when checking for 'die'", () => {
      expectNotDetected("Let me discuss this with you");
    });

    it("does NOT detect 'burn the midnight oil' for 'burn myself'", () => {
      expectNotDetected("I need to burn the midnight oil tonight");
    });

    it("does NOT detect 'cut the budget' for 'cut myself'", () => {
      expectNotDetected("We need to cut the budget this quarter");
    });

    it("does NOT detect 'hurt feelings' for 'hurt myself'", () => {
      expectNotDetected("My hurt feelings are getting better");
    });

    it("does NOT detect 'the show is over' for 'want it to be over'", () => {
      expectNotDetected("the show is over, let's go home");
    });

    it("does NOT detect 'jump to conclusions' for 'about to jump'", () => {
      expectNotDetected("Don't jump to conclusions about this");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCEPTABLE FALSE POSITIVES
  // ═══════════════════════════════════════════════════════════════
  describe("acceptable false positives (safety over precision)", () => {
    it("detects 'suicide prevention is important' (word 'suicide' matches)", () => {
      const result = detectKeywords("suicide prevention is important");
      expect(result.detected).toBe(true);
      expect(result.matchedPhrases).toContain("suicide");
    });

    it("detects 'overdose of happiness' (word 'overdose' matches)", () => {
      const result = detectKeywords("overdose of happiness");
      expect(result.detected).toBe(true);
      expect(result.matchedPhrases).toContain("overdose");
    });

    it("detects 'the character in the movie was suicidal' (word 'suicidal' matches)", () => {
      const result = detectKeywords("the character in the movie was suicidal");
      expect(result.detected).toBe(true);
      expect(result.matchedPhrases).toContain("suicidal");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════
  describe("edge cases", () => {
    it("returns not detected for empty string", () => {
      expectNotDetected("");
    });

    it("returns not detected for whitespace only", () => {
      expectNotDetected("   ");
    });

    it("detects crisis keyword in a very long message", () => {
      const padding = "This is a very long message about my day. ".repeat(50);
      const message = `${padding} I want to kill myself. ${padding}`;
      expectDetected(message, "high");
    });

    it("detects crisis keyword at the start of a message", () => {
      expectDetected("kill myself is what I'm thinking", "high");
    });

    it("detects crisis keyword at the end of a message", () => {
      expectDetected("I've been thinking about wanting to kill myself", "high");
    });

    it("handles special characters around keywords", () => {
      expectDetected("(suicide)", "high");
      expectDetected("...suicide...", "high");
      expectDetected("suicide!", "high");
      expectDetected("suicide?", "high");
    });

    it("handles newlines with embedded keywords", () => {
      expectDetected("Hello\nI want to kill myself\nPlease help", "high");
    });

    it("handles Hinglish phrases with surrounding punctuation", () => {
      expectDetected("bhai, khudkushi karni hai!", "high");
    });

    it("returns correct stage label", () => {
      const result = detectKeywords("hello there");
      expect(result.stage).toBe("keyword");
    });

    it("returns all matched phrases when multiple match", () => {
      const result = detectKeywords("I want to kill myself, I'm suicidal, want to die");
      expect(result.detected).toBe(true);
      expect(result.matchedPhrases).toContain("kill myself");
      expect(result.matchedPhrases).toContain("suicidal");
      expect(result.matchedPhrases).toContain("want to die");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SPECIFIC REQUESTED EDGE CASES
  // ═══════════════════════════════════════════════════════════════
  describe("specifically requested edge cases", () => {
    it('"I want to kill myself" -> detected, high', () => {
      expectDetected("I want to kill myself", "high");
    });

    it('"KILL MYSELF" -> detected (case insensitive), high', () => {
      expectDetected("KILL MYSELF", "high");
    });

    it('"I was discussing killing time at the mall" -> no crisis phrase match', () => {
      const result = detectKeywords("I was discussing killing time at the mall");
      // No crisis phrase like "kill myself", "kill someone", etc. should match
      const crisisPhrases = ["kill myself", "kill someone", "kill him", "kill her", "kill them"];
      for (const p of crisisPhrases) {
        expect(result.matchedPhrases).not.toContain(p);
      }
    });

    it('"mar jaunga bhai" -> detected (Hinglish), high', () => {
      expectDetected("mar jaunga bhai", "high");
    });

    it('"jeena nahi hai yaar" -> detected (Hinglish), high', () => {
      expectDetected("jeena nahi hai yaar", "high");
    });

    it('"I\'m having a good time, no problems here" -> NOT detected', () => {
      expectNotDetected("I'm having a good time, no problems here");
    });

    it('"khudkushi" -> detected (Hinglish), high', () => {
      expectDetected("khudkushi", "high");
    });

    it('"I feel a bit sad today" -> NOT detected', () => {
      expectNotDetected("I feel a bit sad today");
    });

    it('"suicide prevention is important" -> detected (acceptable false positive)', () => {
      const result = detectKeywords("suicide prevention is important");
      expect(result.detected).toBe(true);
    });

    it('"overdose of happiness" -> detected (acceptable false positive)', () => {
      const result = detectKeywords("overdose of happiness");
      expect(result.detected).toBe(true);
    });

    it("empty string -> NOT detected", () => {
      expectNotDetected("");
    });

    it("very long message with crisis keyword embedded", () => {
      const long = "a ".repeat(500) + "I want to kill myself " + "a ".repeat(500);
      expectDetected(long, "high");
    });
  });
});
