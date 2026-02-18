---
name: sdk-session-management
description: Claude Agent SDK session lifecycle management for therapeutic conversations including context assembly, hooks, and streaming
user-invocable: false
---

# Claude Agent SDK Session Management

## Purpose

Claude Agent SDK session lifecycle management for MindOverChatter's therapeutic conversations. Each therapy session maps to an SDK conversation with structured context assembly, hook-based safety monitoring, and streaming delivery over WebSocket.

## Session Lifecycle

### 1. Create (Context Assembly)

When a user starts or resumes a therapy session, the server assembles a context window before the first SDK call.

**Context budget (~4000 tokens total):**

| Component | Approx Tokens | Source |
|---|---|---|
| System prompt | ~500 | Static therapeutic persona + rules |
| User profile | ~500 | Demographics, preferences, language, therapy goals |
| Last session summary | ~300 | Compressed summary from previous session |
| Mem0 memories | ~1500 | Retrieved semantic memories relevant to current context |
| Conversation history | ~1200 | Recent messages from current session |

The system prompt establishes the therapeutic persona, framing rules (wellness companion, not therapist), language preferences (English/Hindi/Hinglish), and safety protocols. Mem0 memories are retrieved via semantic search against the user's current message to surface relevant past context.

### 2. Query (Streaming via Async Generator)

The SDK conversation uses async generator streaming. Each `query()` call yields streaming events that are transformed and forwarded to the client.

```ts
const stream = conversation.query(userMessage);

for await (const event of stream) {
  switch (event.type) {
    case "text_delta":
      // Forward as ai.chunk via WebSocket
      ws.send(jsonrpc("ai.chunk", { delta: event.text }));
      break;
    case "thinking_delta":
      // Forward as ai.thinking via WebSocket
      ws.send(jsonrpc("ai.thinking", { delta: event.text }));
      break;
    case "result":
      // Forward as ai.response_complete via WebSocket
      ws.send(jsonrpc("ai.response_complete", { message: event.text }));
      break;
  }
}
```

### 3. End (Summarize + Update Memory)

When the session ends (user exits or timeout), the server:

1. Generates a session summary using a separate SDK call with a summarization prompt
2. Extracts key facts and emotional themes for Mem0 storage
3. Stores the summary in the sessions table for next-session context
4. Updates the user's mood trajectory and session metadata

## Hook Architecture

Hooks run on every tool use within the SDK conversation, providing safety and extraction layers.

### PreToolUse Hook: Crisis Detection

Runs BEFORE any tool execution. Scans the user's message for crisis indicators. If detected, halts normal flow and returns the hard-coded crisis response immediately. See the `therapeutic-safety` skill for the full crisis detection pipeline.

### PostToolUse Hooks

Run AFTER tool execution completes:

- **Emotion Extraction:** Classifies the emotional tone of the user's message (joy, sadness, anger, anxiety, neutral, etc.) and logs it to the session timeline.
- **Fact Extraction:** Identifies new personal facts, preferences, or life events mentioned by the user and stores them in Mem0 for long-term memory.
- **Audit Logging:** Records every tool invocation, input/output, and timing to the audit log table for compliance and debugging.

## MCP Configuration

The SDK session is configured with an MCP server that gives Claude controlled access to the database.

```ts
const mcpConfig = {
  servers: [
    {
      name: "postgres",
      type: "postgresql",
      connectionString: process.env.DATABASE_URL,
      allowedOperations: ["read", "write"],
      allowedTables: ["sessions", "messages", "memories", "user_profiles"],
    },
  ],
};
```

This allows Claude to read user history and write new memories/messages directly, reducing round-trips through application code.

## Resume Pattern

For cross-session continuity, the SDK supports resuming a previous conversation:

```ts
const conversation = await sdk.createConversation({
  resume: previousSdkSessionId,
  // Context is rebuilt from the previous session's state
});
```

The `resume` field takes the SDK session ID from the previous conversation. The SDK restores the conversation state, and the server supplements it with the freshly assembled context (new memories, updated profile, etc.).

## Message Transformation

SDK streaming events are transformed into JSON-RPC 2.0 notifications delivered over the WebSocket connection:

| SDK Event | JSON-RPC Method | Payload |
|---|---|---|
| `text_delta` | `ai.chunk` | `{ delta: string }` |
| `thinking_delta` | `ai.thinking` | `{ delta: string }` |
| `result` | `ai.response_complete` | `{ message: string, sessionId: string }` |
| `tool_use` | `ai.tool_use` | `{ tool: string, input: object }` |
| `error` | `ai.error` | `{ code: number, message: string }` |

All notifications follow the JSON-RPC 2.0 spec with no `id` field (notifications, not requests).

## Skill Loading

Skill files from `.claude/skills/*.md` are injected into the SDK session's system context at conversation creation time. This provides Claude with domain-specific knowledge about the codebase, therapeutic frameworks, and safety protocols without hardcoding them into the application.

```ts
const skills = await loadSkillFiles(".claude/skills/");
const systemPrompt = [basePrompt, ...skills.map(s => s.content)].join("\n\n");
```
