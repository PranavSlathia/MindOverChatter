import { describe, expect, it } from "vitest";
import { detectModeShift } from "../mode-detector.js";

// ── follow_support triggers ───────────────────────────────────────

describe("detectModeShift — follow_support triggers (EN)", () => {
  it.each([
    ["I'm so overwhelmed right now", "overwhelmed"],
    ["I just can't cope anymore", "can't cope"],
    ["I'm breaking down", "breaking down"],
    ["I'm crying and don't know what to do", "crying"],
    ["I'm scared about what's happening", "scared"],
  ])("%s → follow_support (%s)", (msg) => {
    expect(detectModeShift(msg, null)).toBe("follow_support");
  });
});

describe("detectModeShift — follow_support triggers (HI)", () => {
  it.each([
    ["bahut zyada ho gaya mujhe"],
    ["thak gayi hun"],
    ["toot gaya hun"],
    ["dar lag raha hai mujhe"],
    ["bas karo yaar"],
  ])("%s → follow_support", (msg) => {
    expect(detectModeShift(msg, null)).toBe("follow_support");
  });
});

// ── challenge_pattern triggers ───────────────────────────────────

describe("detectModeShift — challenge_pattern triggers (EN)", () => {
  it.each([
    ["I've realized something important today"],
    ["I think I see what's been happening"],
    ["it's making sense now"],
    ["I see a pattern in how I react"],
    ["I've been thinking about this a lot"],
    ["I want to understand why I do this"],
  ])("%s → challenge_pattern", (msg) => {
    expect(detectModeShift(msg, null)).toBe("challenge_pattern");
  });
});

describe("detectModeShift — challenge_pattern triggers (HI)", () => {
  it.each([
    ["ab samajh aa gayi mujhe"],
    ["shayad main galat tha"],
    ["pattern dikh raha hai mujhe"],
    ["main badalna chahta hun"],
  ])("%s → challenge_pattern", (msg) => {
    expect(detectModeShift(msg, null)).toBe("challenge_pattern");
  });
});

// ── distress takes precedence ─────────────────────────────────────

describe("follow_support overrides challenge_pattern", () => {
  it("distress message shifts to follow_support from any mode", () => {
    expect(detectModeShift("I'm overwhelmed", "challenge_pattern")).toBe("follow_support");
    expect(detectModeShift("I'm overwhelmed", "assess_map")).toBe("follow_support");
    expect(detectModeShift("I'm overwhelmed", "consolidate_close")).toBe("follow_support");
  });

  it("returns null when already in follow_support and distress fires again", () => {
    expect(detectModeShift("I'm overwhelmed", "follow_support")).toBeNull();
  });
});

// ── follow_support lock ───────────────────────────────────────────

describe("follow_support lock — blocks challenge_pattern", () => {
  it("does not shift to challenge_pattern when currentMode is follow_support", () => {
    expect(
      detectModeShift("I've realized something", "follow_support"),
    ).toBeNull();
  });

  it("allows challenge_pattern shift from a neutral mode", () => {
    expect(
      detectModeShift("I've realized something", "assess_map"),
    ).toBe("challenge_pattern");
  });
});

// ── authority clamp ───────────────────────────────────────────────

describe("authority clamp", () => {
  it("blocks challenge_pattern when directiveAuthority is 'low'", () => {
    expect(
      detectModeShift("I've realized something", null, "low"),
    ).toBeNull();
  });

  it("allows challenge_pattern when directiveAuthority is 'medium'", () => {
    expect(
      detectModeShift("I've realized something", null, "medium"),
    ).toBe("challenge_pattern");
  });

  it("allows challenge_pattern when directiveAuthority is 'high'", () => {
    expect(
      detectModeShift("I've realized something", null, "high"),
    ).toBe("challenge_pattern");
  });

  it("authority clamp does NOT affect follow_support (distress overrides)", () => {
    expect(
      detectModeShift("I'm overwhelmed", null, "low"),
    ).toBe("follow_support");
  });
});

// ── already in target mode ────────────────────────────────────────

describe("no-op when already in target mode", () => {
  it("returns null when already in challenge_pattern", () => {
    expect(
      detectModeShift("I've realized something", "challenge_pattern"),
    ).toBeNull();
  });
});

// ── no trigger ───────────────────────────────────────────────────

describe("no trigger", () => {
  it("returns null for a neutral message", () => {
    expect(detectModeShift("How was your day?", null)).toBeNull();
    expect(detectModeShift("I'm fine, just checking in", "assess_map")).toBeNull();
  });
});
