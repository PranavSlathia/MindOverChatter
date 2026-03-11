---
name: rest-sse-protocol
description: REST + SSE protocol conventions for MindOverChatter real-time communication between the frontend client and backend server.
user-invocable: false
---

# REST + SSE Protocol

## Purpose

REST + SSE protocol conventions for MindOverChatter real-time communication. All client-to-server interactions use standard REST endpoints (Hono routes with Zod validation). Server-to-client streaming uses Server-Sent Events (SSE) via Hono's `streamSSE` helper. Hono RPC provides end-to-end type safety.

## Architecture

```
Client (Pixel)                          Server (Forge/Neura)
     |                                        |
     |-- POST /api/sessions ----------------->|  Create session
     |<-------- 201 { sessionId } ------------|
     |                                        |
     |-- GET /api/sessions/:id/events ------->|  SSE connection (long-lived)
     |<======== SSE stream ===================|  ai.chunk, ai.thinking, etc.
     |                                        |
     |-- POST /api/sessions/:id/messages ---->|  Send user message
     |<-------- 202 { messageId } ------------|
     |<======== SSE: ai.chunk ================|  Streaming response
     |<======== SSE: ai.response_complete ====|
     |                                        |
     |-- POST /api/emotions ----------------->|  Fire-and-forget emotion data
     |<-------- 202 { received: true } -------|
     |                                        |
     |-- DELETE /api/sessions/:id ----------->|  End session
     |<-------- 200 { summary } --------------|
```

## REST Endpoints (Client to Server)

All endpoints use Zod validation via `@hono/zod-validator`. Types flow to the frontend via Hono RPC client inference.

### POST /api/sessions

Create a new session or resume an existing one.

```typescript
// Request body
{
  language: "hi-en"           // optional, default "hi-en"
  resumeSessionId?: string    // optional, to resume a previous session
}

// Response 201
{
  sessionId: string,
  resumed: boolean,
  greeting: string            // e.g. "Namaste! Aaj aap kaisa mehsoos kar rahe hain?"
}
```

### POST /api/sessions/:id/messages

Send a user message with optional multimodal emotion context. This is the primary endpoint for therapeutic conversation.

```typescript
// Request body
{
  text: string,                          // from Whisper transcription or typed input
  voiceEmotion?: {                       // from SenseVoice
    label: "happy" | "sad" | "angry" | "neutral",
    confidence: number                   // 0-1
  },
  prosody?: {                            // from librosa
    pitchMean: number,
    pitchStd: number,
    energy: number,
    speakingRate: number,
    mfccs: number[]                      // 13 coefficients
  },
  facialEmotion?: {                      // from Human.js
    dominant: string,
    scores: Record<string, number>
  },
  language?: string,                     // detected by Whisper
  audioConfidence?: number
}

// Response 202
{
  messageId: string,
  status: "accepted"
}
```

The AI response streams back over the SSE connection (see below).

### POST /api/emotions

Fire-and-forget emotion data ingestion (periodic face updates between messages).

```typescript
// Request body
{
  sessionId: string,
  dominant: string,
  scores: Record<string, number>
}

// Response 202
{
  received: true
}
```

### DELETE /api/sessions/:id

End the current session. Triggers summary generation and memory extraction.

```typescript
// Request body
{
  reason: "user_initiated" | "timeout" | "crisis_escalated"
}

// Response 200
{
  sessionId: string,
  summary: string
}
```

### POST /api/assessments

Submit a completed therapeutic assessment (PHQ-9, GAD-7).

```typescript
// Request body
{
  sessionId: string,
  type: "PHQ-9" | "GAD-7",
  responses: number[],
  totalScore: number
}

// Response 201
{
  assessmentId: string,
  severity: string
}
```

### POST /api/mood-logs

Log a mood check-in entry.

```typescript
// Request body
{
  mood: string,
  intensity: number,          // 1-10
  note?: string
}

// Response 201
{
  moodLogId: string
}
```

### GET /api/sessions

Retrieve past session summaries.

```typescript
// Query params
{
  limit?: number,             // default 20, max 100
  offset?: number             // default 0
}

// Response 200
{
  sessions: Session[],
  total: number
}
```

### GET /api/memories

Query the AI's memory for relevant past context.

```typescript
// Query params
{
  query: string,
  limit?: number              // default 5
}

// Response 200
{
  memories: Memory[]
}
```

