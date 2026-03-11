import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { userProfiles } from "./schema/index";

/**
 * Get or create the single user profile.
 * Single-user app — no auth, always one user.
 */

/** Cached user ID to avoid repeated DB lookups after first call. */
let cachedUserId: string | null = null;

/** Exported for testing: reset the cached user ID. */
export function _resetCachedUserId(): void {
  cachedUserId = null;
}

export async function getOrCreateUser() {
  if (cachedUserId) {
    const [existing] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, cachedUserId))
      .limit(1);
    if (existing) return existing;
    cachedUserId = null;
  }

  const existing = await db.select().from(userProfiles).limit(1);
  if (existing[0]) {
    cachedUserId = existing[0].id;
    return existing[0];
  }

  const [created] = await db
    .insert(userProfiles)
    .values({ displayName: "User" })
    .returning();
  cachedUserId = created!.id;
  return created!;
}
