# Pixel Memory

> Frontend patterns, component decisions, Human.js integration notes.

---

## Biome Formatter Rules (Critical)

- **Line width**: 100 characters (set in `/biome.json`)
- **Import ordering**: bare packages first (`@moc/shared`, `react`), then aliased paths (`@/...`), alphabetical within groups. Type imports inline (`type FormEvent`) not separate `import type` when from same module.
- **Trailing commas**: Required on multi-line arrays/objects (Biome default)
- **JSX**: Short JSX content kept inline (`<p>text</p>` not wrapped). Attributes that fit on one line stay on one line.
- **Ternaries**: Single-line when they fit within 100 chars
- **Suppressions**: `// biome-ignore lint/rule: reason` -- must match exact rule name
- **Hook deps**: Biome `useExhaustiveDependencies` checks both missing AND extra deps. Use `biome-ignore` for intentional trigger deps (e.g., scroll-on-change pattern).
- **Buttons**: Always need `type="button"` (or `type="submit"`) explicitly
- **Semantic elements**: Use `<output>` instead of `<div role="status">`
- **`noNonNullAssertion`**: Configured as `warn` (not error) -- pre-existing in `main.tsx`

## Component Patterns

- Chat UI uses native HTML + Tailwind (no shadcn/ui components for Phase 2)
- Message bubbles: user right-aligned (primary bg), assistant left-aligned (muted bg)
- Crisis banner: `role="alert"` + `aria-live="assertive"`, helplines with `tel:` links
- Streaming: typing dots animation -> progressive text with cursor bar
- `<output>` element used for session status indicator

## Theme Decisions

- Using CSS variables from `index.css` `@theme` block (Tailwind v4)
- Colors: `--color-sage-green: #7c9a82`, `--color-soft-cream: #f5f0e8`, `--color-warm-lavender: #b8a9c9`
- Crisis uses `destructive` color (`#e17055`) with `/40` and `/10` opacity variants

## SSE Pattern

- EventSource with named event listeners (`ai.chunk`, `ai.response_complete`, `ai.error`, `session.crisis`, `session.ended`)
- Streaming content accumulated in Zustand store, finalized on `response_complete`
- Fallback crisis response uses `HELPLINES` constant from `@moc/shared`
- `beforeunload` uses `navigator.sendBeacon()` for best-effort session end

## Performance Notes

- Zustand store actions are stable references (safe in useEffect deps)
- Scroll effect uses state values as deps to trigger re-scroll (biome-ignore required)
