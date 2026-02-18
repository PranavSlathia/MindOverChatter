---
name: websocket-protocol
description: JSON-RPC 2.0 WebSocket protocol conventions for MindOverChatter real-time communication between the frontend client and backend server.
user-invocable: false
---

# WebSocket Protocol

## Purpose

JSON-RPC 2.0 WebSocket protocol conventions for MindOverChatter real-time communication. All real-time interaction between the frontend (Pixel) and backend (Forge) flows through a single WebSocket connection per client session, using JSON-RPC 2.0 message framing.

## Connection

- **URL**: `ws://localhost:3000/ws`
- **Lifecycle**: One WebSocket connection per client session. Opened when the user starts a session, closed when the session ends or the user navigates away.
- **Reconnection**: Client implements exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s). On reconnect, client sends `session.start` with the existing session ID to resume.

## Message Format

All messages follow the JSON-RPC 2.0 specification:

### Request (expects a response)

```json
{
  "jsonrpc": "2.0",
  "method": "method.name",
  "params": { ... },
  "id": "unique-request-id"
}
```

### Response (to a request)

```json
{
  "jsonrpc": "2.0",
  "result": { ... },
  "id": "matching-request-id"
}
```

### Notification (no response expected)

```json
{
  "jsonrpc": "2.0",
  "method": "method.name",
  "params": { ... }
}
```

The key distinction: **Requests** include an `id` and expect a **Response** with the same `id`. **Notifications** have no `id` and the receiver must not reply to them.

## Client to Server Methods

These are **requests** sent by the frontend to the backend. Each expects a response.

### session.start

Begin a new session or resume an existing one.

```json
{
  "jsonrpc": "2.0",
  "method": "session.start",
  "params": {
    "userId": "user-uuid",
    "sessionId": "session-uuid-or-null",
    "language": "hi-en"
  },
  "id": "req-1"
}
```

### session.end

Gracefully end the current session.

```json
{
  "jsonrpc": "2.0",
  "method": "session.end",
  "params": {
    "sessionId": "session-uuid",
    "reason": "user_initiated"
  },
  "id": "req-2"
}
```

### message.send

Send a user message with optional multimodal emotion context. This is the primary message type for therapeutic conversation.

```json
{
  "jsonrpc": "2.0",
  "method": "message.send",
  "params": {
    "text": "Main bhi theek hoon I guess",
    "voiceEmotion": {
      "label": "sad",
      "confidence": 0.78
    },
    "prosody": {
      "pitchMean": 142.5,
      "pitchStd": 18.3,
      "energy": 0.34,
      "speakingRate": 112,
      "mfccs": [-12.3, 4.5, -2.1, 1.8, -0.5, 3.2, -1.1, 0.7, -0.3, 2.1, -0.8, 1.5, -0.2]
    },
    "facialEmotion": {
      "dominant": "sad",
      "scores": {
        "happy": 0.02,
        "sad": 0.71,
        "angry": 0.05,
        "fearful": 0.08,
        "disgusted": 0.01,
        "surprised": 0.03,
        "neutral": 0.10
      }
    },
    "language": "hi-en",
    "audioConfidence": 0.92
  },
  "id": "msg-uuid-1"
}
```

The `voiceEmotion`, `prosody`, and `facialEmotion` fields are all optional. Text-only messages omit them. The backend handles any combination of present/absent emotion channels.

### emotion.face_update

Periodic face emotion updates sent between messages (e.g., while the user is listening to the AI response). This is a **request** so the server can acknowledge receipt.

```json
{
  "jsonrpc": "2.0",
  "method": "emotion.face_update",
  "params": {
    "dominant": "neutral",
    "scores": { "happy": 0.05, "sad": 0.10, "neutral": 0.70, "...": "..." }
  },
  "id": "face-1"
}
```

### assessment.submit

Submit a completed therapeutic assessment (e.g., PHQ-9, GAD-7).

