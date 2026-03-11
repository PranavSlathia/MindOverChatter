import { describe, expect, it } from "vitest";
import { UpdateUserProfileSchema } from "@moc/shared";

describe("User profile validators", () => {
  describe("UpdateUserProfileSchema", () => {
    it("accepts all fields", () => {
      const result = UpdateUserProfileSchema.safeParse({
        displayName: "Pronav",
        coreTraits: ["empathetic"],
        patterns: ["overthinking at night"],
        goals: ["better sleep"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty body (all fields optional)", () => {
      const result = UpdateUserProfileSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts null displayName (clearing the name)", () => {
      const result = UpdateUserProfileSchema.safeParse({ displayName: null });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBeNull();
      }
    });

    it("accepts empty string displayName", () => {
      const result = UpdateUserProfileSchema.safeParse({ displayName: "" });
      expect(result.success).toBe(true);
    });

    it("rejects displayName exceeding 100 characters", () => {
      const result = UpdateUserProfileSchema.safeParse({
        displayName: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("accepts displayName at exactly 100 characters", () => {
      const result = UpdateUserProfileSchema.safeParse({
        displayName: "a".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty arrays for list fields", () => {
      const result = UpdateUserProfileSchema.safeParse({
        coreTraits: [],
        patterns: [],
        goals: [],
      });
      expect(result.success).toBe(true);
    });

    it("strips unknown fields", () => {
      const result = UpdateUserProfileSchema.safeParse({
        displayName: "Test",
        profileEmbedding: [0.1, 0.2],
        extra: "junk",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect("profileEmbedding" in result.data).toBe(false);
        expect("extra" in result.data).toBe(false);
      }
    });

    it("null round-trips: validator output preserves null displayName", () => {
      const input = { displayName: null, goals: ["sleep better"] };
      const result = UpdateUserProfileSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBeNull();
        expect(result.data.goals).toEqual(["sleep better"]);
      }
    });
  });
});
