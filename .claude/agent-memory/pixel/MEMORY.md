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

## Human.js Integration

- Dynamic import (`await import("@vladmandic/human")`) to avoid ~1.5MB in main bundle
- Config: face + emotion only, all other models disabled (body, hand, iris, mesh, object, gesture, segmentation)
- Models loaded from CDN: `https://cdn.jsdelivr.net/npm/@vladmandic/human/models/`
- Detection interval: 5 seconds (wellness context, not real-time)
- Hidden `<video>` element created programmatically (not in DOM tree)
- WebGL backend preferred
- `EmotionScores` interface needs `{ ...scores }` spread to satisfy `Record<string, number>` for API types
- Camera resolution: 320x240 (low res, sufficient for emotion)

## Recharts Integration

- recharts v3 installed, statically imported (included in main bundle ~724KB)
- Theme colors used directly as hex strings in chart config (not CSS variables -- Recharts needs hex)
- `ResponsiveContainer` wraps all charts

## Voice Pipeline (Phase 6A)

- `useAudioRecorder` hook: MediaRecorder API, webm/opus preferred, 60s auto-stop safety limit
- Transcription: multipart/form-data POST to `/api/transcribe`, result fills textarea (user can edit before sending)
- TTS: JSON POST to `/api/tts`, returns audio blob, played via `new Audio(objectURL)`
- Both `transcribe` and `synthesize` use plain fetch (not Hono RPC) since they deal with binary data
- Mic button: subtle (foreground/10 bg), turns red+pulsing when recording, spinner when transcribing
- TTS button: small speaker icon on assistant messages only, hides on error, auto-resets after 2s
- Voice errors auto-dismiss after 5 seconds
- `biome-ignore lint/correctness/useExhaustiveDependencies` needed for audioBlob-triggered transcription effect

## Performance Notes

- Zustand store actions are stable references (safe in useEffect deps)
- Scroll effect uses state values as deps to trigger re-scroll (biome-ignore required)
- Human.js code-split into separate chunk (~1.5MB gzipped ~423KB) via dynamic import
