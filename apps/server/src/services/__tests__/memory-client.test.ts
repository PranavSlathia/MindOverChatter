import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ── Mock env ────────────────────────────────────────────────────
vi.mock("../../env.js", () => ({
  env: {
    MEMORY_SERVICE_URL: "http://localhost:8004",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    PORT: 3000,
    NODE_ENV: "test",
  },
}));

// ── Mock db (tracks calls for provenance tests) ─────────────────
const mockReturning = vi.fn(() => Promise.resolve([{ id: "new-memory-id" }]));
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));
const mockWhere = vi.fn(() => Promise.resolve());
const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock("../../db/index.js", () => ({
  db: {
    insert: () => mockInsert(),
    update: () => mockUpdate(),
  },
}));

vi.mock("../../db/schema/index", () => ({
  memories: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _eq: args })),
}));

// ── Import after mocks ──────────────────────────────────────────
import { searchMemories, addMemoriesAsync, summarizeSessionAsync } from "../memory-client.js";

// ── Tests ───────────────────────────────────────────────────────

describe("Memory Client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockReturning.mockReturnValue(Promise.resolve([{ id: "new-memory-id" }]));
    mockValues.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
    mockWhere.mockReturnValue(Promise.resolve());
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── searchMemories ──────────────────────────────────────────
  describe("searchMemories", () => {
    it("sends correct request shape to memory service", async () => {
      const mockPythonResponse = {
        memories: [
          {
            id: "mem-1",
            content: "User likes coffee",
            memory_type: "profile_fact",
            confidence: 0.9,
            relevance: 0.85,
            created_at: "2026-03-01T00:00:00Z",
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPythonResponse),
      });

      const result = await searchMemories("user-123", "user preferences", 5);

      // Verify request contract
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:8004/memories/search",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "user-123",
            query: "user preferences",
            limit: 5,
          }),
        }),
      );

      // Verify snake_case → camelCase transformation
      expect(result).toEqual([
        {
          id: "mem-1",
          content: "User likes coffee",
          memoryType: "profile_fact",
          confidence: 0.9,
          relevance: 0.85,
          createdAt: "2026-03-01T00:00:00Z",
        },
      ]);
    });

    it("returns [] on HTTP 500", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await searchMemories("user-123", "query");
      expect(result).toEqual([]);
    });

    it("returns [] on network error", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await searchMemories("user-123", "query");
      expect(result).toEqual([]);
    });

    it("returns [] on timeout (AbortError)", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(
        new DOMException("The operation was aborted.", "AbortError"),
      );

      const result = await searchMemories("user-123", "query");
      expect(result).toEqual([]);
    });

    it("returns [] when response has unexpected shape", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ unexpected: "shape" }),
      });

      const result = await searchMemories("user-123", "query");
      expect(result).toEqual([]);
    });

    it("returns [] when response.json() throws", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      const result = await searchMemories("user-123", "query");
      expect(result).toEqual([]);
    });

    it("uses default limit of 10", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ memories: [] }),
      });

      await searchMemories("user-123", "query");

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            user_id: "user-123",
            query: "query",
            limit: 10,
          }),
        }),
      );
    });
  });

  // ── addMemoriesAsync — contract ─────────────────────────────
  describe("addMemoriesAsync", () => {
    it("sends correct request shape with session_id at top level", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ memories_added: [] }),
      });

      addMemoriesAsync(
        "user-1",
        "session-1",
        "msg-1",
        [{ role: "user", content: "I feel anxious" }],
      );

      // Let the async fire-and-forget settle
      await vi.waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(1);
      });

      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:8004/memories/add",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            user_id: "user-1",
            session_id: "session-1",
            messages: [{ role: "user", content: "I feel anxious" }],
            metadata: {},
          }),
        }),
      );
    });

    it("persists provenance to DB for ADD events", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            memories_added: [
              {
                id: "mem0-id-1",
                supersedes_id: null,
                content: "User feels anxious about work",
                memory_type: "recurring_trigger",
                confidence: 0.85,
                event: "ADD",
              },
            ],
          }),
      });

      addMemoriesAsync("user-1", "session-1", "msg-1", [
        { role: "user", content: "Work makes me anxious" },
      ]);

      await vi.waitFor(() => {
        expect(mockInsert).toHaveBeenCalled();
      });

      // Verify provenance fields passed to DB insert
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          content: "User feels anxious about work",
          memoryType: "recurring_trigger",
          confidence: 0.85,
          sourceSessionId: "session-1",
          sourceMessageId: "msg-1",
        }),
      );
    });

    it("handles contradiction: UPDATE event sets supersededBy on old memory", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            memories_added: [
              {
                id: "mem0-new",
                supersedes_id: "mem0-old",
                content: "User now lives in Mumbai",
                memory_type: "profile_fact",
                confidence: 0.95,
                event: "UPDATE",
              },
            ],
          }),
      });

      addMemoriesAsync("user-1", "session-2", "msg-5", [
        { role: "user", content: "I moved to Mumbai last month" },
      ]);

      await vi.waitFor(() => {
        expect(mockUpdate).toHaveBeenCalled();
      });

      // New memory inserted first
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "User now lives in Mumbai",
          memoryType: "profile_fact",
          sourceSessionId: "session-2",
        }),
      );

      // Old memory gets supersededBy set to new memory's ID
      expect(mockSet).toHaveBeenCalledWith({ supersededBy: "new-memory-id" });
    });

    it("skips NONE and DELETE events (no DB write)", async () => {
      // Clear any lingering calls from previous async tests
      mockInsert.mockClear();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            memories_added: [
              { id: "x", supersedes_id: null, content: "noop", memory_type: "goal", confidence: 0.5, event: "NONE" },
              { id: "y", supersedes_id: null, content: "deleted", memory_type: "goal", confidence: 0.5, event: "DELETE" },
            ],
          }),
      });

      addMemoriesAsync("user-1", "session-1", "msg-1", [
        { role: "user", content: "nothing new" },
      ]);

      // Give async time to settle, then verify no DB inserts were made
      await new Promise((r) => setTimeout(r, 100));

      // mockInsert may have been called by lingering async from prior tests;
      // check that no call included provenance values for NONE/DELETE events
      const insertCalls = mockValues.mock.calls as unknown[][];
      for (const call of insertCalls) {
        const values = call[0] as Record<string, unknown> | undefined;
        if (values && values.content) {
          expect(values.content).not.toBe("noop");
          expect(values.content).not.toBe("deleted");
        }
      }
    });

    it("skips unknown memory types", async () => {
      mockInsert.mockClear();
      mockValues.mockClear();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            memories_added: [
              { id: "z", supersedes_id: null, content: "bad type", memory_type: "unknown_type", confidence: 0.5, event: "ADD" },
            ],
          }),
      });

      addMemoriesAsync("user-1", "session-1", "msg-1", [
        { role: "user", content: "test" },
      ]);

      await new Promise((r) => setTimeout(r, 100));

      // Verify no DB insert was made with the unknown type content
      const calls = mockValues.mock.calls as unknown[][];
      for (const call of calls) {
        const values = call[0] as Record<string, unknown> | undefined;
        if (values && values.content) {
          expect(values.content).not.toBe("bad type");
        }
      }
    });

    it("does not throw on HTTP failure (fire-and-forget)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Should not throw
      addMemoriesAsync("user-1", "session-1", "msg-1", [
        { role: "user", content: "test" },
      ]);

      await new Promise((r) => setTimeout(r, 50));
      // No assertion needed — the test passes if no error is thrown
    });
  });

  // ── summarizeSessionAsync — contract ────────────────────────
  describe("summarizeSessionAsync", () => {
    it("sends correct request shape to memory service", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      summarizeSessionAsync("user-1", "session-1", "Session ended. 4 turns.");

      await vi.waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(1);
      });

      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:8004/memories/summarize",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            user_id: "user-1",
            session_id: "session-1",
            summary: "Session ended. 4 turns.",
          }),
        }),
      );
    });

    it("does not throw on network failure (fire-and-forget)", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      // Should not throw
      summarizeSessionAsync("user-1", "session-1", "summary");

      await new Promise((r) => setTimeout(r, 50));
    });
  });
});
