import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SERVER_SRC = "/Users/pronav/Documents/Vibecode/Therapy/apps/server/src";

function readSrc(rel: string): string {
  return readFileSync(resolve(SERVER_SRC, rel), "utf-8");
}

// ── Helpers ───────────────────────────────────────────────────────
// Extracts all `import { ... } from "..."` and `import "..."` lines.
// We check import lines specifically so comment mentions don't false-positive.

function extractImportLines(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => /^\s*import\s/.test(line));
}

// Files that must NEVER import upsertBlock / generateAndPersistTherapyPlan /
// generateAndPersistFormulation. Only promote.ts may call upsertBlock.
const EXPERIMENT_FILES = [
  "research/experiments/experiment-a-calibration.ts",
  "research/experiments/experiment-b-hypotheses.ts",
  "research/experiments/experiment-c-direction.ts",
  "research/lib/read-only-queries.ts",
  "research/lib/outcome-scorer.ts",
  "research/lib/research-reporter.ts",
];

// ── Isolation invariants ──────────────────────────────────────────

describe("Research sandbox isolation invariants", () => {
  test("only promote.ts may import upsertBlock — no experiment file imports it", () => {
    for (const file of EXPERIMENT_FILES) {
      const content = readSrc(file);
      const importLines = extractImportLines(content).join("\n");
      expect(
        importLines,
        `ISOLATION VIOLATION: ${file} must NOT import upsertBlock in an import statement — only promote.ts is permitted`,
      ).not.toContain("upsertBlock");
    }
  });

  test("no experiment file imports generateAndPersistTherapyPlan", () => {
    for (const file of EXPERIMENT_FILES) {
      const content = readSrc(file);
      const importLines = extractImportLines(content).join("\n");
      expect(
        importLines,
        `ISOLATION VIOLATION: ${file} must NOT import generateAndPersistTherapyPlan`,
      ).not.toContain("generateAndPersistTherapyPlan");
    }
  });

  test("no experiment file imports generateAndPersistFormulation", () => {
    for (const file of EXPERIMENT_FILES) {
      const content = readSrc(file);
      const importLines = extractImportLines(content).join("\n");
      expect(
        importLines,
        `ISOLATION VIOLATION: ${file} must NOT import generateAndPersistFormulation`,
      ).not.toContain("generateAndPersistFormulation");
    }
  });

  test("promote.ts contains all safety guards", () => {
    const content = readSrc("research/lib/promote.ts");

    // Guard 2 — already promoted check (case-insensitive substring in message string)
    expect(content, "promote.ts must contain already-promoted guard message (Guard 2)").toContain(
      "Already promoted",
    );

    // Guard 4 — isSafeCalibration re-check at promote time
    expect(content, "promote.ts must contain isSafeCalibration re-check (Guard 4)").toContain(
      "isSafeCalibration",
    );

    // Guard 4 — sanitizeForPrompt before write
    expect(content, "promote.ts must contain sanitizeForPrompt call (Guard 4)").toContain(
      "sanitizeForPrompt",
    );

    // Guard 3 — must block both 'discard' AND 'insufficient_data'
    expect(
      content,
      "promote.ts Guard 3 must explicitly check 'insufficient_data' (not just discard)",
    ).toContain("insufficient_data");
  });

  test("research routes do not export Hono RPC type AppType / ResearchRoutes", () => {
    const content = readSrc("research/routes/research.ts");

    // The frontend must never see research routes via RPC type inference.
    expect(content, "research.ts must NOT export 'export type ResearchRoutes'").not.toContain(
      "export type ResearchRoutes",
    );

    // Also check for the common AppType pattern used in main routes
    expect(content, "research.ts must NOT export 'export type AppType'").not.toContain(
      "export type AppType",
    );
  });
});

// ── Secondary checks ──────────────────────────────────────────────

describe("Research sandbox — secondary isolation checks", () => {
  test("promote.ts is the only research file that imports upsertBlock", () => {
    const promoteImports = extractImportLines(readSrc("research/lib/promote.ts")).join("\n");
    expect(
      promoteImports,
      "promote.ts must import upsertBlock (it is the designated write gatekeeper)",
    ).toContain("upsertBlock");
  });

  test("experiment-a does not import upsertBlock directly (only in comment)", () => {
    const importLines = extractImportLines(
      readSrc("research/experiments/experiment-a-calibration.ts"),
    ).join("\n");
    expect(importLines).not.toContain("upsertBlock");
  });

  test("experiment-a header comment declares INVARIANT", () => {
    const content = readSrc("research/experiments/experiment-a-calibration.ts");
    expect(content).toContain("INVARIANT");
  });

  test("experiment-b header comment declares INVARIANT", () => {
    const content = readSrc("research/experiments/experiment-b-hypotheses.ts");
    expect(content).toContain("INVARIANT");
  });

  test("experiment-c header comment declares INVARIANT", () => {
    const content = readSrc("research/experiments/experiment-c-direction.ts");
    expect(content).toContain("INVARIANT");
  });

  test("experiment-a writes only to research_calibration_proposals — no memoryBlocks import", () => {
    const importLines = extractImportLines(
      readSrc("research/experiments/experiment-a-calibration.ts"),
    ).join("\n");
    // Checks that experiment-a does NOT import memoryBlocks table directly
    expect(importLines).not.toContain("memoryBlocks");
    // Checks that it DOES write to the research proposals table
    const content = readSrc("research/experiments/experiment-a-calibration.ts");
    expect(content).toContain("researchCalibrationProposals");
  });

  test("experiment-b writes only to research_hypothesis_simulations — no live table writes", () => {
    const importLines = extractImportLines(
      readSrc("research/experiments/experiment-b-hypotheses.ts"),
    ).join("\n");
    expect(importLines).not.toContain("memoryBlocks");
    // Must not update therapy plans (read is OK, update is not)
    const content = readSrc("research/experiments/experiment-b-hypotheses.ts");
    expect(content).not.toContain(".update(therapyPlans");
  });

  test("experiment-c writes only to research_direction_compliance — no live table writes", () => {
    const content = readSrc("research/experiments/experiment-c-direction.ts");
    const importLines = extractImportLines(content).join("\n");
    expect(importLines).not.toContain("memoryBlocks");
    expect(content).not.toContain(".update(therapyPlans");
  });

  test("read-only-queries.ts contains no INSERT, UPDATE, or DELETE statements", () => {
    const content = readSrc("research/lib/read-only-queries.ts");
    // Drizzle ORM write methods
    expect(content).not.toContain(".insert(");
    expect(content).not.toContain(".update(");
    expect(content).not.toContain(".delete(");
  });
});