## SSE Stream (Server to Client)

The client opens a long-lived SSE connection to receive real-time events:

```
GET /api/sessions/:id/events
Accept: text/event-stream
```

The server uses Hono's `streamSSE` helper to emit typed events. Each event has an `event` field (event type) and a `data` field (JSON payload).

### ai.chunk

A streaming chunk of the AI's response. Used for real-time token-by-token display.

```
event: ai.chunk
data: {"text": "It sounds like ", "done": false}

event: ai.chunk
data: {"text": "you're feeling overwhelmed.", "done": true}
```

The `done` flag indicates whether this is the final chunk. The client concatenates all chunks until `done: true`.

### ai.thinking

Indicates the AI is processing (for loading/thinking indicators in the UI).

```
event: ai.thinking
data: {"stage": "analyzing_emotion"}
```

### ai.response_complete

Sent after the final `ai.chunk`. Contains metadata about the completed response.

```
event: ai.response_complete
data: {"messageId": "ai-msg-uuid", "tokensUsed": 342, "emotionDetected": "empathetic_concern"}
```

### ai.audio_ready

TTS audio for the AI response is ready for playback.

```
event: ai.audio_ready
data: {"audioUrl": "/api/audio/tts-uuid.wav", "duration": 4.2, "format": "wav"}
```

### session.crisis

Triggered when the crisis detection system activates. The client must immediately display the hard-coded crisis response UI.

```
event: session.crisis
data: {"crisisResponse": "I hear you, and I want you to know...", "helplines": [...], "severity": "high"}
```

### emotion.ai_detected

The AI's assessment of the user's emotional state from merged multimodal signals.

```
event: emotion.ai_detected
data: {"primary": "anxious", "secondary": "hopeful", "confidence": 0.82}
```

### assessment.due

Notifies the client that a periodic assessment is due.

```
event: assessment.due
data: {"type": "PHQ-9", "reason": "bi_weekly_schedule", "lastCompleted": "2026-02-05T10:30:00Z"}
```

### error

A general error event.

```
event: error
data: {"code": 500, "message": "Internal error during emotion processing"}
```

## Example Exchange

A complete request-response cycle showing a user message with multimodal context and streaming AI response:

```
CLIENT -> SERVER (REST POST)
POST /api/sessions/session-uuid/messages
Content-Type: application/json

{
  "text": "Aaj bahut bura lag raha hai",
  "voiceEmotion": { "label": "sad", "confidence": 0.85 },
  "facialEmotion": { "dominant": "sad", "scores": { "sad": 0.75, "neutral": 0.15, "fearful": 0.10 } }
}

SERVER -> CLIENT (REST Response)
HTTP/1.1 202 Accepted
{ "messageId": "msg-42", "status": "accepted" }

SERVER -> CLIENT (SSE stream on /api/sessions/session-uuid/events)

event: ai.thinking
data: {"stage": "analyzing_emotion"}

event: ai.chunk
data: {"text": "Main ", "done": false}

event: ai.chunk
data: {"text": "samajh sakta hoon ", "done": false}

event: ai.chunk
data: {"text": "ki aaj din mushkil raha hai. ", "done": false}

event: ai.chunk
data: {"text": "Kya aap mujhe batana chahenge ki kya hua?", "done": true}

event: ai.response_complete
data: {"messageId": "ai-msg-99", "tokensUsed": 47, "emotionDetected": "empathetic_concern"}

event: ai.audio_ready
data: {"audioUrl": "/api/audio/tts-99.wav", "duration": 3.8, "format": "wav"}
```

## Implementation Notes

- **SSE reconnection**: The browser's `EventSource` API auto-reconnects on connection loss. The server sends `id:` fields with each event so the client can resume via `Last-Event-ID` header.
- **Hono RPC type safety**: All REST endpoints export their route types. The frontend uses `hc<AppType>()` for fully typed API calls with zero codegen.
- **Fire-and-forget emotions**: `POST /api/emotions` returns 202 immediately. Emotion data is processed asynchronously.
- **Audio via HTTP**: TTS audio is served via HTTP GET. The `ai.audio_ready` SSE event provides the URL. User audio is uploaded via HTTP POST to transcription/emotion services.
- **v2 consideration**: A dedicated WebSocket may be added in v2 ONLY for real-time audio streaming (bidirectional audio). All other communication remains REST + SSE.
