import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  WHISPER_SERVICE_URL: z.string().url().default("http://localhost:8001"),
  EMOTION_SERVICE_URL: z.string().url().default("http://localhost:8002"),
  TTS_SERVICE_URL: z.string().url().default("http://localhost:8003"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
