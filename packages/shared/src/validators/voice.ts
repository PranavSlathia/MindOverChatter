import { z } from "zod";

// --- Transcription (Whisper STT) ---

export const TranscribeResponseSchema = z.object({
  text: z.string(),
  language: z.string(),
  duration: z.number().min(0),
});

export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

// --- Synthesis (TTS) ---

/** Known kokoro-onnx voice identifiers. */
const KOKORO_VOICES = [
  "af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky",
  "am_adam", "am_michael", "bf_emma", "bf_isabella", "bm_george", "bm_lewis",
] as const;

export const SynthesizeRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.enum(KOKORO_VOICES).optional(),
});

export type SynthesizeRequest = z.infer<typeof SynthesizeRequestSchema>;
