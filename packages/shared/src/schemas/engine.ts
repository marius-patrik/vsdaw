import { z } from "zod";
import { ENGINE_MAX_PAYLOAD_BYTES } from "../constants.js";
import { EntityIdSchema } from "./base.js";

export const EngineErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const EngineMessageSchema = z
  .object({
    id: EntityIdSchema,
    type: z.string().min(1).max(128),
    payload: z.unknown(),
  })
  .strict();

export const EngineReplySchema = z
  .object({
    id: EntityIdSchema,
    inReplyTo: EntityIdSchema,
    success: z.boolean(),
    payload: z.unknown().optional(),
    error: EngineErrorSchema.optional(),
  })
  .strict();

export const EngineEventTopicSchema = z.enum([
  "transport",
  "meter",
  "error",
  "pluginScan",
  "renderProgress",
]);

export const EngineEventSchema = z
  .object({
    id: EntityIdSchema,
    type: z.literal("event"),
    topic: EngineEventTopicSchema,
    payload: z.unknown(),
  })
  .strict();

export const EngineFrameSchema = z.union([
  EngineMessageSchema,
  EngineReplySchema,
  EngineEventSchema,
]);

type EngineMessage = z.infer<typeof EngineMessageSchema>;
type EngineReply = z.infer<typeof EngineReplySchema>;
type EngineEvent = z.infer<typeof EngineEventSchema>;
export type EngineFrame = z.infer<typeof EngineFrameSchema>;
export type EngineEventTopic = z.infer<typeof EngineEventTopicSchema>;

export function serializeEngineFrame(message: EngineMessage): Uint8Array {
  const validated = EngineMessageSchema.parse(message);
  const payload = JSON.stringify(validated);
  const encoded = new TextEncoder().encode(payload);
  if (encoded.length > ENGINE_MAX_PAYLOAD_BYTES) {
    throw new Error(`payload exceeds ${ENGINE_MAX_PAYLOAD_BYTES} bytes`);
  }
  const frame = new Uint8Array(4 + encoded.length);
  const view = new DataView(frame.buffer);
  view.setUint32(0, encoded.length, false);
  frame.set(encoded, 4);
  return frame;
}

export function parseEngineFrames(buffer: Uint8Array): {
  messages: EngineMessage[];
  replies: EngineReply[];
  events: EngineEvent[];
  remainder: Uint8Array;
} {
  const messages: EngineMessage[] = [];
  const replies: EngineReply[] = [];
  const events: EngineEvent[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 4) {
      break;
    }
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
    const length = view.getUint32(0, false);
    if (length > ENGINE_MAX_PAYLOAD_BYTES) {
      throw new Error(`payload length ${length} exceeds ${ENGINE_MAX_PAYLOAD_BYTES} bytes`);
    }
    if (buffer.length - offset < 4 + length) {
      break;
    }
    const payloadBytes = buffer.subarray(offset + 4, offset + 4 + length);
    const payload = new TextDecoder().decode(payloadBytes);
    const parsed = JSON.parse(payload);
    const frame = EngineFrameSchema.parse(parsed);
    if ("topic" in frame) {
      events.push(frame as EngineEvent);
    } else if ("success" in frame) {
      replies.push(frame as EngineReply);
    } else {
      messages.push(frame as EngineMessage);
    }
    offset += 4 + length;
  }
  return { messages, replies, events, remainder: buffer.subarray(offset) };
}
