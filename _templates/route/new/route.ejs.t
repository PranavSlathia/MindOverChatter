---
to: apps/server/src/routes/<%= name %>.ts
---
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  Create<%= h.PascalCase(name) %>Schema,
  Get<%= h.PascalCase(name) %>Schema,
} from "@moc/shared/validators/<%= name %>";

const app = new Hono()
<% if (methods === 'GET+POST' || methods === 'GET only' || methods === 'CRUD (GET+POST+PUT+DELETE)') { %>
  .get(
    "/<%= name %>s",
    zValidator("query", Get<%= h.PascalCase(name) %>Schema),
    async (c) => {
      const query = c.req.valid("query");
      // TODO: implement
      return c.json({ data: [], total: 0 });
    }
  )
<% } %>
<% if (methods === 'GET+POST' || methods === 'POST only' || methods === 'CRUD (GET+POST+PUT+DELETE)') { %>
  .post(
    "/<%= name %>s",
    zValidator("json", Create<%= h.PascalCase(name) %>Schema),
    async (c) => {
      const body = c.req.valid("json");
      // TODO: implement
      return c.json({ id: "new-id", ...body }, 201);
    }
  )
<% } %>
<% if (methods === 'CRUD (GET+POST+PUT+DELETE)') { %>
  .put(
    "/<%= name %>s/:id",
    zValidator("json", Create<%= h.PascalCase(name) %>Schema),
    async (c) => {
      const id = c.req.param("id");
      const body = c.req.valid("json");
      // TODO: implement
      return c.json({ id, ...body });
    }
  )
  .delete("/<%= name %>s/:id", async (c) => {
    const id = c.req.param("id");
    // TODO: implement
    return c.json({ deleted: true });
  })
<% } %>;

export type <%= h.PascalCase(name) %>Routes = typeof app;
export default app;
