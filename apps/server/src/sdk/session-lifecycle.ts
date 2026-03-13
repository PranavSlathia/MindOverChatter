// ── Session Lifecycle Hook Registry ──────────────────────────────
// Provides a hook registry for session start and end events.
// Hooks are registered at server startup (via session-hooks.ts) and
// executed in registration order at the appropriate lifecycle events.

import type { ConversationMessage } from "./session-manager.js";

// ── Context Types ────────────────────────────────────────────────

export interface OnStartContext {
  userId: string;
  sdkSessionId: string;
}

export interface OnEndContext {
  userId: string;
  sessionId: string;
  conversationHistory: ConversationMessage[];
  safeReason?: string;
}

// ── Hook Types ───────────────────────────────────────────────────

type OnStartHook = (ctx: OnStartContext) => Promise<void>;
type OnEndHook = (ctx: OnEndContext) => Promise<void>;
type OnEndPriority = "critical" | "background";

interface OnStartEntry {
  name: string;
  hook: OnStartHook;
}

interface OnEndEntry {
  name: string;
  hook: OnEndHook;
  priority: OnEndPriority;
}

// ── Registry ─────────────────────────────────────────────────────

const onStartHooks: OnStartEntry[] = [];
const onEndHooks: OnEndEntry[] = [];

// ── A3: runOnEnd deduplication guard ─────────────────────────────
// Tracks session IDs for which runOnEnd has been invoked, with the
// timestamp of invocation. Entries older than 1 hour are evicted on
// each call so the map doesn't grow unboundedly for long-lived servers.
// TTL ensures manual remediation can re-run hooks after the expiry window.
const END_DEDUPE_TTL_MS = 60 * 60 * 1000; // 1 hour
const endedSessionTimes = new Map<string, number>();

// ── Test utilities ───────────────────────────────────────────────

/**
 * Clears all registered hooks and the dedup map.
 * ONLY for use in unit tests — never call from application code.
 */
export function clearHooksForTesting(): void {
  onStartHooks.length = 0;
  onEndHooks.length = 0;
  endedSessionTimes.clear();
}

// ── Registration ─────────────────────────────────────────────────

/**
 * Register a hook to run at session start.
 * Hooks run sequentially in registration order, all awaited.
 * Duplicate names are silently skipped (idempotent registration).
 */
export function registerOnStart(name: string, hook: OnStartHook): void {
  // A2: idempotent — skip if already registered under this name
  if (onStartHooks.some((e) => e.name === name)) {
    console.warn(`[session-lifecycle] onStart "${name}" already registered — skipping`);
    return;
  }
  onStartHooks.push({ name, hook });
  console.log(`[session-lifecycle] registered onStart "${name}"`);
}

/**
 * Register a hook to run at session end.
 * @param priority "critical" — awaited before response returns; "background" — fire-and-forget after critical hooks
 * Duplicate names are silently skipped (idempotent registration).
 */
export function registerOnEnd(
  name: string,
  hook: OnEndHook,
  priority: OnEndPriority,
): void {
  // A2: idempotent — skip if already registered under this name
  if (onEndHooks.some((e) => e.name === name)) {
    console.warn(`[session-lifecycle] onEnd "${name}" already registered — skipping`);
    return;
  }
  onEndHooks.push({ name, hook, priority });
  console.log(`[session-lifecycle] registered onEnd "${name}" (${priority})`);
}

// ── Lifecycle helpers ─────────────────────────────────────────────

/**
 * Clear the deduplication entry for a session.
 * Must be called when a completed session is resumed so that the
 * next end-of-session cycle generates a fresh summary.
 */
export function clearEndedSession(sessionId: string): void {
  endedSessionTimes.delete(sessionId);
}

/**
 * Contract descriptor for a required onEnd hook.
 * Both presence AND priority are validated — priority is the real invariant
 * (session-summary MUST be critical; background hooks MUST be background).
 */
export interface RequiredOnEndHook {
  name: string;
  priority: OnEndPriority;
}

/**
 * Assert the hook registry satisfies the application contract.
 * Throws synchronously at startup so a misconfigured registry is caught
 * before any request is served.
 *
 * Validates:
 *   - all required onStart hook names are present
 *   - all required onEnd hook names are present with the correct priority
 *
 * Call immediately after registerSessionHooks() in index.ts.
 */
export function assertHookContract(contract: {
  onStart: string[];
  onEnd: RequiredOnEndHook[];
}): void {
  for (const name of contract.onStart) {
    if (!onStartHooks.some((e) => e.name === name)) {
      throw new Error(
        `[session-lifecycle] Required onStart hook "${name}" is not registered. Check session-hooks.ts.`,
      );
    }
  }
  for (const { name, priority } of contract.onEnd) {
    const entry = onEndHooks.find((e) => e.name === name);
    if (!entry) {
      throw new Error(
        `[session-lifecycle] Required onEnd hook "${name}" is not registered. Check session-hooks.ts.`,
      );
    }
    if (entry.priority !== priority) {
      throw new Error(
        `[session-lifecycle] onEnd hook "${name}" has priority "${entry.priority}" but must be "${priority}". Check session-hooks.ts.`,
      );
    }
  }
}

// ── Runners ──────────────────────────────────────────────────────

/**
 * Run all registered onStart hooks sequentially.
 * All hooks are awaited before returning.
 */
export async function runOnStart(ctx: OnStartContext): Promise<void> {
  for (const entry of onStartHooks) {
    try {
      console.log(`[session-lifecycle] onStart "${entry.name}"`);
      await entry.hook(ctx);
    } catch (err) {
      console.error(`[session-lifecycle] onStart "${entry.name}" failed:`, err);
      // Continue with remaining hooks — one failing shouldn't block the session
    }
  }
}

/**
 * Run all registered onEnd hooks.
 * Critical hooks are awaited sequentially first.
 * Background hooks are then chained sequentially in a fire-and-forget promise.
 *
 * A3: Idempotent per sessionId — if runOnEnd has already been called for
 * this session (e.g. concurrent beforeunload + explicit end), the second
 * call is a no-op. The guard is permanent (sessions don't reactivate).
 */
export async function runOnEnd(ctx: OnEndContext): Promise<void> {
  // A3: evict stale entries (sessions ended > 1h ago) before checking
  const now = Date.now();
  for (const [sid, ts] of endedSessionTimes) {
    if (now - ts > END_DEDUPE_TTL_MS) endedSessionTimes.delete(sid);
  }

  // A3: deduplication guard — skip if already invoked for this session
  if (endedSessionTimes.has(ctx.sessionId)) {
    console.warn(
      `[session-lifecycle] runOnEnd called twice for session ${ctx.sessionId} — skipping`,
    );
    return;
  }
  endedSessionTimes.set(ctx.sessionId, now);

  const critical = onEndHooks.filter((e) => e.priority === "critical");
  const background = onEndHooks.filter((e) => e.priority === "background");

  // Await all critical hooks in order
  for (const entry of critical) {
    console.log(`[session-lifecycle] onEnd "${entry.name}" (critical)`);
    await entry.hook(ctx);
  }

  // Chain background hooks sequentially, fire-and-forget
  if (background.length > 0) {
    (async () => {
      for (const entry of background) {
        try {
          console.log(`[session-lifecycle] onEnd "${entry.name}" (background)`);
          await entry.hook(ctx);
        } catch (err) {
          console.error(
            `[session-lifecycle] onEnd "${entry.name}" (background) failed:`,
            err,
          );
          // Continue with subsequent background hooks
        }
      }
    })().catch((err) => {
      console.error("[session-lifecycle] background hook chain error:", err);
    });
  }
}
