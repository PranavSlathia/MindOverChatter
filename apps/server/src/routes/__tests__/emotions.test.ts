import { describe, expect, it } from "vitest";
import { EmotionReadingSchema, EmotionChannelSchema } from "@moc/shared";

describe("Emotion validators", () => {
  describe("EmotionChannelSchema", () => {
    it("accepts 'text'", () => {
      expect(EmotionChannelSchema.safeParse("text").success).toBe(true);
    });

    it("accepts 'voice'", () => {
      expect(EmotionChannelSchema.safeParse("voice").success).toBe(true);
    });

    it("accepts 'face'", () => {
      expect(EmotionChannelSchema.safeParse("face").success).toBe(true);
    });

    it("rejects invalid channel", () => {
      expect(EmotionChannelSchema.safeParse("eeg").success).toBe(false);
    });
  });

  describe("EmotionReadingSchema", () => {
    const validReading = {
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      channel: "face" as const,
      emotionLabel: "happy",
      confidence: 0.85,
      signalWeight: 0.3,
    };

    it("accepts a valid face reading without messageId", () => {
      const result = EmotionReadingSchema.safeParse(validReading);
      expect(result.success).toBe(true);
    });

    it("accepts a valid reading with messageId", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        messageId: "660e8400-e29b-41d4-a716-446655440001",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a reading with rawScores", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        rawScores: { happy: 0.85, sad: 0.05, neutral: 0.1 },
      });
      expect(result.success).toBe(true);
    });

    it("accepts a voice reading with prosodyData", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        channel: "voice",
        signalWeight: 0.5,
        prosodyData: {
          pitch_mean: 180.5,
          pitch_std: 25.2,
          energy_mean: 0.6,
          speaking_rate: 3.2,
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing sessionId", () => {
      const { sessionId: _, ...noSession } = validReading;
      expect(EmotionReadingSchema.safeParse(noSession).success).toBe(false);
    });

    it("rejects invalid sessionId (not UUID)", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        sessionId: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing channel", () => {
      const { channel: _, ...noChannel } = validReading;
      expect(EmotionReadingSchema.safeParse(noChannel).success).toBe(false);
    });

    it("rejects empty emotionLabel", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        emotionLabel: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects confidence below 0", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        confidence: -0.1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects confidence above 1", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        confidence: 1.1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects signalWeight below 0", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        signalWeight: -0.1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects signalWeight above 1", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        signalWeight: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it("accepts boundary values (0 and 1)", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
        confidence: 0,
        signalWeight: 1,
      });
      expect(result.success).toBe(true);
    });

    it("strips unknown fields", () => {
      const result = EmotionReadingSchema.safeParse({
        ...validReading,
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