```json
{
  "jsonrpc": "2.0",
  "method": "assessment.submit",
  "params": {
    "type": "PHQ-9",
    "responses": [0, 1, 2, 1, 0, 1, 2, 1, 0],
    "totalScore": 8
  },
  "id": "assess-1"
}
```

### mood.log

Log a mood check-in entry.

```json
{
  "jsonrpc": "2.0",
  "method": "mood.log",
  "params": {
    "mood": "anxious",
    "intensity": 6,
    "note": "Exam tomorrow, feeling tense"
  },
  "id": "mood-1"
}
```

### memory.query

Query the AI's memory for relevant past context.

```json
{
  "jsonrpc": "2.0",
  "method": "memory.query",
  "params": {
    "query": "What did we discuss about sleep issues?",
    "limit": 5
  },
  "id": "mem-1"
}
```

### session.history

Retrieve past session summaries.

```json
{
  "jsonrpc": "2.0",
  "method": "session.history",
  "params": {
    "limit": 10,
    "offset": 0
  },
  "id": "hist-1"
}
```

## Server to Client Notifications

These are **notifications** sent by the backend to the frontend. They have no `id` and do not expect a response.

### ai.chunk

A streaming chunk of the AI's response. Used for real-time token-by-token display.

```json
{
  "jsonrpc": "2.0",
  "method": "ai.chunk",
  "params": {
    "text": "It sounds like ",
    "done": false
  }
}
```

The `done` flag indicates whether this is the final chunk. When `done: true`, the full response is complete. The client should concatenate all chunks received for a given response cycle.

### ai.thinking

Indicates the AI is processing (for loading/thinking indicators in the UI).

```json
{
  "jsonrpc": "2.0",
  "method": "ai.thinking",
  "params": {
    "stage": "analyzing_emotion"
  }
}
```

### ai.response_complete

Sent after the final `ai.chunk` with `done: true`. Contains metadata about the completed response.

```json
{
  "jsonrpc": "2.0",
  "method": "ai.response_complete",
  "params": {
    "messageId": "ai-msg-uuid",
    "tokensUsed": 342,
    "emotionDetected": "empathetic_concern"
  }
}
```

### ai.audio_ready

TTS audio for the AI response is ready for playback.

```json
{
  "jsonrpc": "2.0",
  "method": "ai.audio_ready",
  "params": {
    "audioUrl": "/api/audio/tts-uuid.wav",
    "duration": 4.2,
    "format": "wav"
  }
}
```

### session.started

Confirms a session has been successfully started or resumed.

```json
{
  "jsonrpc": "2.0",
  "method": "session.started",
  "params": {
    "sessionId": "session-uuid",
    "resumed": false,
    "greeting": "Namaste! Aaj aap kaisa mehsoos kar rahe hain?"
  }
}
```

### session.ended

Confirms the session has been closed.

```json
{
  "jsonrpc": "2.0",
  "method": "session.ended",
  "params": {
    "sessionId": "session-uuid",
    "summary": "Discussed exam anxiety and sleep patterns"
  }
}
```

### session.crisis

Triggered when the crisis detection system activates. The client must immediately display the hard-coded crisis response UI.

```json
{
  "jsonrpc": "2.0",
  "method": "session.crisis",
  "params": {
    "crisisResponse": "I hear you, and I want you to know that what you're feeling matters...",
    "helplines": [
      { "name": "Vandrevala Foundation", "number": "1860-2662-345" },
      { "name": "iCall", "number": "9152987821" }
    ],
    "severity": "high"
  }
}
```

### emotion.ai_detected

The AI's own assessment of the user's emotional state, derived from the merged multimodal signals.

```json
{
  "jsonrpc": "2.0",
  "method": "emotion.ai_detected",
  "params": {
    "primary": "anxious",
    "secondary": "hopeful",
    "confidence": 0.82
  }
}
```

### assessment.due

Notifies the client that a periodic assessment is due.

```json
{
  "jsonrpc": "2.0",
  "method": "assessment.due",
  "params": {
    "type": "PHQ-9",
    "reason": "bi_weekly_schedule",
    "lastCompleted": "2026-02-05T10:30:00Z"
  }
}
```

