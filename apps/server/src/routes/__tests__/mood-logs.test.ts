import { describe, expect, it } from "vitest";
import { CreateMoodLogSchema, MoodSourceSchema } from "@moc/shared";

describe("Mood log validators", () => {
  describe("MoodSourceSchema", () => {
    it("accepts 'user_input'", () => {
      expect(MoodSourceSchema.safeParse("user_input").success).toBe(true);
    });

    it("accepts 'ai_inferred'", () => {
      expect(MoodSourceSchema.safeParse("ai_inferred").success).toBe(true);
    });

    it("accepts 'assessment'", () => {
      expect(MoodSourceSchema.safeParse("assessment").success).toBe(true);
    });

    it("rejects invalid source", () => {
      expect(MoodSourceSchema.safeParse("manual").success).toBe(false);
    });
  });

  describe("CreateMoodLogSchema", () => {
    const validMoodLog = {
      valence: 0.5,
      arousal: 0.7,
      source: "user_input" as const,
    };

    it("accepts a valid mood log without sessionId", () => {
      const result = CreateMoodLogSchema.safeParse(validMoodLog);
      expect(result.success).toBe(true);
    });

    it("accepts a valid mood log with sessionId", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid sessionId (not UUID)", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        sessionId: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing valence", () => {
      const { valence: _, ...noValence } = validMoodLog;
      expect(CreateMoodLogSchema.safeParse(noValence).success).toBe(false);
    });

    it("rejects missing arousal", () => {
      const { arousal: _, ...noArousal } = validMoodLog;
      expect(CreateMoodLogSchema.safeParse(noArousal).success).toBe(false);
    });

    it("rejects missing source", () => {
      const { source: _, ...noSource } = validMoodLog;
      expect(CreateMoodLogSchema.safeParse(noSource).success).toBe(false);
    });

    it("rejects valence below -1", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        valence: -1.1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects valence above 1", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        valence: 1.1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects arousal below 0", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        arousal: -0.1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects arousal above 1", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        arousal: 1.1,
      });
      expect(result.success).toBe(false);
    });

    it("accepts boundary values (-1 valence, 0 arousal)", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        valence: -1,
        arousal: 0,
      });
      expect(result.success).toBe(true);
    });

    it("accepts boundary values (+1 valence, 1 arousal)", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        valence: 1,
        arousal: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts zero valence (neutral)", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        valence: 0,
      });
      expect(result.success).toBe(true);
    });

    it("strips unknown fields", () => {
      const result = CreateMoodLogSchema.safeParse({
        ...validMoodLog,
        userId: "should-be-stripped",
        extra: "junk",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect("userId" in result.data).toBe(false);
        expect("extra" in result.data).toBe(false);
      }
    });
  });
});
