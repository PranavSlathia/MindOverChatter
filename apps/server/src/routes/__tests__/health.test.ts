import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import health from "../health.js";

describe("Health route", () => {
  const app = new Hono().route("/", health);

  it("GET /health returns ok status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeDefined();
  });
});
