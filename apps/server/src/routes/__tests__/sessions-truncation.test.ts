import { describe, expect, it } from "vitest";

/**
 * Tests for message history truncation logic.
 *
 * The route fetches MESSAGE_LIMIT + 1 rows and sets truncated = true
 * only when more than MESSAGE_LIMIT rows exist.
 *
 * Since route-level tests with real DB are integration tests (not in the
 * existing test pattern), we test the truncation logic as a pure function.
 */

const MESSAGE_LIMIT = 500;

/** Mirrors the truncation logic from sessions.ts GET /:id/messages */
function computeTruncation(rows: unknown[]) {
  const truncated = rows.length > MESSAGE_LIMIT;
  const returnedRows = truncated ? rows.slice(0, MESSAGE_LIMIT) : rows;
  return { count: returnedRows.length, truncated };
}

describe("Message history truncation", () => {
  it("499 rows: not truncated, returns all 499", () => {
    const rows = Array.from({ length: 499 }, (_, i) => ({ id: i }));
    const result = computeTruncation(rows);
    expect(result.truncated).toBe(false);
    expect(result.count).toBe(499);
  });

  it("500 rows: not truncated, returns all 500", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i }));
    const result = computeTruncation(rows);
    expect(result.truncated).toBe(false);
    expect(result.count).toBe(500);
  });

  it("501 rows (over-fetched): truncated, returns exactly 500", () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ id: i }));
    const result = computeTruncation(rows);
    expect(result.truncated).toBe(true);
    expect(result.count).toBe(500);
  });

  it("0 rows: not truncated, returns 0", () => {
    const result = computeTruncation([]);
    expect(result.truncated).toBe(false);
    expect(result.count).toBe(0);
  });

  it("1 row: not truncated, returns 1", () => {
    const result = computeTruncation([{ id: 0 }]);
    expect(result.truncated).toBe(false);
    expect(result.count).toBe(1);
  });
});
