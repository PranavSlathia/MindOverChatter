import { describe, expect, it } from "vitest";
import { getCrisisResponse } from "../crisis-response.js";
import type { HaikuRiskLevel, KeywordSeverity } from "../types.js";

// ═══════════════════════════════════════════════════════════════
// Crisis Response Tests — Hard-coded responses validation
// ═══════════════════════════════════════════════════════════════

describe("crisis-response", () => {
  // ── Helpline Validation ──────────────────────────────────────
  describe("helpline numbers are present", () => {
    const severities: Array<KeywordSeverity | HaikuRiskLevel> = [
      "high",
      "medium",
      "low",
      "crisis",
      "elevated",
      "none",
    ];

    it.each(severities)(
      'response for severity "%s" includes all 3 helplines',
      (severity) => {
        const response = getCrisisResponse(severity);
        expect(response.helplines).toHaveLength(3);

        // 988 Suicide & Crisis Lifeline
        const h988 = response.helplines.find((h) => h.number === "988");
        expect(h988).toBeDefined();
        expect(h988?.country).toBe("US");

        // iCall
        const iCall = response.helplines.find((h) => h.number === "9152987821");
        expect(iCall).toBeDefined();
        expect(iCall?.name).toBe("iCall");
        expect(iCall?.country).toBe("IN");

        // Vandrevala Foundation
        const vandrevala = response.helplines.find((h) => h.number === "1860-2662-345");
        expect(vandrevala).toBeDefined();
        expect(vandrevala?.name).toBe("Vandrevala Foundation");
        expect(vandrevala?.country).toBe("IN");
      },
    );
  });

  // ── Message Content Validation ──────────────────────────────
  describe("response messages are non-empty strings", () => {
    it("high severity response message is a non-empty string", () => {
      const response = getCrisisResponse("high");
      expect(typeof response.message).toBe("string");
      expect(response.message.length).toBeGreaterThan(0);
    });

    it("medium severity response message is a non-empty string", () => {
      const response = getCrisisResponse("medium");
      expect(typeof response.message).toBe("string");
      expect(response.message.length).toBeGreaterThan(0);
    });

    it("low severity response message is a non-empty string", () => {
      const response = getCrisisResponse("low");
      expect(typeof response.message).toBe("string");
      expect(response.message.length).toBeGreaterThan(0);
    });

    it("crisis (haiku) severity response message is a non-empty string", () => {
      const response = getCrisisResponse("crisis");
      expect(typeof response.message).toBe("string");
      expect(response.message.length).toBeGreaterThan(0);
    });

    it("elevated (haiku) severity response message is a non-empty string", () => {
      const response = getCrisisResponse("elevated");
      expect(typeof response.message).toBe("string");
      expect(response.message.length).toBeGreaterThan(0);
    });
  });

  // ── Wellness Companion Framing ──────────────────────────────
  describe("framing — uses 'wellness companion', not 'therapist'", () => {
    it("high severity message includes 'wellness companion'", () => {
      const response = getCrisisResponse("high");
      expect(response.message.toLowerCase()).toContain("wellness companion");
    });

    it("medium severity message includes 'wellness companion'", () => {
      const response = getCrisisResponse("medium");
      expect(response.message.toLowerCase()).toContain("wellness companion");
    });

    it("high severity message does NOT say 'therapist'", () => {
      const response = getCrisisResponse("high");
      expect(response.message.toLowerCase()).not.toContain("i am a therapist");
      expect(response.message.toLowerCase()).not.toContain("as your therapist");
      expect(response.message.toLowerCase()).not.toContain("this therapist");
    });

    it("medium severity message does NOT say 'therapist'", () => {
      const response = getCrisisResponse("medium");
      expect(response.message.toLowerCase()).not.toContain("i am a therapist");
      expect(response.message.toLowerCase()).not.toContain("as your therapist");
      expect(response.message.toLowerCase()).not.toContain("this therapist");
    });
  });

  // ── Helpline Numbers in Message Text ────────────────────────
  describe("helpline numbers appear in message text", () => {
    it("high severity message text contains 988", () => {
      const response = getCrisisResponse("high");
      expect(response.message).toContain("988");
    });

    it("high severity message text contains 9152987821 (iCall)", () => {
      const response = getCrisisResponse("high");
      expect(response.message).toContain("9152987821");
    });

    it("high severity message text contains 1860-2662-345 (Vandrevala)", () => {
      const response = getCrisisResponse("high");
      expect(response.message).toContain("1860-2662-345");
    });

    it("medium severity message text contains 988", () => {
      const response = getCrisisResponse("medium");
      expect(response.message).toContain("988");
    });

    it("medium severity message text contains 9152987821 (iCall)", () => {
      const response = getCrisisResponse("medium");
      expect(response.message).toContain("9152987821");
    });

    it("medium severity message text contains 1860-2662-345 (Vandrevala)", () => {
      const response = getCrisisResponse("medium");
      expect(response.message).toContain("1860-2662-345");
    });
  });

  // ── Language Detection ───────────────────────────────────────
  describe("language detection — Hinglish/Hindi responses", () => {
    it("2+ Hinglish markers triggers Hindi response (nahi + hoon)", () => {
      const response = getCrisisResponse("high", "main theek nahi hoon");
      // Hindi response contains Hinglish text, not English "I hear you"
      expect(response.message).toContain("aapki");
    });

    it("Devanagari script triggers Hindi response", () => {
      const response = getCrisisResponse("medium", "मुझे मरना है");
      // Hindi MEDIUM response uses "aap" (respectful "you")
      expect(response.message).toContain("aap");
      // Must not be the English response
      expect(response.message).not.toContain("I can hear that");
    });

    it("English-only message returns English response", () => {
      const response = getCrisisResponse("high", "I want to hurt myself");
      expect(response.message).toContain("I hear you");
    });

    it("single Hinglish marker (below threshold) returns English response", () => {
      const response = getCrisisResponse("high", "I feel sad hai");
      // Only 1 marker ("hai") — threshold is 2 — should be English
      expect(response.message).toContain("I hear you");
    });

    it("3 Hinglish markers triggers Hindi response (yaar + mujhe + hai)", () => {
      const response = getCrisisResponse("high", "yaar mujhe bahut bura lag raha hai");
      expect(response.message).toContain("aapki");
    });

    it("Hindi HIGH response contains all three helpline numbers", () => {
      const response = getCrisisResponse("high", "main nahi hoon theek yaar");
      expect(response.message).toContain("9152987821");
      expect(response.message).toContain("1860-2662-345");
      expect(response.message).toContain("988");
    });

    it("Hindi MEDIUM response contains wellness companion framing in Hindi", () => {
      const response = getCrisisResponse("medium", "main nahi hoon theek yaar");
      expect(response.message).toContain("wellness companion");
    });
  });

  // ── Severity Routing ────────────────────────────────────────
  describe("severity routing", () => {
    it('"high" and "crisis" map to the same (high) response message', () => {
      const highResp = getCrisisResponse("high");
      const crisisResp = getCrisisResponse("crisis");
      expect(highResp.message).toBe(crisisResp.message);
    });

    it('"medium", "elevated", "low", "none" map to the medium response message', () => {
      const mediumResp = getCrisisResponse("medium");
      const elevatedResp = getCrisisResponse("elevated");
      const lowResp = getCrisisResponse("low");
      const noneResp = getCrisisResponse("none");
      expect(mediumResp.message).toBe(elevatedResp.message);
      expect(mediumResp.message).toBe(lowResp.message);
      expect(mediumResp.message).toBe(noneResp.message);
    });

    it("high response is different from medium response", () => {
      const highResp = getCrisisResponse("high");
      const mediumResp = getCrisisResponse("medium");
      expect(highResp.message).not.toBe(mediumResp.message);
    });

    it("severity is passed through in the response", () => {
      expect(getCrisisResponse("high").severity).toBe("high");
      expect(getCrisisResponse("medium").severity).toBe("medium");
      expect(getCrisisResponse("crisis").severity).toBe("crisis");
      expect(getCrisisResponse("elevated").severity).toBe("elevated");
      expect(getCrisisResponse("low").severity).toBe("low");
      expect(getCrisisResponse("none").severity).toBe("none");
    });
  });
});
