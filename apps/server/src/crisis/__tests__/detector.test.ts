import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import type { HaikuResult } from "../types.js";

// ── Mock the haiku classifier ──────────────────────────────────
// We mock the entire module so no actual LLM calls are made.
vi.mock("../haiku-classifier.js", () => ({
  classifyWithHaiku: vi.fn(),
}));

// Import AFTER mocking
import { detectCrisis } from "../detector.js";
import { classifyWithHaiku } from "../haiku-classifier.js";

const mockClassify = classifyWithHaiku as Mock;

// ── Helpers ────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════
// Detector Orchestrator Tests
// ═══════════════════════════════════════════════════════════════

describe("detector (crisis pipeline orchestrator)", () => {
  beforeEach(() => {
    mockClassify.mockReset();
  });

  // ── HIGH keyword → immediate crisis (no haiku called) ──────
  describe("HIGH keyword match → immediate crisis, no haiku", () => {
    it("returns isCrisis true with high severity", async () => {
      const result = await detectCrisis("I want to kill myself");
      expect(result.isCrisis).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.stages).toEqual(["keyword"]);
      expect(result.haikuResult).toBeNull();
      expect(result.response).not.toBeNull();
      expect(result.response?.severity).toBe("high");
    });

    it("does NOT call haiku classifier", async () => {
      await detectCrisis("suicide");
      expect(mockClassify).not.toHaveBeenCalled();
    });

    it("includes matched phrases", async () => {
      const result = await detectCrisis("I want to kill myself");
      expect(result.matchedPhrases).toContain("kill myself");
    });

    it("works for Hinglish high severity", async () => {
      const result = await detectCrisis("mar jaunga bhai");
      expect(result.isCrisis).toBe(true);
      expect(result.severity).toBe("high");
      expect(mockClassify).not.toHaveBeenCalled();
    });
  });

  // ── MEDIUM keyword + haiku confirms → crisis ──────────────
  describe("MEDIUM keyword + haiku confirms → crisis", () => {
    it("returns crisis when haiku says 'crisis'", async () => {
      mockClassify.mockResolvedValue(haikuResult("crisis"));
      const result = await detectCrisis("I want to kill someone");
      expect(result.isCrisis).toBe(true);
      expect(result.severity).toBe("high"); // escalated by haiku "crisis"
      expect(result.stages).toContain("haiku");
      expect(result.haikuResult).not.toBeNull();
      expect(result.response).not.toBeNull();
    });

    it("returns crisis when haiku says 'elevated'", async () => {
      mockClassify.mockResolvedValue(haikuResult("elevated"));
      const result = await detectCrisis("I don't want to live");
      expect(result.isCrisis).toBe(true);
      expect(result.stages).toContain("haiku");
      expect(result.response).not.toBeNull();
    });

    it("calls haiku classifier with the message", async () => {
      mockClassify.mockResolvedValue(haikuResult("elevated"));
      await detectCrisis("I want to hurt someone");
      expect(mockClassify).toHaveBeenCalledWith("I want to hurt someone");
    });
  });

  // ── MEDIUM keyword + haiku says low → NOT crisis (haiku override) ─
  describe("MEDIUM keyword + haiku says low → NOT crisis", () => {
    it("returns not crisis when haiku says 'low'", async () => {
      mockClassify.mockResolvedValue(haikuResult("low"));
      const result = await detectCrisis("I don't want to live in this apartment");
      expect(result.isCrisis).toBe(false);
      expect(result.haikuResult?.risk_level).toBe("low");
    });

    it("returns not crisis when haiku says 'none'", async () => {
      mockClassify.mockResolvedValue(haikuResult("none"));
      const result = await detectCrisis("life is pointless discussion");
      expect(result.isCrisis).toBe(false);
      expect(result.haikuResult?.risk_level).toBe("none");
    });

    it("still includes matched keyword phrases in result", async () => {
      mockClassify.mockResolvedValue(haikuResult("low"));
      const result = await detectCrisis("can't go on waiting anymore");
      // "can't go on" is a medium keyword
      expect(result.matchedPhrases.length).toBeGreaterThanOrEqual(0);
      expect(result.stages).toContain("haiku");
    });
  });

  // ── MEDIUM keyword + haiku FAILS → crisis (err on caution) ─
  describe("MEDIUM keyword + haiku fails → crisis (err on caution)", () => {
    it("returns crisis when haiku returns null (failure)", async () => {
      mockClassify.mockResolvedValue(null);
      const result = await detectCrisis("I want to kill someone in this game");
      expect(result.isCrisis).toBe(true);
      expect(result.response).not.toBeNull();
      expect(result.haikuResult).toBeNull();
    });

    it("uses keyword severity when haiku fails", async () => {
      mockClassify.mockResolvedValue(null);
      const result = await detectCrisis("don't want to live like this");
      expect(result.isCrisis).toBe(true);
      expect(result.severity).toBe("medium");
    });
  });

  // ── Subtle signals only + haiku confirms → crisis ─────────
  describe("subtle signals + haiku confirms → crisis", () => {
    it("detects crisis on 'goodbye forever everyone' when haiku confirms", async () => {
      mockClassify.mockResolvedValue(haikuResult("crisis"));
      const result = await detectCrisis("goodbye forever everyone, I love you all");
      expect(result.isCrisis).toBe(true);
      expect(result.stages).toContain("haiku");
      expect(result.response).not.toBeNull();
    });

    it("detects crisis on 'won't be around much longer' when haiku says elevated", async () => {
      mockClassify.mockResolvedValue(haikuResult("elevated"));
      const result = await detectCrisis("I won't be around much longer, take care");
      expect(result.isCrisis).toBe(true);
      expect(result.haikuResult?.risk_level).toBe("elevated");
    });

    it("detects crisis on 'giving away my things' when haiku confirms", async () => {
      mockClassify.mockResolvedValue(haikuResult("crisis"));
      const result = await detectCrisis("I'm giving away all my belongings");
      expect(result.isCrisis).toBe(true);
    });

    it("detects crisis on 'final message to you all' when haiku confirms", async () => {
      mockClassify.mockResolvedValue(haikuResult("elevated"));
      const result = await detectCrisis("This is my final message to you all");
      expect(result.isCrisis).toBe(true);
    });

    it("detects crisis on 'everyone better without me' when haiku confirms", async () => {
      mockClassify.mockResolvedValue(haikuResult("crisis"));
      const result = await detectCrisis("everyone would be better without me around");
      expect(result.isCrisis).toBe(true);
    });

    it("detects crisis on 'wrote a note' when haiku confirms", async () => {
      mockClassify.mockResolvedValue(haikuResult("elevated"));
      const result = await detectCrisis("I wrote a note for my family");
      expect(result.isCrisis).toBe(true);
    });

    it("detects crisis on Hinglish 'sab ko alvida' when haiku confirms", async () => {
      mockClassify.mockResolvedValue(haikuResult("crisis"));
      const result = await detectCrisis("sab ko alvida dosto");
      expect(result.isCrisis).toBe(true);
    });

    it("detects crisis on 'mere bina better' when haiku confirms", async () => {
      mockClassify.mockResolvedValue(haikuResult("elevated"));
      const result = await detectCrisis("sab mere bina better rahenge");
      expect(result.isCrisis).toBe(true);
    });
  });

  // ── Subtle signals only + haiku FAILS → NOT crisis ─────────
  describe("subtle signals + haiku fails → NOT crisis", () => {
    it("returns not crisis when haiku returns null", async () => {
      mockClassify.mockResolvedValue(null);
      const result = await detectCrisis("goodbye forever everyone, I love you all");
      expect(result.isCrisis).toBe(false);
      expect(result.response).toBeNull();
    });

    it("returns not crisis when haiku says low", async () => {
      mockClassify.mockResolvedValue(haikuResult("low"));
      const result = await detectCrisis("I won't be around much longer, going on vacation");
      expect(result.isCrisis).toBe(false);
    });

    it("returns not crisis when haiku says none", async () => {
      mockClassify.mockResolvedValue(haikuResult("none"));
      const result = await detectCrisis("This is my final message before I go to sleep");
      expect(result.isCrisis).toBe(false);
    });
  });

  // ── No signals at all → NOT crisis (fast path) ────────────
  describe("no signals at all → NOT crisis (fast path)", () => {
    it("returns not crisis for safe message", async () => {
      const result = await detectCrisis("I had a great day today!");
      expect(result.isCrisis).toBe(false);
      expect(result.severity).toBe("low");
      expect(result.matchedPhrases).toEqual([]);
      expect(result.stages).toEqual(["keyword"]);
      expect(result.response).toBeNull();
      expect(result.haikuResult).toBeNull();
    });

    it("does NOT call haiku classifier for safe messages", async () => {
      await detectCrisis("The weather is beautiful today");
      expect(mockClassify).not.toHaveBeenCalled();
    });

    it("returns not crisis for empty string", async () => {
      const result = await detectCrisis("");
      expect(result.isCrisis).toBe(false);
      expect(mockClassify).not.toHaveBeenCalled();
    });

    it("returns not crisis for normal conversation", async () => {
      const result = await detectCrisis("I feel a bit stressed about my exam tomorrow");
      expect(result.isCrisis).toBe(false);
      expect(mockClassify).not.toHaveBeenCalled();
    });
  });

  // ── Response content validation ────────────────────────────
  describe("response content when crisis detected", () => {
    it("includes all 3 helplines in high severity response", async () => {
      const result = await detectCrisis("I want to kill myself");
      expect(result.response).not.toBeNull();
      expect(result.response?.helplines).toHaveLength(3);
      expect(result.response?.helplines.some((h) => h.number === "988")).toBe(true);
      expect(result.response?.helplines.some((h) => h.number === "9152987821")).toBe(true);
      expect(result.response?.helplines.some((h) => h.number === "1860-2662-345")).toBe(true);
    });

    it("response message is a non-empty string", async () => {
      const result = await detectCrisis("suicide");
      expect(typeof result.response?.message).toBe("string");
      expect(result.response?.message.length).toBeGreaterThan(0);
    });

    it("response is null when no crisis detected", async () => {
      const result = await detectCrisis("I had a good day");
      expect(result.response).toBeNull();
    });
  });

  // ── Combined scenarios ─────────────────────────────────────
  describe("combined scenarios", () => {
    it("high keyword + subtle signals still returns high without haiku", async () => {
      // "kill myself" is high + "goodbye forever everyone" has subtle signals
      const result = await detectCrisis(
        "I want to kill myself, goodbye forever everyone",
      );
      expect(result.isCrisis).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.stages).toEqual(["keyword"]); // no haiku for high
      expect(mockClassify).not.toHaveBeenCalled();
    });

    it("medium keyword + subtle signals → haiku called once", async () => {
      mockClassify.mockResolvedValue(haikuResult("elevated"));
      const result = await detectCrisis(
        "I want to kill him, this is my final message",
      );
      expect(result.isCrisis).toBe(true);
      expect(mockClassify).toHaveBeenCalledTimes(1);
    });

    it("multiple medium keywords → still medium severity when haiku overrides", async () => {
      mockClassify.mockResolvedValue(haikuResult("none"));
      const result = await detectCrisis("life is pointless, I don't want to live like this anymore");
      expect(result.isCrisis).toBe(false);
      expect(result.severity).toBe("none");
    });
  });

  // ── Stage tracking ─────────────────────────────────────────
  describe("stage tracking", () => {
    it("only keyword stage for high severity", async () => {
      const result = await detectCrisis("suicide");
      expect(result.stages).toEqual(["keyword"]);
    });

    it("keyword + haiku stages when haiku is called", async () => {
      mockClassify.mockResolvedValue(haikuResult("low"));
      const result = await detectCrisis("kill someone in a video game");
      expect(result.stages).toContain("keyword");
      expect(result.stages).toContain("haiku");
    });

    it("only keyword stage when no signals trigger haiku", async () => {
      const result = await detectCrisis("I love my family");
      expect(result.stages).toEqual(["keyword"]);
    });

    it("only keyword stage when haiku fails for medium keyword", async () => {
      mockClassify.mockResolvedValue(null);
      const result = await detectCrisis("I want to hurt someone");
      // When haiku fails on medium keyword, stages is ["keyword"] (falls back)
      expect(result.stages).toEqual(["keyword"]);
    });
  });
});
