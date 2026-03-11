import { describe, expect, it, vi } from "vitest";
import { sessionEmitter } from "../emitter.js";
import type { SSEEventData } from "../emitter.js";

describe("SessionEventEmitter", () => {
  it("emits session.ended event to subscribers", () => {
    const sessionId = "test-session-ended";
    const received: SSEEventData[] = [];

    const unsub = sessionEmitter.subscribe(sessionId, (event) => {
      received.push(event);
    });

    sessionEmitter.emit(sessionId, {
      event: "session.ended",
      data: {},
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.event).toBe("session.ended");

    unsub();
  });

  it("emits session.ended without summary", () => {
    const sessionId = "test-session-ended-no-summary";
    const received: SSEEventData[] = [];

    const unsub = sessionEmitter.subscribe(sessionId, (event) => {
      received.push(event);
    });

    sessionEmitter.emit(sessionId, {
      event: "session.ended",
      data: {},
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.event).toBe("session.ended");

    unsub();
  });

  it("does not emit to unsubscribed listeners", () => {
    const sessionId = "test-unsub";
    const callback = vi.fn();

    const unsub = sessionEmitter.subscribe(sessionId, callback);
    unsub();

    sessionEmitter.emit(sessionId, {
      event: "ai.chunk",
      data: { content: "test" },
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("emits to multiple subscribers independently", () => {
    const sessionId = "test-multi";
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = sessionEmitter.subscribe(sessionId, cb1);
    const unsub2 = sessionEmitter.subscribe(sessionId, cb2);

    sessionEmitter.emit(sessionId, {
      event: "ai.chunk",
      data: { content: "hello" },
    });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it("isolates events between sessions", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = sessionEmitter.subscribe("session-a", cb1);
    const unsub2 = sessionEmitter.subscribe("session-b", cb2);

    sessionEmitter.emit("session-a", {
      event: "ai.chunk",
      data: { content: "for a" },
    });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();

    unsub1();
    unsub2();
  });

  it("hasSubscribers returns correct state", () => {
    const sessionId = "test-has-subs";
    expect(sessionEmitter.hasSubscribers(sessionId)).toBe(false);

    const unsub = sessionEmitter.subscribe(sessionId, vi.fn());
    expect(sessionEmitter.hasSubscribers(sessionId)).toBe(true);

    unsub();
    expect(sessionEmitter.hasSubscribers(sessionId)).toBe(false);
  });

  it("swallows errors from individual listeners without affecting others", () => {
    const sessionId = "test-error-swallow";
    const badCb = vi.fn().mockImplementation(() => {
      throw new Error("listener error");
    });
    const goodCb = vi.fn();

    const unsub1 = sessionEmitter.subscribe(sessionId, badCb);
    const unsub2 = sessionEmitter.subscribe(sessionId, goodCb);

    // Should not throw
    sessionEmitter.emit(sessionId, {
      event: "ai.error",
      data: { error: "test" },
    });

    expect(badCb).toHaveBeenCalledTimes(1);
    expect(goodCb).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });
});
