// ── User Profile Routes ──────────────────────────────────────────
// GET   /  — Get the single user's profile
// PATCH /  — Update user profile fields

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { UpdateUserProfileSchema } from "@moc/shared";
import { db } from "../db/index.js";
import { userProfiles } from "../db/schema/index";
import { getOrCreateUser } from "../db/helpers.js";

const app = new Hono()

  // ── GET / — User Profile ───────────────────────────────────────
  .get("/", async (c) => {
    const user = await getOrCreateUser();

    return c.json({
      id: user.id,
      displayName: user.displayName,
      coreTraits: user.coreTraits,
      patterns: user.patterns,
      goals: user.goals,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  })

  // ── PATCH / — Update User Profile ──────────────────────────────
  .patch("/", zValidator("json", UpdateUserProfileSchema), async (c) => {
    const body = c.req.valid("json");
    const user = await getOrCreateUser();

    const [updated] = await db
      .update(userProfiles)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(userProfiles.id, user.id))
      .returning();

    return c.json({
      id: updated!.id,
      displayName: updated!.displayName,
      coreTraits: updated!.coreTraits,
      patterns: updated!.patterns,
      goals: updated!.goals,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    });
  });

// ── Export ────────────────────────────────────────────────────────

export type UserProfileRoutes = typeof app;
export default app;
