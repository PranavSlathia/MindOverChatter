---
to: apps/server/src/db/schema/<%= name %>.ts
---
import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
<% if (withEmbedding) { %>
import { vector } from "drizzle-orm/pg-core";
<% } %>
<% if (withUserId) { %>
import { userProfiles } from "./user-profiles";
<% } %>
<% if (withSessionId) { %>
import { sessions } from "./sessions";
<% } %>

export const <%= h.camelCase(name) %> = pgTable("<%= h.snake_case(name) %>", {
  id: uuid("id").primaryKey().defaultRandom(),
<% if (withUserId) { %>
  userId: uuid("user_id").references(() => userProfiles.id).notNull(),
<% } %>
<% if (withSessionId) { %>
  sessionId: uuid("session_id").references(() => sessions.id).notNull(),
<% } %>
<% if (withEmbedding) { %>
  embedding: vector("embedding", { dimensions: 1024 }),
<% } %>
  // TODO: add columns
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type <%= h.PascalCase(name) %> = typeof <%= h.camelCase(name) %>.$inferSelect;
export type New<%= h.PascalCase(name) %> = typeof <%= h.camelCase(name) %>.$inferInsert;
