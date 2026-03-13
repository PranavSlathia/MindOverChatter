// ── Session-Scoped SSE Event Emitter ────────────────────────────
// Simple in-memory pub/sub for streaming AI responses to SSE clients.
// Single-user app — no Redis needed. One EventEmitter per session.

/** Payload shape for each SSE event type */
export type SSEEventData =
  | { event: "ai.thinking"; data: { status: string } }
  | { event: "ai.chunk"; data: { content: string } }
  | { event: "ai.response_complete"; data: { messageId: string } }
  | { event: "ai.error"; data: { error: string } }
  | {
      event: "session.crisis";
      data: {
        message: string;
        helplines: ReadonlyArray<{
          readonly name: string;
          readonly number: string;
          readonly country: string;
        }>;
      };
    }
  | { event: "session.ending"; data: Record<string, never> }
  | { event: "session.ended"; data: Record<string, never> }
  | { event: "assessment.start"; data: { assessmentType: string } }
  | {
      event: "assessment.complete";
      data: { assessmentId: string; severity: string; nextScreener: string | null };
    }
  | {
      event: "emotion.ai_detected";
      data: { emotionLabel: string; confidence: number; channel: string };
    };

export type SSECallback = (event: SSEEventData) => void;

/**
 * In-memory session-scoped event bus.
 *
 * Usage:
 *   - The SSE route subscribes when a client connects.
 *   - The message route emits events as Claude streams chunks.
 *   - The SSE route unsubscribes when the client disconnects.
 */
class SessionEventEmitter {
  private listeners = new Map<string, Set<SSECallback>>();

  /** Subscribe to events for a session. Returns an unsubscribe function. */
  subscribe(sessionId: string, callback: SSECallback): () => void {
    let set = this.listeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.listeners.set(sessionId, set);
    }
    set.add(callback);

    return () => {
      this.unsubscribe(sessionId, callback);
    };
  }

  /** Unsubscribe a specific callback from a session. */
  unsubscribe(sessionId: string, callback: SSECallback): void {
    const set = this.listeners.get(sessionId);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) {
      this.listeners.delete(sessionId);
    }
  }

  /** Emit an event to all subscribers for a session. */
  emit(sessionId: string, event: SSEEventData): void {
    const set = this.listeners.get(sessionId);
    if (!set) return;
    for (const callback of set) {
      try {
        callback(event);
      } catch {
        // Swallow errors from individual listeners to avoid
        // one bad listener breaking the entire broadcast.
      }
    }
  }

  /** Check if a session has any active SSE subscribers. */
  hasSubscribers(sessionId: string): boolean {
    const set = this.listeners.get(sessionId);
    return set !== undefined && set.size > 0;
  }
}

/** Singleton instance used across routes. */
export const sessionEmitter = new SessionEventEmitter();
