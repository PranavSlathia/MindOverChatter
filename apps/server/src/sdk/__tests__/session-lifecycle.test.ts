import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertHookContract,
  clearEndedSession,
  clearHooksForTesting,
  registerOnEnd,
  registerOnStart,
  runOnEnd,
  runOnStart,
} from "../session-lifecycle.js";
import type { OnEndContext, OnStartContext } from "../session-lifecycle.js";

const START_CTX: OnStartContext = { userId: "user-1", sdkSessionId: "sdk-1" };
const END_CTX: OnEndContext = {
  userId: "user-1",
  sessionId: "session-1",
  conversationHistory: [],
};

beforeEach(() => {
  clearHooksForTesting();
});

afterEach(() => {
  clearHooksForTesting();
});

// ── assertHookContract ────────────────────────────────────────────

describe("assertHookContract", () => {
  it("passes when all required hooks are registered with correct priorities", () => {
    registerOnStart("start-hook", async () => {});
    registerOnEnd("summary", async () => {}, "critical");
    registerOnEnd("background-task", async () => {}, "background");

    expect(() =>
      assertHookContract({
        onStart: ["start-hook"],
        onEnd: [
          { name: "summary", priority: "critical" },
          { name: "background-task", priority: "background" },
        ],
      }),
    ).not.toThrow();
  });

  it("throws when a required onStart hook is missing", () => {
    expect(() =>
      assertHookContract({ onStart: ["missing-hook"], onEnd: [] }),
    ).toThrow(/Required onStart hook "missing-hook" is not registered/);
  });

  it("throws when a required onEnd hook is missing", () => {
    expect(() =>
      assertHookContract({
        onStart: [],
        onEnd: [{ name: "missing-end", priority: "critical" }],
      }),
    ).toThrow(/Required onEnd hook "missing-end" is not registered/);
  });

  it("throws when an onEnd hook has the wrong priority", () => {
    registerOnEnd("my-hook", async () => {}, "background");

    expect(() =>
      assertHookContract({
        onStart: [],
        onEnd: [{ name: "my-hook", priority: "critical" }],
      }),
    ).toThrow(/has priority "background" but must be "critical"/);
  });

  it("validates priority in both directions", () => {
    registerOnEnd("critical-hook", async () => {}, "critical");

    expect(() =>
      assertHookContract({
        onStart: [],
        onEnd: [{ name: "critical-hook", priority: "background" }],
      }),
    ).toThrow(/has priority "critical" but must be "background"/);
  });
});

// ── Hook idempotency ──────────────────────────────────────────────

describe("hook idempotency", () => {
  it("skips duplicate onStart registration by name", async () => {
    const calls: number[] = [];
    registerOnStart("dup-hook", async () => { calls.push(1); });
    registerOnStart("dup-hook", async () => { calls.push(2); });

    // Only the first registration should run
    await runOnStart(START_CTX);
    expect(calls).toEqual([1]);
  });

  it("skips duplicate onEnd registration by name", async () => {
    const calls: number[] = [];
    registerOnEnd("dup-end", async () => { calls.push(1); }, "critical");
    registerOnEnd("dup-end", async () => { calls.push(2); }, "critical");

    await runOnEnd(END_CTX);
    expect(calls).toEqual([1]);
  });
});

// ── runOnStart ────────────────────────────────────────────────────

describe("runOnStart", () => {
  it("runs hooks sequentially and awaits all of them", async () => {
    const order: string[] = [];

    registerOnStart("first", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("first");
    });
    registerOnStart("second", async () => {
      order.push("second");
    });

    await runOnStart(START_CTX);
    expect(order).toEqual(["first", "second"]);
  });

  it("continues to remaining hooks if one throws", async () => {
    const order: string[] = [];

    registerOnStart("throws", async () => {
      throw new Error("hook error");
    });
    registerOnStart("continues", async () => {
      order.push("continues");
    });

    await expect(runOnStart(START_CTX)).resolves.toBeUndefined();
    expect(order).toEqual(["continues"]);
  });
});

// ── runOnEnd ─────────────────────────────────────────────────────

describe("runOnEnd", () => {
  it("awaits critical hooks before returning", async () => {
    const order: string[] = [];

    registerOnEnd(
      "critical",
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push("critical");
      },
      "critical",
    );

    await runOnEnd(END_CTX);
    // critical hook must be done before the await resolves
    expect(order).toContain("critical");
  });

  it("deduplicates: second call for same sessionId is a no-op", async () => {
    const calls: number[] = [];
    registerOnEnd("summary", async () => { calls.push(1); }, "critical");

    await runOnEnd(END_CTX);
    await runOnEnd(END_CTX); // second call — same sessionId

    expect(calls).toHaveLength(1);
  });

  it("allows re-run after clearEndedSession", async () => {
    const calls: number[] = [];
    registerOnEnd("summary", async () => { calls.push(1); }, "critical");

    await runOnEnd(END_CTX);
    clearEndedSession(END_CTX.sessionId);
    await runOnEnd(END_CTX); // should run again

    expect(calls).toHaveLength(2);
  });

  it("runs background hooks after critical hooks", async () => {
    const order: string[] = [];

    registerOnEnd(
      "critical",
      async () => { order.push("critical"); },
      "critical",
    );
    registerOnEnd(
      "background",
      async () => { order.push("background"); },
      "background",
    );

    await runOnEnd(END_CTX);

    // Critical must be first; give background time to finish
    await new Promise((r) => setTimeout(r, 50));
    expect(order[0]).toBe("critical");
    expect(order).toContain("background");
  });

  it("background hook failure does not block subsequent background hooks", async () => {
    const order: string[] = [];

    registerOnEnd("critical", async () => {}, "critical");
    registerOnEnd("bg-throws", async () => { throw new Error("bg fail"); }, "background");
    registerOnEnd("bg-ok", async () => { order.push("bg-ok"); }, "background");

    await runOnEnd(END_CTX);
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toContain("bg-ok");
  });
});
