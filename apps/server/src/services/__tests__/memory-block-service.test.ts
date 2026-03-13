// ── vi.mock calls MUST be declared before any imports ─────────────

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _eq: args })),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  asc: vi.fn((col: unknown) => ({ _asc: col })),
  sql: vi.fn(() => "now()"),
}));

vi.mock("../../db/schema/index.js", () => ({
  memoryBlocks: {},
}));

vi.mock("@moc/shared", () => ({
  MemoryBlockLabelSchema: {
    options: [
      "user/overview",
      "user/goals",
      "user/triggers",
      "user/coping_strategies",
      "user/relationships",
      "companion/therapeutic_calibration",
    ] as const,
  },
}));

// ── Imports after mocks ───────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  upsertBlock,
  getBlocksForUser,
  seedEmptyBlocks,
  MEMORY_BLOCK_LABELS,
  BLOCK_CHAR_LIMITS,
} from "../memory-block-service.js";

// ── Mock db builder helper ────────────────────────────────────────

function makeMockDb(returnRows: unknown[] = []) {
  const mockReturning = vi.fn(() => Promise.resolve(returnRows));
  const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
  const mockOnConflictDoNothing = vi.fn(() => Promise.resolve());
  const mockValues = vi.fn(() => ({
    onConflictDoUpdate: mockOnConflictDoUpdate,
    onConflictDoNothing: mockOnConflictDoNothing,
  }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  const mockOrderBy = vi.fn(() => Promise.resolve(returnRows));
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return {
    db: { insert: mockInsert, select: mockSelect } as any,
    mocks: {
      mockInsert,
      mockValues,
      mockOnConflictDoUpdate,
      mockOnConflictDoNothing,
      mockReturning,
      mockSelect,
      mockFrom,
      mockWhere,
      mockOrderBy,
    },
  };
}

// ── Test suites ───────────────────────────────────────────────────

describe("memory-block-service", () => {

  // ── Group 1: upsertBlock char limit enforcement ───────────────

  describe("upsertBlock — char limit enforcement", () => {
    it("resolves successfully when content is exactly 500 chars for user/overview", async () => {
      const row = {
        id: "block-1",
        userId: "u1",
        label: "user/overview" as const,
        content: "x".repeat(500),
        charLimit: 500,
        updatedBy: "system",
        sourceSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { db } = makeMockDb([row]);

      await expect(
        upsertBlock(db, {
          userId: "u1",
          label: "user/overview",
          content: "x".repeat(500),
        }),
      ).resolves.not.toThrow();
    });

    it("throws when content is 501 chars for user/overview", async () => {
      // db is not exercised — the throw happens before any DB call
      const { db } = makeMockDb();

      await expect(
        upsertBlock(db, {
          userId: "u1",
          label: "user/overview",
          content: "x".repeat(501),
        }),
      ).rejects.toThrow("exceeds limit");
    });

    it("resolves successfully when content is exactly 800 chars for companion/therapeutic_calibration", async () => {
      const row = {
        id: "block-2",
        userId: "u1",
        label: "companion/therapeutic_calibration" as const,
        content: "y".repeat(800),
        charLimit: 800,
        updatedBy: "system",
        sourceSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { db } = makeMockDb([row]);

      await expect(
        upsertBlock(db, {
          userId: "u1",
          label: "companion/therapeutic_calibration",
          content: "y".repeat(800),
        }),
      ).resolves.not.toThrow();
    });

    it("throws when content is 801 chars for companion/therapeutic_calibration", async () => {
      const { db } = makeMockDb();

      await expect(
        upsertBlock(db, {
          userId: "u1",
          label: "companion/therapeutic_calibration",
          content: "y".repeat(801),
        }),
      ).rejects.toThrow("exceeds limit");
    });
  });

  // ── Group 2: upsertBlock Drizzle call shape ───────────────────

  describe("upsertBlock — Drizzle call shape", () => {
    it("calls onConflictDoUpdate (not a second insert)", async () => {
      const row = {
        id: "block-3",
        userId: "u2",
        label: "user/goals" as const,
        content: "my goals",
        charLimit: 500,
        updatedBy: "system",
        sourceSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { db, mocks } = makeMockDb([row]);

      await upsertBlock(db, {
        userId: "u2",
        label: "user/goals",
        content: "my goals",
      });

      // insert was called exactly once — no second insert
      expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
      // upsert path: onConflictDoUpdate, not onConflictDoNothing
      expect(mocks.mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.mockOnConflictDoNothing).not.toHaveBeenCalled();
      // returning() was called to get the upserted row
      expect(mocks.mockReturning).toHaveBeenCalledTimes(1);
    });
  });

  // ── Group 3: seedEmptyBlocks ──────────────────────────────────

  describe("seedEmptyBlocks", () => {
    it("calls insert with an array of exactly 6 items, all with content: ''", async () => {
      const { db, mocks } = makeMockDb();

      await seedEmptyBlocks(db, "u1");

      expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
      const seededItems = (mocks.mockValues.mock.calls as unknown[][])[0]![0] as Array<{
        content: string;
        label: string;
        charLimit: number;
      }>;
      expect(seededItems).toHaveLength(6);
      for (const item of seededItems) {
        expect(item.content).toBe("");
      }
    });

    it("seeds all 6 MEMORY_BLOCK_LABELS", async () => {
      const { db, mocks } = makeMockDb();

      await seedEmptyBlocks(db, "u1");

      const seededItems = (mocks.mockValues.mock.calls as unknown[][])[0]![0] as Array<{
        label: string;
      }>;
      const seededLabels = seededItems.map((item) => item.label);

      for (const label of MEMORY_BLOCK_LABELS) {
        expect(seededLabels).toContain(label);
      }
    });

    it("each seeded item's charLimit matches BLOCK_CHAR_LIMITS[label]", async () => {
      const { db, mocks } = makeMockDb();

      await seedEmptyBlocks(db, "u1");

      const seededItems = (mocks.mockValues.mock.calls as unknown[][])[0]![0] as Array<{
        label: string;
        charLimit: number;
      }>;

      for (const item of seededItems) {
        const expectedLimit =
          BLOCK_CHAR_LIMITS[item.label as keyof typeof BLOCK_CHAR_LIMITS];
        expect(item.charLimit).toBe(expectedLimit);
      }
    });
  });

  // ── Group 4: getBlocksForUser ─────────────────────────────────

  describe("getBlocksForUser", () => {
    it("resolves to [] when the DB returns an empty array", async () => {
      const { db } = makeMockDb([]);

      const result = await getBlocksForUser(db, "u1");

      expect(result).toEqual([]);
    });
  });

  // ── Group 5: BLOCK_CHAR_LIMITS constants ──────────────────────

  describe("BLOCK_CHAR_LIMITS constants", () => {
    it("has entries for all 6 labels", () => {
      expect(Object.keys(BLOCK_CHAR_LIMITS)).toHaveLength(6);
    });

    it("all user/* labels have a char limit of 500", () => {
      const userLabels = MEMORY_BLOCK_LABELS.filter((l) =>
        l.startsWith("user/"),
      );
      expect(userLabels.length).toBeGreaterThan(0);
      for (const label of userLabels) {
        expect(BLOCK_CHAR_LIMITS[label]).toBe(500);
      }
    });

    it("companion/therapeutic_calibration has a char limit of 800", () => {
      expect(BLOCK_CHAR_LIMITS["companion/therapeutic_calibration"]).toBe(800);
    });
  });
});
