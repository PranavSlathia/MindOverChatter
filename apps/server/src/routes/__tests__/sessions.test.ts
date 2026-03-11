import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SendMessageSchema, EndSessionSchema } from "@moc/shared";

describe("Session validators", () => {
  describe("SendMessageSchema", () => {
    it("accepts valid text", () => {
      const result = SendMessageSchema.safeParse({ text: "Hello" });
      expect(result.success).toBe(true);
    });

    it("rejects empty text", () => {
      const result = SendMessageSchema.safeParse({ text: "" });
      expect(result.success).toBe(false);
    });

    it("rejects missing text", () => {
      const result = SendMessageSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects text exceeding 10000 characters", () => {
      const longText = "a".repeat(10001);
      const result = SendMessageSchema.safeParse({ text: longText });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]!.code).toBe("too_big");
      }
    });

    it("accepts text at exactly 10000 characters", () => {
      const maxText = "a".repeat(10000);
      const result = SendMessageSchema.safeParse({ text: maxText });
      expect(result.success).toBe(true);
    });

    it("strips unknown fields", () => {
      const result = SendMessageSchema.safeParse({
        text: "Hello",
        voiceEmotion: { label: "happy", confidence: 0.9 },
        extra: "junk",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ text: "Hello" });
      }
    });
  });

  describe("EndSessionSchema", () => {
    it("accepts empty body", () => {
      const result = EndSessionSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts reason string", () => {
      const result = EndSessionSchema.safeParse({ reason: "user_ended" });
      expect(result.success).toBe(true);
    });

    it("accepts missing reason (optional)", () => {
      const result = EndSessionSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reason).toBeUndefined();
      }
    });
  });
});
