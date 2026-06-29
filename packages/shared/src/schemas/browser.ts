import { z } from "zod";

export const BrowserActionTypeSchema = z.enum(["click", "type", "fill"]);

export const BrowserActionSchema = z.object({
  type: BrowserActionTypeSchema,
  selector: z.string().min(1),
  text: z.string().optional(),
});

export const BrowserSessionSchema = z.object({
  sessionId: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.string().datetime(),
});
