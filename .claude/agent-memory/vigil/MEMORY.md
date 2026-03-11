# Vigil Memory

> Test patterns, edge cases discovered, safety validation findings.

---

## Test Patterns

### Playwright setup (established 2026-03-11)
- Installed at monorepo root: `@playwright/test` in root `devDependencies`
- Config at `/Users/pronav/Documents/Vibecode/Therapy/playwright.config.ts`
- Test directory: `/Users/pronav/Documents/Vibecode/Therapy/e2e/`
- Run command: `npx playwright test --list` (discovery) / `pnpm test:e2e` (execution)
- Single project: chromium only (smoke tests are not cross-browser)
- baseURL: `http://localhost:5173` (Vite dev); API tests hit `http://localhost:3000` directly
- No webServer config — services must be running before test run

### Selector strategy
- Use `aria-label` attributes present in components for reliable selection
- `MessageInput` textarea: `aria-label="Message input"` → `getByRole("textbox", { name: "Message input" })`
- Send button: `aria-label="Send message"` → `getByRole("button", { name: "Send message" })`
- Mic button: `aria-label="Start voice recording"` → `getByRole("button", ...)`
- Home page links use `aria-label` on each `<Link>` → use exact aria-label text
- Profile fieldsets use `<fieldset>/<legend>` → `getByRole("group", { name: "..." })`
- Profile form waits 10s for API call to resolve before checking form fields

### API smoke test patterns
- Voice transcribe empty body → 400 with `{ error: "MISSING_FILE" }` (not 500)
- Voice TTS empty JSON → 400 from Zod validator (zValidator rejects missing fields)
- POST /api/sessions → 200, `{ sessionId: string }`
- GET /api/sessions → 200, `{ sessions: [] }`
- GET /api/user → 200, `{ id, createdAt, displayName (nullable) }`
- GET /api/mood-logs → 200, `{ entries: [] }`

## Edge Cases

### Assessments are NOT a separate route
PHQ-9 / GAD-7 widgets are rendered inside `/chat` on `assessment.start` SSE events.
There is no `/assessments` page. Tests that check assessments must look at the chat page.

### Profile page has async loading
The profile form only appears after `GET /api/user` resolves.
Always use `{ timeout: 10_000 }` on profile form element assertions.

### Crisis banners render inside chat
`CrisisBanner` is conditionally rendered in `/chat` on `session.crisis` SSE event.
Cannot be tested in isolation without a live backend + crisis-triggering message.
UI baseline test confirms the mount point exists and the page is healthy.

## Safety Findings

### Crisis detection test coverage (Phase 1)
718 unit tests passing as of Phase 5. Crisis detection is covered at the unit level.
E2E crisis path requires: Docker up + backend + live Claude CLI session.
Current smoke suite establishes structural baseline; full crisis E2E is Phase 7 work.
