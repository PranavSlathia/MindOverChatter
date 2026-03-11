import { z } from "zod";

export const SendMessageSchema = z.object({
  text: z.string().min(1).max(10000),
});

export const MessageResponseSchema = z.object({
  messageId: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export type SendMessage = z.infer<typeof SendMessageSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
