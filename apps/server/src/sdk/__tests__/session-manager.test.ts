import { describe, expect, it } from "vitest";
import { createSdkSession, endSdkSession, getSessionMessageCount, isSessionActive } from "../session-manager.js";
import type { MemoryContextItem } from "../session-manager.js";

describe("SDK Session Manager", () => {
  describe("session lifecycle", () => {
    it("creates a session and returns a UUID", async () => {
      const id = await createSdkSession();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(isSessionActive(id)).toBe(true);
      expect(getSessionMessageCount(id)).toBe(0);

      // Clean up
      await endSdkSession(id);
    });

    it("ends a session and cleans up", async () => {
      const id = await createSdkSession();
      expect(isSessionActive(id)).toBe(true);

      await endSdkSession(id);
      expect(isSessionActive(id)).toBe(false);
      expect(getSessionMessageCount(id)).toBe(0);
    });

    it("ending a non-existent session is a no-op", async () => {
      // Should not throw
      await endSdkSession("non-existent-id");
    });

    it("creates a session with initial memories", async () => {
      const memories: MemoryContextItem[] = [
        { content: "User's name is Priya", memoryType: "profile_fact", confidence: 0.92 },
        { content: "User wants to reduce anxiety", memoryType: "goal", confidence: 0.85 },
      ];

      const id = await createSdkSession(memories);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(isSessionActive(id)).toBe(true);

      // Clean up
      await endSdkSession(id);
    });

    it("creates a session without memories (undefined)", async () => {
      const id = await createSdkSession(undefined);
      expect(isSessionActive(id)).toBe(true);

      // Clean up
      await endSdkSession(id);
    });

    it("creates a session without memories (no arg)", async () => {
      const id = await createSdkSession();
      expect(isSessionActive(id)).toBe(true);

      // Clean up
      await endSdkSession(id);
    });
  });
});
