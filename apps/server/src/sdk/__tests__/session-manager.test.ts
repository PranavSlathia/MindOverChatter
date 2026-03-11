import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryContextItem } from "../session-manager.js";
import {
  assemblePrompt,
  createSdkSession,
  delimit,
  endSdkSession,
  getSessionMessageCount,
  injectSessionContext,
  isSessionActive,
  loadSkillFiles,
  resetSkillCache,
} from "../session-manager.js";

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

    it("creates a session with skill content", async () => {
      const skills = ["# Probing Depression\nEntry signals...", "# Assessment Flow\nGuidelines..."];
      const id = await createSdkSession(undefined, skills);
      expect(isSessionActive(id)).toBe(true);

      // Clean up
      await endSdkSession(id);
    });
  });

  describe("injectSessionContext", () => {
    it("adds a context block to the correct session", async () => {
      const id = await createSdkSession();

      // Should not throw
      injectSessionContext(id, "User just completed PHQ-9 with score 12");

      // Session should still be active
      expect(isSessionActive(id)).toBe(true);

      // Clean up
      await endSdkSession(id);
    });

    it("adds multiple context blocks to the same session", async () => {
      const id = await createSdkSession();

      injectSessionContext(id, "Block 1: PHQ-9 result");
      injectSessionContext(id, "Block 2: emotion reading");
      injectSessionContext(id, "Block 3: webcam status");

      // Session should still be active with no errors
      expect(isSessionActive(id)).toBe(true);

      // Clean up
      await endSdkSession(id);
    });

    it("is a silent no-op for a non-existent session", () => {
      // Should not throw
      expect(() => {
        injectSessionContext("non-existent-session-id", "some context");
      }).not.toThrow();
    });

    it("does not affect other sessions", async () => {
      const id1 = await createSdkSession();
      const id2 = await createSdkSession();

      injectSessionContext(id1, "Context for session 1 only");

      // Both sessions should remain active and unaffected
      expect(isSessionActive(id1)).toBe(true);
      expect(isSessionActive(id2)).toBe(true);

      // Clean up
      await endSdkSession(id1);
      await endSdkSession(id2);
    });
  });

  describe("assemblePrompt", () => {
    it("includes context injections in the correct position", () => {
      const injections = ["PHQ-9 score: 14", "User prefers Hinglish"];
      const prompt = assemblePrompt([], "Hello", undefined, undefined, injections);

      // Context injections should be present
      expect(prompt).toContain("=== Context Injections ===");
      expect(prompt).toContain("---BEGIN CONTEXT_INJECTION_0---");
      expect(prompt).toContain("PHQ-9 score: 14");
      expect(prompt).toContain("---END CONTEXT_INJECTION_0---");
      expect(prompt).toContain("---BEGIN CONTEXT_INJECTION_1---");
      expect(prompt).toContain("User prefers Hinglish");
      expect(prompt).toContain("---END CONTEXT_INJECTION_1---");
      expect(prompt).toContain("=== End Context Injections ===");

      // Context injections should appear BEFORE conversation history position
      // and BEFORE current user message
      const injectionPos = prompt.indexOf("=== Context Injections ===");
      const userMessagePos = prompt.indexOf("---BEGIN CURRENT_USER_MESSAGE---");
      expect(injectionPos).toBeLessThan(userMessagePos);
    });

    it("includes skill content wrapped in delimiters", () => {
      const skills = ["# Probing Depression\nEntry signals for depression"];
      const prompt = assemblePrompt([], "Hello", undefined, skills);

      expect(prompt).toContain("=== Therapeutic Skills ===");
      expect(prompt).toContain("---BEGIN SKILL_0---");
      expect(prompt).toContain("# Probing Depression\nEntry signals for depression");
      expect(prompt).toContain("---END SKILL_0---");
      expect(prompt).toContain("=== End Therapeutic Skills ===");
    });

    it("places skills after memories and before context injections", () => {
      const memories: MemoryContextItem[] = [
        { content: "User likes walks", memoryType: "profile_fact", confidence: 0.9 },
      ];
      const skills = ["# Skill content here"];
      const injections = ["Context injection here"];
      const history = [
        { role: "user" as const, content: "Hi" },
        { role: "assistant" as const, content: "Hello!" },
      ];

      const prompt = assemblePrompt(history, "How are you?", memories, skills, injections);

      const memoryPos = prompt.indexOf("=== Relevant Memory Context ===");
      const skillPos = prompt.indexOf("=== Therapeutic Skills ===");
      const injectionPos = prompt.indexOf("=== Context Injections ===");
      const historyPos = prompt.indexOf("=== Conversation History ===");
      const userMessagePos = prompt.indexOf("---BEGIN CURRENT_USER_MESSAGE---");

      // Order: memories < skills < injections < history < current message
      expect(memoryPos).toBeLessThan(skillPos);
      expect(skillPos).toBeLessThan(injectionPos);
      expect(injectionPos).toBeLessThan(historyPos);
      expect(historyPos).toBeLessThan(userMessagePos);
    });

    it("omits sections that have no content", () => {
      const prompt = assemblePrompt([], "Hello");

      expect(prompt).not.toContain("=== Relevant Memory Context ===");
      expect(prompt).not.toContain("=== Therapeutic Skills ===");
      expect(prompt).not.toContain("=== Context Injections ===");
      expect(prompt).not.toContain("=== Conversation History ===");

      // But the user message is always present
      expect(prompt).toContain("---BEGIN CURRENT_USER_MESSAGE---");
      expect(prompt).toContain("Hello");
    });

    it("handles empty arrays for skills and injections", () => {
      const prompt = assemblePrompt([], "Hello", undefined, [], []);

      expect(prompt).not.toContain("=== Therapeutic Skills ===");
      expect(prompt).not.toContain("=== Context Injections ===");
    });
  });

  describe("delimit", () => {
    it("wraps content with BEGIN and END markers", () => {
      const result = delimit("TEST_LABEL", "some content");
      expect(result).toBe("---BEGIN TEST_LABEL---\nsome content\n---END TEST_LABEL---");
    });

    it("handles multi-line content", () => {
      const result = delimit("MULTI", "line1\nline2\nline3");
      expect(result).toBe("---BEGIN MULTI---\nline1\nline2\nline3\n---END MULTI---");
    });
  });

  describe("loadSkillFiles", () => {
    let tmpDir: string;

    beforeEach(() => {
      // Reset cache before each test to prevent cross-test contamination.
      // NOTE: Both dist/ and src/ tests may share the same module instance
      // in vitest, so we also reset inline within each test body.
      resetSkillCache();
      tmpDir = join(
        tmpdir(),
        `moc-skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      resetSkillCache();
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("loads probing-*.md and assessment-flow.md files", () => {
      resetSkillCache();
      writeFileSync(join(tmpDir, "probing-depression.md"), "# Depression probing");
      writeFileSync(join(tmpDir, "probing-anxiety.md"), "# Anxiety probing");
      writeFileSync(join(tmpDir, "assessment-flow.md"), "# Assessment flow");
      writeFileSync(join(tmpDir, "other-skill.md"), "# Should be ignored");

      const skills = loadSkillFiles(tmpDir);

      expect(skills).toHaveLength(3);
      expect(skills).toContain("# Depression probing");
      expect(skills).toContain("# Anxiety probing");
      expect(skills).toContain("# Assessment flow");
      // other-skill.md should NOT be loaded
      expect(skills).not.toContain("# Should be ignored");
    });

    it("returns empty array for non-existent directory", () => {
      resetSkillCache();
      const skills = loadSkillFiles("/tmp/non-existent-dir-12345");
      expect(skills).toEqual([]);
    });

    it("returns empty array for directory with no matching files", () => {
      resetSkillCache();
      writeFileSync(join(tmpDir, "unrelated.md"), "# Not a skill");
      writeFileSync(join(tmpDir, "readme.md"), "# Readme");

      const skills = loadSkillFiles(tmpDir);
      expect(skills).toEqual([]);
    });

    it("caches results after first call", () => {
      resetSkillCache();
      writeFileSync(join(tmpDir, "probing-grief.md"), "# Grief probing");

      const first = loadSkillFiles(tmpDir);
      expect(first).toHaveLength(1);

      // Add another file — should not be picked up due to caching
      writeFileSync(join(tmpDir, "probing-panic.md"), "# Panic probing");

      const second = loadSkillFiles(tmpDir);
      expect(second).toHaveLength(1);
      expect(second).toBe(first); // Same reference (cached)
    });

    it("returns fresh results after cache reset", () => {
      resetSkillCache();
      writeFileSync(join(tmpDir, "probing-grief.md"), "# Grief probing");

      const first = loadSkillFiles(tmpDir);
      expect(first).toHaveLength(1);

      // Reset cache and add another file
      resetSkillCache();
      writeFileSync(join(tmpDir, "probing-panic.md"), "# Panic probing");

      const second = loadSkillFiles(tmpDir);
      expect(second).toHaveLength(2);
    });
  });
});
