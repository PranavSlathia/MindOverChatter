---
to: apps/server/src/routes/__tests__/<%= name %>.test.ts
---
import { describe, it, expect } from "vitest";
import app from "../<%= name %>";

describe("<%= h.PascalCase(name) %> routes", () => {
  it("should be defined", () => {
    expect(app).toBeDefined();
  });

  // TODO: add route-specific tests
});
