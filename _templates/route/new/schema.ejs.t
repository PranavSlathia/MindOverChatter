---
to: packages/shared/src/validators/<%= name %>.ts
---
import { z } from "zod";

export const Create<%= h.PascalCase(name) %>Schema = z.object({
  // TODO: define fields
});

export const Get<%= h.PascalCase(name) %>Schema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Create<%= h.PascalCase(name) %> = z.infer<typeof Create<%= h.PascalCase(name) %>Schema>;
export type Get<%= h.PascalCase(name) %> = z.infer<typeof Get<%= h.PascalCase(name) %>Schema>;
