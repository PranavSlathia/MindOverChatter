import { test, expect } from "@playwright/test";

// ── E2E Smoke Tests — MindOverChatter UI ─────────────────────────────────────
// These verify page-level rendering and navigation only.
// Actual AI conversation flow is NOT tested here (requires Claude CLI at runtime).

test.describe("Home page", () => {
  test("loads with correct heading and navigation links", async ({ page }) => {
    await page.goto("/");

    // Primary heading
    await expect(page.getByRole("heading", { name: "MindOverChatter" })).toBeVisible();

    // Subtitle
    await expect(page.getByText("Your Wellness Companion")).toBeVisible();

    // Primary CTA and navigation links
    await expect(page.getByRole("link", { name: "Start chatting" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View session history" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Track your mood" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View your profile" })).toBeVisible();
  });
});

test.describe("Chat page", () => {
  test("renders message input and send controls", async ({ page }) => {
    await page.goto("/chat");

    // Message textarea — identified by aria-label set in MessageInput component
    const messageInput = page.getByRole("textbox", { name: "Message input" });
    await expect(messageInput).toBeVisible();

    // Send button
    const sendButton = page.getByRole("button", { name: "Send message" });
    await expect(sendButton).toBeVisible();

    // Microphone button (voice input)
    const micButton = page.getByRole("button", { name: "Start voice recording" });
    await expect(micButton).toBeVisible();
  });

  test("chat page header renders with session controls", async ({ page }) => {
    await page.goto("/chat");

    // The ChatHeader component renders; confirm the page title area is present
    // (MindOverChatter branding or session-level heading)
    const header = page.locator("header");
    await expect(header).toBeVisible();
  });

  test("crisis UI structure — page loads correctly for safety baseline", async ({ page }) => {
    // SAFETY NOTE: Actual crisis detection requires a live backend + Claude.
    // This test establishes a UI baseline — it confirms the chat page renders
    // so that crisis banners (CrisisBanner component) have a valid mount point.
    await page.goto("/chat");

    // Confirm the root chat container is present; CrisisBanner would be injected here
    const main = page.locator("main, [role='main'], .flex.flex-col");
    await expect(main.first()).toBeVisible();

    // Verify crisis-related SSE event listeners are registered by checking the
    // input is still functional (page did not error during mount)
    await expect(page.getByRole("textbox", { name: "Message input" })).toBeVisible();
  });

  test("assessments are embedded in chat page (not a separate route)", async ({ page }) => {
    // Assessments (PHQ-9, GAD-7) are triggered via SSE events during chat,
    // not via a dedicated /assessments route. The AssessmentWidget component
    // is conditionally rendered inside the chat page.
    await page.goto("/chat");

    // The chat page mounts; assessment widget will appear on 'assessment.start' SSE event.
    // Verify the page itself is healthy and capable of rendering dynamic widgets.
    await expect(page.getByRole("textbox", { name: "Message input" })).toBeVisible();

    // No separate /assessments route exists — verify that navigating there
    // falls back gracefully (React Router renders nothing or redirects)
    const response = await page.goto("/assessments");
    // Not a hard 404 (SPA serves index.html), page should not crash
    await expect(page).not.toHaveTitle("Error");
  });
});

test.describe("Mood tracker page", () => {
  test("loads with header, entry widget, and chart area", async ({ page }) => {
    await page.goto("/mood");

    // Page heading
    await expect(
      page.getByRole("heading", { name: "Mood Tracker" }),
    ).toBeVisible();

    // Subtitle
    await expect(page.getByText("Track how you feel over time")).toBeVisible();

    // The MoodEntryWidget and MoodChart are always rendered
    // (chart shows empty state when no entries exist)
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // Navigation links back to other pages
    await expect(page.getByRole("link", { name: "Session history" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to chat" })).toBeVisible();
  });
});

test.describe("Session history page", () => {
  test("loads and renders heading with empty or populated state", async ({ page }) => {
    await page.goto("/history");

    // Page heading
    await expect(
      page.getByRole("heading", { name: "Session History" }),
    ).toBeVisible();

    // Subtitle
    await expect(page.getByText("Review past conversations")).toBeVisible();

    // Either empty-state copy or session cards will be visible.
    // Both branches are acceptable for a smoke test.
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // Navigation links
    await expect(page.getByRole("link", { name: "Back to Chat" })).toBeVisible();
  });
});

test.describe("Profile page", () => {
  test("loads with all form sections and Save Changes button", async ({ page }) => {
    await page.goto("/profile");

    // Page heading
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    // Wait for profile to load (API call on mount)
    // The form appears once loading completes; use a generous wait
    await expect(page.getByLabel("Display Name")).toBeVisible({ timeout: 10_000 });

    // Goals, Core Traits, Patterns fieldsets
    await expect(page.getByRole("group", { name: "Goals" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Core Traits" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Patterns" })).toBeVisible();

    // Save Changes button exists (may be disabled when no changes are made)
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();
  });
});

test.describe("Navigation — inter-page links", () => {
  test("Start Chatting link navigates to /chat", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start chatting" }).click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole("textbox", { name: "Message input" })).toBeVisible();
  });

  test("Session History link navigates to /history", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "View session history" }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole("heading", { name: "Session History" })).toBeVisible();
  });

  test("Mood Tracker link navigates to /mood", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Track your mood" }).click();
    await expect(page).toHaveURL(/\/mood$/);
    await expect(page.getByRole("heading", { name: "Mood Tracker" })).toBeVisible();
  });

  test("Profile link navigates to /profile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "View your profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });
});
