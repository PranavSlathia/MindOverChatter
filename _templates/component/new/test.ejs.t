---
to: apps/web/src/components/__tests__/<%= name %>.test.tsx
---
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { <%= h.PascalCase(name) %> } from "../<%= name %>";

describe("<%= h.PascalCase(name) %>", () => {
  it("should render", () => {
    render(<<%= h.PascalCase(name) %> />);
    // TODO: add assertions
  });
});
