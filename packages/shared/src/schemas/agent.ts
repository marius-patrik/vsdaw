import { z } from "zod";

export const AgentToolCallSchema = z.object({
  requestId: z.string().min(1),
  name: z.string().min(1),
  arguments: z.unknown(),
});

export const AgentToolResultSchema = z.object({
  requestId: z.string(),
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export const AgentSessionSchema = z.object({
  sessionId: z.string(),
  createdAt: z.string().datetime(),
});
