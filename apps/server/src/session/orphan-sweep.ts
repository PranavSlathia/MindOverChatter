// ── Orphan Session Sweep ────────────────────────────────────────
// Periodically marks inactive sessions as completed.
// Runs every ORPHAN_SWEEP_INTERVAL_MS (5 minutes).
// A session is orphaned when status = "active" and
// lastActivityAt < now - SESSION_INACTIVITY_TIMEOUT_MS (30 minutes).

import { eq, and, lt } from "drizzle-orm";
import {
  SESSION_INACTIVITY_TIMEOUT_MS,
  ORPHAN_SWEEP_INTERVAL_MS,
} from "@moc/shared";
import { db } from "../db/index.js";
import { sessions } from "../db/schema/index";

/**
 * Run one sweep cycle: find and close orphaned sessions.
 * Returns the number of sessions closed.
 */
export async function sweepOrphanSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - SESSION_INACTIVITY_TIMEOUT_MS);
  const now = new Date();

  const orphaned = await db
    .update(sessions)
    .set({
      status: "completed",
      endedAt: now,
    })
    .where(
      and(
        eq(sessions.status, "active"),
        lt(sessions.lastActivityAt, cutoff),
      ),
    )
    .returning({ id: sessions.id });

  if (orphaned.length > 0) {
    console.log(
      `[orphan-sweep] Closed ${orphaned.length} inactive session(s): ${orphaned.map((s) => s.id).join(", ")}`,
    );
  }

  return orphaned.length;
}

/**
 * Start the recurring orphan sweep interval.
 * Call this once at server startup.
 * Returns a cleanup function to stop the interval.
 */
export function startOrphanSweep(): () => void {
  console.log(
    `[orphan-sweep] Started (interval: ${ORPHAN_SWEEP_INTERVAL_MS / 1000}s, timeout: ${SESSION_INACTIVITY_TIMEOUT_MS / 1000}s)`,
  );

  const intervalId = setInterval(() => {
    sweepOrphanSessions().catch((err) => {
      console.error("[orphan-sweep] Error during sweep:", err);
    });
  }, ORPHAN_SWEEP_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
    console.log("[orphan-sweep] Stopped");
  };
}