### error

A general error notification for non-request-specific errors.

```json
{
  "jsonrpc": "2.0",
  "method": "error",
  "params": {
    "code": -32603,
    "message": "Internal error during emotion processing"
  }
}
```

## Error Codes

Standard JSON-RPC 2.0 error codes used in response `error` objects:

| Code | Name | Meaning |
|------|------|---------|
| -32700 | Parse error | Invalid JSON received |
| -32600 | Invalid request | JSON is valid but not a valid JSON-RPC 2.0 message |
| -32601 | Method not found | The method name is not recognized |
| -32602 | Invalid params | Method params are invalid or missing required fields |
| -32603 | Internal error | Server-side error during processing |

Error responses to requests follow this format:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Method 'session.foo' not found"
  },
  "id": "req-that-failed"
}
```

## Example Exchange

A complete request-response cycle showing a user message with multimodal context and streaming AI response:

```
CLIENT -> SERVER (Request)
{
  "jsonrpc": "2.0",
  "method": "message.send",
  "params": {
    "text": "Aaj bahut bura lag raha hai",
    "voiceEmotion": { "label": "sad", "confidence": 0.85 },
    "facialEmotion": { "dominant": "sad", "scores": { "sad": 0.75, "neutral": 0.15, "fearful": 0.10 } }
  },
  "id": "msg-42"
}

SERVER -> CLIENT (Notification: thinking)
{
  "jsonrpc": "2.0",
  "method": "ai.thinking",
  "params": { "stage": "analyzing_emotion" }
}

SERVER -> CLIENT (Notification: streaming chunks)
{ "jsonrpc": "2.0", "method": "ai.chunk", "params": { "text": "Main ", "done": false } }
{ "jsonrpc": "2.0", "method": "ai.chunk", "params": { "text": "samajh ", "done": false } }
{ "jsonrpc": "2.0", "method": "ai.chunk", "params": { "text": "sakta hoon ", "done": false } }
{ "jsonrpc": "2.0", "method": "ai.chunk", "params": { "text": "ki aaj din mushkil raha hai. ", "done": false } }
{ "jsonrpc": "2.0", "method": "ai.chunk", "params": { "text": "Kya aap mujhe batana chahenge ki kya hua?", "done": true } }

SERVER -> CLIENT (Notification: response complete)
{
  "jsonrpc": "2.0",
  "method": "ai.response_complete",
  "params": { "messageId": "ai-msg-99", "tokensUsed": 47, "emotionDetected": "empathetic_concern" }
}

SERVER -> CLIENT (Response to original request)
{
  "jsonrpc": "2.0",
  "result": { "messageId": "ai-msg-99", "status": "delivered" },
  "id": "msg-42"
}

SERVER -> CLIENT (Notification: audio ready)
{
  "jsonrpc": "2.0",
  "method": "ai.audio_ready",
  "params": { "audioUrl": "/api/audio/tts-99.wav", "duration": 3.8, "format": "wav" }
}
```

## Implementation Notes

- **Notifications have no `id`**: The receiver must not send a response to notifications. Attempting to reply to a notification is a protocol violation.
- **Streaming uses `done` flag**: The `ai.chunk` notification includes a `done: boolean` field. The client accumulates text from chunks until it receives one with `done: true`, which signals the end of the streaming response.
- **Request IDs are client-generated**: The client generates unique IDs for each request (UUIDs recommended). The server echoes the same ID in the response.
- **One response per request**: Every request with an `id` gets exactly one response. The streaming chunks are notifications (no `id`), not responses. The actual response to `message.send` comes after streaming is complete.
- **Order of server messages**: For a `message.send` request, the server sends: `ai.thinking` (notification) -> `ai.chunk` stream (notifications) -> `ai.response_complete` (notification) -> response (with `id`) -> `ai.audio_ready` (notification, if TTS enabled).
- **Binary data**: Audio is not sent over WebSocket. TTS audio is served via HTTP and the `ai.audio_ready` notification provides the URL. User audio is uploaded via HTTP POST to the transcription and emotion services.
