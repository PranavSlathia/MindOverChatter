import { describe, expect, it } from "vitest";

/**
 * Profile page logic tests.
 *
 * These test the pure-logic concerns of the profile page without DOM rendering,
 * since jsdom/happy-dom worker setup fails on Node 20 + Vitest 4.
 *
 * Tests cover: dirty-state detection, save payload construction, null handling.
 */

// ── Extracted logic from ProfilePage ──────────────────────────────

interface ProfileState {
  displayName: string;
  goals: string[];
  coreTraits: string[];
  patterns: string[];
}

interface ServerProfile {
  displayName: string | null;
  goals: string[] | null;
  coreTraits: string[] | null;
  patterns: string[] | null;
}

/** Mirrors ProfilePage dirty-state check */
function hasChanges(form: ProfileState, server: ServerProfile): boolean {
  return (
    form.displayName !== (server.displayName ?? "") ||
    JSON.stringify(form.goals) !== JSON.stringify(server.goals ?? []) ||
    JSON.stringify(form.coreTraits) !== JSON.stringify(server.coreTraits ?? []) ||
    JSON.stringify(form.patterns) !== JSON.stringify(server.patterns ?? [])
  );
}

/** Mirrors ProfilePage save payload construction */
function buildSavePayload(form: ProfileState) {
  return {
    displayName: form.displayName.trim() || null,
    goals: form.goals,
    coreTraits: form.coreTraits,
    patterns: form.patterns,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("Profile dirty-state detection", () => {
  const serverProfile: ServerProfile = {
    displayName: "Pronav",
    goals: ["better sleep"],
    coreTraits: ["empathetic"],
    patterns: ["overthinking"],
  };

  it("no changes detected when form matches server", () => {
    const form: ProfileState = {
      displayName: "Pronav",
      goals: ["better sleep"],
      coreTraits: ["empathetic"],
      patterns: ["overthinking"],
    };
    expect(hasChanges(form, serverProfile)).toBe(false);
  });

  it("detects name change", () => {
    const form: ProfileState = {
      displayName: "New Name",
      goals: ["better sleep"],
      coreTraits: ["empathetic"],
      patterns: ["overthinking"],
    };
    expect(hasChanges(form, serverProfile)).toBe(true);
  });

  it("detects name cleared (empty string vs server value)", () => {
    const form: ProfileState = {
      displayName: "",
      goals: ["better sleep"],
      coreTraits: ["empathetic"],
      patterns: ["overthinking"],
    };
    expect(hasChanges(form, serverProfile)).toBe(true);
  });

  it("handles server null displayName correctly (no false dirty)", () => {
    const nullNameProfile: ServerProfile = { ...serverProfile, displayName: null };
    const form: ProfileState = {
      displayName: "",
      goals: ["better sleep"],
      coreTraits: ["empathetic"],
      patterns: ["overthinking"],
    };
    // Empty string should match null (both mean "no name")
    expect(hasChanges(form, nullNameProfile)).toBe(false);
  });

  it("detects goal added", () => {
    const form: ProfileState = {
      displayName: "Pronav",
      goals: ["better sleep", "exercise"],
      coreTraits: ["empathetic"],
      patterns: ["overthinking"],
    };
    expect(hasChanges(form, serverProfile)).toBe(true);
  });

  it("detects goal removed", () => {
    const form: ProfileState = {
      displayName: "Pronav",
      goals: [],
      coreTraits: ["empathetic"],
      patterns: ["overthinking"],
    };
    expect(hasChanges(form, serverProfile)).toBe(true);
  });

  it("handles server null arrays (no false dirty)", () => {
    const nullArrayProfile: ServerProfile = {
      displayName: "Pronav",
      goals: null,
      coreTraits: null,
      patterns: null,
    };
    const form: ProfileState = {
      displayName: "Pronav",
      goals: [],
      coreTraits: [],
      patterns: [],
    };
    // Empty arrays should match null (both mean "no items")
    expect(hasChanges(form, nullArrayProfile)).toBe(false);
  });
});

describe("Profile save payload construction", () => {
  it("sends null when display name is cleared", () => {
    const form: ProfileState = {
      displayName: "",
      goals: ["sleep"],
      coreTraits: [],
      patterns: [],
    };
    const payload = buildSavePayload(form);
    expect(payload.displayName).toBeNull();
  });

  it("sends null when display name is only whitespace", () => {
    const form: ProfileState = {
      displayName: "   ",
      goals: [],
      coreTraits: [],
      patterns: [],
    };
    const payload = buildSavePayload(form);
    expect(payload.displayName).toBeNull();
  });

  it("trims display name before sending", () => {
    const form: ProfileState = {
      displayName: "  Pronav  ",
      goals: [],
      coreTraits: [],
      patterns: [],
    };
    const payload = buildSavePayload(form);
    expect(payload.displayName).toBe("Pronav");
  });

  it("preserves list fields as-is", () => {
    const form: ProfileState = {
      displayName: "Test",
      goals: ["a", "b"],
      coreTraits: ["c"],
      patterns: [],
    };
    const payload = buildSavePayload(form);
    expect(payload.goals).toEqual(["a", "b"]);
    expect(payload.coreTraits).toEqual(["c"]);
    expect(payload.patterns).toEqual([]);
  });

  it("null displayName round-trips through validator", async () => {
    const { UpdateUserProfileSchema } = await import("@moc/shared");
    const payload = buildSavePayload({
      displayName: "",
      goals: ["sleep better"],
      coreTraits: [],
      patterns: [],
    });

    expect(payload.displayName).toBeNull();

    const result = UpdateUserProfileSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBeNull();
    }
  });
});
