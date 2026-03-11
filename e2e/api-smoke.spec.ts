import { test, expect } from "@playwright/test";

// ── E2E API Smoke Tests — MindOverChatter Backend ────────────────────────────
// These tests hit the Hono server directly at http://localhost:3000.
// No browser page is opened — they use Playwright's built-in `request` fixture.
//
// Run only when the backend is running:
//   docker compose up -d && pnpm test:e2e

const API = "http://localhost:3000";

test.describe("Health check", () => {
  test("GET /health returns 200", async ({ request }) => {
    const response = await request.get(`${API}/health`);
    expect(response.status()).toBe(200);
  });
});

test.describe("Sessions API", () => {
  test("POST /api/sessions creates a new session and returns sessionId", async ({ request }) => {
    const response = await request.post(`${API}/api/sessions`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("sessionId");
    expect(typeof body.sessionId).toBe("string");
    expect(body.sessionId.length).toBeGreaterThan(0);
  });

  test("GET /api/sessions returns 200 with sessions array", async ({ request }) => {
    const response = await request.get(`${API}/api/sessions`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("sessions");
    expect(Array.isArray(body.sessions)).toBe(true);
  });
});

test.describe("User profile API", () => {
  test("GET /api/user returns 200 with profile shape", async ({ request }) => {
    const response = await request.get(`${API}/api/user`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Profile should have these core fields (from user_profiles schema)
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("createdAt");
    // displayName may be null for a fresh profile
    expect("displayName" in body).toBe(true);
  });
});

test.describe("Mood logs API", () => {
  test("GET /api/mood-logs returns 200 with entries array", async ({ request }) => {
    const response = await request.get(`${API}/api/mood-logs`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("entries");
    expect(Array.isArray(body.entries)).toBe(true);
  });
});

test.describe("Voice routes — graceful degradation", () => {
  test("POST /api/transcribe with no file returns 400 (not a crash)", async ({ request }) => {
    // Send an empty multipart form — the route validates that 'file' key is present.
    // Expect a 4xx client error, not a 500 server crash.
    const response = await request.post(`${API}/api/transcribe`, {
      multipart: {},
    });
    // Route returns 400 MISSING_FILE when no file is provided
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("MISSING_FILE");
  });

  test("POST /api/tts with empty body returns 400 (Zod validation, not a crash)", async ({
    request,
  }) => {
    // The /tts route uses zValidator(SynthesizeRequestSchema).
    // An empty JSON body fails schema validation and returns 400.
    const response = await request.post(`${API}/api/tts`, {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    // zValidator returns 400 for invalid/missing fields
    expect(response.status()).toBe(400);
  });
});
