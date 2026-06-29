import { z } from "zod";
import { PROTOCOL_VERSION } from "../constants.js";
import { EntityIdSchema } from "./base.js";

export const ErrorCodeSchema = z.enum([
  "ERR_INVALID_MESSAGE",
  "ERR_UNKNOWN_TYPE",
  "ERR_VALIDATION_FAILED",
  "ERR_ENGINE_TIMEOUT",
  "ERR_ENGINE_NOT_CONNECTED",
  "ERR_PROJECT_NOT_FOUND",
  "ERR_UNAUTHORIZED_ACTION",
  "ERR_INTERNAL",
]);

export const ErrorEnvelopeSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().max(1024),
  details: z.unknown().optional(),
});

export const MessageSchema = z
  .object({
    id: EntityIdSchema,
    type: z.string().min(1).max(128),
    payload: z.unknown().refine((v) => v !== undefined, { message: "payload is required" }),
  })
  .passthrough();

export const ReplySchema = z
  .object({
    id: EntityIdSchema,
    type: z.literal("reply"),
    inReplyTo: EntityIdSchema,
    success: z.boolean(),
    payload: z.unknown().optional(),
    error: ErrorEnvelopeSchema.optional(),
  })
  .passthrough();

export const EventSchema = z
  .object({
    id: EntityIdSchema,
    type: z.literal("event"),
    topic: z.string().min(1).max(256),
    payload: z.unknown().refine((v) => v !== undefined, { message: "payload is required" }),
  })
  .passthrough();

export const EngineMessageSchema = z
  .object({
    id: EntityIdSchema,
    type: z.string().min(1).max(128),
    payload: z.unknown().refine((v) => v !== undefined, { message: "payload is required" }),
  })
  .strict();

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  protocolVersion: z.literal(PROTOCOL_VERSION),
});
