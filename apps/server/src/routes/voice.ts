// ── Voice Routes ────────────────────────────────────────────────
// POST /transcribe      — Proxy audio to whisper service for STT
// POST /tts             — Proxy text to TTS service, return audio
// POST /voice/start     — Start voice session (Daily.co + Pipecat)
// POST /voice/stop      — Stop voice session

import { zValidator } from "@hono/zod-validator";
import { SynthesizeRequestSchema } from "@moc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { env } from "../env.js";

const app = new Hono()

  // ── POST /transcribe — Speech-to-Text ───────────────────────
  .post("/transcribe", async (c) => {
    // Forward the multipart body directly to the whisper service.
    // The whisper service expects a multipart file upload with key "file".
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json(
        { error: "MISSING_FILE", message: "Audio file is required (multipart key: 'file')" },
        400,
      );
    }

    // Build a new FormData to forward to the whisper service
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${env.WHISPER_SERVICE_URL}/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return c.json(
          {
            error: "WHISPER_ERROR",
            message: `Whisper service returned ${String(response.status)}`,
            detail: errorText,
          },
          response.status as 400 | 422 | 500,
        );
      }

      const result = await response.json();
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json(
        { error: "WHISPER_UNAVAILABLE", message: `Whisper service unavailable: ${message}` },
        503,
      );
    }
  })

  // ── POST /tts — Text-to-Speech ──────────────────────────────
  .post("/tts", zValidator("json", SynthesizeRequestSchema), async (c) => {
    const body = c.req.valid("json");

    try {
      const response = await fetch(`${env.TTS_SERVICE_URL}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return c.json(
          {
            error: "TTS_ERROR",
            message: `TTS service returned ${String(response.status)}`,
            detail: errorText,
          },
          response.status as 400 | 500,
        );
      }

      // Stream the WAV audio back to the client
      const audioBuffer = await response.arrayBuffer();
      return new Response(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": String(audioBuffer.byteLength),
          "Content-Disposition": "inline; filename=speech.wav",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json(
        { error: "TTS_UNAVAILABLE", message: `TTS service unavailable: ${message}` },
        503,
      );
    }
  })

  // ── POST /voice/start — Start voice chat session ──────────────
  .post(
    "/voice/start",
    zValidator(
      "json",
      z.object({
        sessionId: z.string().uuid().optional(),
      }),
    ),
    async (c) => {
      // Build the system prompt from session context
      // For now, use a minimal prompt; Phase V2 will wire up memory blocks + therapy plan
      const systemPrompt = [
        "You are a warm, empathetic wellness companion called MindOverChatter.",
        "You speak naturally in a conversational tone, as if talking to a close friend.",
        "Keep responses concise (2-4 sentences) since this is a voice conversation.",
        "Never claim to be a therapist. You are a wellness companion.",
        "If the user expresses suicidal thoughts, self-harm, or immediate danger:",
        "  - Say: 'I hear you, and I want you to know support is available right now.'",
        "  - Provide: 988 Suicide & Crisis Lifeline (call or text 988)",
        "  - Provide: iCall: 9152987821, Vandrevala Foundation: 1860-2662-345",
      ].join("\n");

      try {
        const response = await fetch(`${env.VOICE_SERVICE_URL}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_prompt: systemPrompt,
            moc_session_id: c.req.valid("json").sessionId ?? null,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return c.json(
            { error: "VOICE_START_FAILED", message: errorText },
            response.status as 502 | 503,
          );
        }

        const result = await response.json();
        return c.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return c.json(
          { error: "VOICE_UNAVAILABLE", message: `Voice service unavailable: ${message}` },
          503,
        );
      }
    },
  )

  // ── POST /voice/stop — Stop voice chat session ───────────────
  .post(
    "/voice/stop",
    zValidator("json", z.object({ sessionId: z.string() })),
    async (c) => {
      try {
        const response = await fetch(`${env.VOICE_SERVICE_URL}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: c.req.valid("json").sessionId }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return c.json(
            { error: "VOICE_STOP_FAILED", message: errorText },
            response.status as 404 | 500,
          );
        }

        const result = await response.json();
        return c.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return c.json(
          { error: "VOICE_UNAVAILABLE", message: `Voice service unavailable: ${message}` },
          503,
        );
      }
    },
  );

// ── Export ────────────────────────────────────────────────────────

export type VoiceRoutes = typeof app;
export default app;
