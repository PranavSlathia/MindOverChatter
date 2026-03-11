# MindOverChatter

**your brain's been yapping. time to yap back (therapeutically).**

MindOverChatter is an AI-powered mental wellness companion that actually *gets* you. No corporate meditation apps with suspiciously calm voiceovers. No "have you tried journaling?" for the 47th time. Just real, evidence-based therapeutic conversations that meet you where you're at.

---

## what even is this

Think of it as your pocket therapist that doesn't charge $200/hour and never cancels on you. MindOverChatter uses multimodal AI to understand not just *what* you're saying, but *how* you're saying it — your voice, your face, all of it.

**the vibe check stack:**
- Real-time voice emotion analysis (it knows when you say "I'm fine" but you're not fine)
- Facial expression recognition (your face is a terrible liar, we use that)
- CBT and Motivational Interviewing techniques (actual therapy stuff, not just vibes)
- Bilingual support (English + Hindi, because code-switching is valid)
- Crisis detection with instant helpline routing (we take the serious stuff seriously)

## how it works

```
you: *talks about your day*
MindOverChatter: *actually listens*
                 *analyzes vocal emotion + facial cues*
                 *responds with evidence-based therapeutic techniques*
                 *remembers context across sessions like a real therapist would*
you: "this is better than my last therapist"
```

## tech under the hood

Turborepo monorepo because we're organized like that.

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | React 19 + Vite 6 + Tailwind v4 | fast, pretty, no drama |
| Backend | Hono + Drizzle ORM + PostgreSQL | type-safe from DB to UI |
| AI Brain | Claude SDK + Mem0 | conversations that remember |
| Voice | Faster Whisper | speech-to-text that doesn't butcher Hindi |
| Emotion | Custom ML pipeline | reading the room (literally) |
| TTS | Text-to-Speech service | responds with a calming voice |
| Real-time | REST + SSE (Server-Sent Events) | instant, no refresh-button-mashing |

## project structure

```
moc/
  apps/
    web/          # React frontend (the pretty face)
    server/       # Hono backend (the big brain)
  packages/
    shared/       # Types + validators (the glue)
  services/
    whisper/      # Speech-to-text (the ears)
    emotion/      # Emotion analysis (the empath)
    tts/          # Text-to-speech (the voice)
```

## getting started

```bash
# clone it
git clone https://github.com/PranavSlathia/MindOverChatter.git
cd MindOverChatter

# install deps
pnpm install

# spin up everything
docker compose up

# or just the dev servers
pnpm dev
```

**prerequisites:** Node 20+, pnpm 9+, Docker (for the Python ML services)

## dev commands

```bash
pnpm dev          # run all services in parallel
pnpm build        # build everything
pnpm lint         # biome says your code is mid
pnpm test         # make sure nothing's broken
pnpm gen          # scaffold new features with hygen
pnpm db:generate  # generate drizzle migrations
pnpm db:push      # push schema changes
```

## the serious bit

MindOverChatter is **not** a replacement for professional therapy. It's a supplement — a tool to help you build awareness, practice coping skills, and access support between sessions. If you're in crisis, we route you to real humans immediately.

**Crisis resources are always one message away.**

## contributing

This is currently a solo project by [@PranavSlathia](https://github.com/PranavSlathia), but the codebase is built for collaboration. Check out the architecture docs if you're curious:

- `ARCHITECTURE.md` — system design + service map
- `TECHSTACK.md` — why we picked what we picked
- `CODEGEN.md` — code generation patterns + conventions

## license

MIT — because mental health tools should be accessible.

---

*built with love, caffeine, and an unreasonable amount of Claude API calls.*
