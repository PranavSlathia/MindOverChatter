# Voice Pipeline — Known Issues

Audit date: 2026-03-23
Last updated: 2026-03-23

All critical and high-severity voice pipeline issues have been resolved.

---

## Resolved

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Voice bypassed crisis detection | `CrisisCheckProcessor` in `bot.py` calls `POST /api/voice/check-turn` before each turn reaches Claude. Hard-coded crisis response served. |
| 2 | Voice skipped runOnEnd hooks | Voice transcript no longer auto-completes the session. Session stays active — user ends via normal text path which triggers `runOnEnd`. |
| 3 | VoiceChat ignored sessionId | `VoiceChat.tsx` accepts `sessionId` prop, passes to `/api/voice/start`. |
| 4 | Voice missing from health checks | `home.ts` pings `VOICE_SERVICE_URL`. `service-health-store.ts` tracks `voice` field. |
| 5 | Stop-ID contract bug | `/voice/start` returns both `sessionId` (MOC DB) and `voiceSessionId` (Pipecat). `/voice/stop` takes `voiceSessionId`. |
| 6 | Shared session bootstrap | `bootstrap.ts` extracts initialization (profile, formulation, memories, skills, `runOnStart`). Used by text create, text resume, and voice start. |
| 7 | Transcript appended to SDK session | `/voice/transcript` calls `appendMessagesToSession()` so next text turn sees voice history. |
| 8 | Voice emotion service never called | `VoiceEmotionProcessor` in `bot.py` buffers audio per user turn, sends to emotion service, reports to `POST /api/emotions`. Fire-and-forget, non-blocking. |
| 9 | README overclaims | Fixed: "Claude CLI (local)" not "Claude Agent SDK", "librosa" not "SenseVoice", "faster-whisper (base)" not "stronger whisper". |

---

## No remaining issues.
