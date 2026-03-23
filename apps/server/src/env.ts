import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  WHISPER_SERVICE_URL: z.string().url().default("http://localhost:8001"),
  EMOTION_SERVICE_URL: z.string().url().default("http://localhost:8002"),
  TTS_SERVICE_URL: z.string().url().default("http://localhost:8003"),
  MEMORY_SERVICE_URL: z.string().url().default("http://localhost:8004"),
  VOICE_SERVICE_URL: z.string().url().default("http://localhost:8005"),
  CLAUDE_MODEL: z.string().default("sonnet"),
  CLAUDE_HAIKU_MODEL: z.string().default("haiku"),
  CLAUDE_OPUS_MODEL: z.string().default("opus"),
  GROQ_API_KEY: z.string().optional(),
  GEMINI_ENABLED: z.coerce.boolean().default(false),
  CODEX_ENABLED: z.coerce.boolean().default(false),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash-lite"),
  CODEX_MODEL: z.string().default("o3-mini"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
