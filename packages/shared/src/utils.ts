import { ENGINE_MAX_PAYLOAD_BYTES, PPQN, PROTOCOL_VERSION } from "./constants.js";
import { AssetRefSchema } from "./schemas/asset.js";
import {
  EngineMessageSchema,
  EventSchema,
  MessageSchema,
  ReplySchema,
} from "./schemas/envelope.js";
import { MixerInsertSchema } from "./schemas/mixer.js";
import { NoteEventSchema } from "./schemas/pattern.js";
import { ClipSchema } from "./schemas/playlist.js";
import { ProjectSchema } from "./schemas/project.js";
import type {
  BarBeatTick,
  Clip,
  EngineMessage,
  ErrorEnvelope,
  Event,
  Message,
  MixerInsert,
  NoteEvent,
  Project,
  Reply,
  Sample,
  Second,
  Tick,
  TimeSignature,
} from "./types.js";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createMessage<T>(type: string, payload: T): Message {
  return validateMessage({ id: generateId(), type, payload });
}

export function createReply<T>(
  requestId: string,
  success: boolean,
  payload?: T,
  error?: ErrorEnvelope,
): Reply {
  return validateReply({
    id: generateId(),
    type: "reply",
    inReplyTo: requestId,
    success,
    payload,
    error,
  });
}

export function createEvent<T>(topic: string, payload: T): Event {
  return validateEvent({ id: generateId(), type: "event", topic, payload });
}

export function validateMessage(input: unknown): Message {
  return MessageSchema.parse(input);
}

export function validateReply(input: unknown): Reply {
  return ReplySchema.parse(input);
}

export function validateEvent(input: unknown): Event {
  return EventSchema.parse(input);
}

export function validateEngineMessage(input: unknown): EngineMessage {
  return EngineMessageSchema.parse(input);
}

export function validateProject(input: unknown): Project {
  return ProjectSchema.parse(input);
}

export function isValidProject(input: unknown): input is Project {
  return ProjectSchema.safeParse(input).success;
}

export function validateAssetRef(input: unknown) {
  return AssetRefSchema.parse(input);
}

export function validateNoteEvent(input: unknown): NoteEvent {
  return NoteEventSchema.parse(input);
}

export function validateClip(input: unknown): Clip {
  return ClipSchema.parse(input);
}

export function validateMixerInsert(input: unknown): MixerInsert {
  return MixerInsertSchema.parse(input);
}

export function ticksToSeconds(ticks: Tick, bpm: number, ppqn = PPQN): Second {
  if (!Number.isFinite(ticks) || !Number.isFinite(bpm) || !Number.isFinite(ppqn)) {
    throw new RangeError("ticks, bpm, and ppqn must be finite");
  }
  return (ticks / ppqn) * (60 / bpm);
}

export function secondsToTicks(seconds: Second, bpm: number, ppqn = PPQN): Tick {
  if (!Number.isFinite(seconds) || !Number.isFinite(bpm) || !Number.isFinite(ppqn)) {
    throw new RangeError("seconds, bpm, and ppqn must be finite");
  }
  return Math.round(seconds * (bpm / 60) * ppqn);
}

export function samplesToSeconds(samples: Sample, sampleRate: number): Second {
  if (!Number.isFinite(samples) || !Number.isFinite(sampleRate)) {
    throw new RangeError("samples and sampleRate must be finite");
  }
  return samples / sampleRate;
}

export function secondsToSamples(seconds: Second, sampleRate: number): Sample {
  if (!Number.isFinite(seconds) || !Number.isFinite(sampleRate)) {
    throw new RangeError("seconds and sampleRate must be finite");
  }
  return Math.round(seconds * sampleRate);
}

export function ticksToBarBeatTick(
  ticks: Tick,
  timeSignature: TimeSignature,
  ppqn = PPQN,
): BarBeatTick {
  if (!Number.isFinite(ticks)) {
    throw new RangeError("ticks must be finite");
  }
  const ticksPerBeat = (ppqn * 4) / timeSignature.denominator;
  const ticksPerBar = ticksPerBeat * timeSignature.numerator;
  const bar = Math.floor(ticks / ticksPerBar);
  const remainder = ticks % ticksPerBar;
  const beat = Math.floor(remainder / ticksPerBeat);
  const tick = remainder % ticksPerBeat;
  return { bar, beat, tick };
}

export function barBeatTickToTicks(
  bbt: BarBeatTick,
  timeSignature: TimeSignature,
  ppqn = PPQN,
): Tick {
  if (!Number.isFinite(bbt.bar) || !Number.isFinite(bbt.beat) || !Number.isFinite(bbt.tick)) {
    throw new RangeError("bar, beat, and tick must be finite");
  }
  const ticksPerBeat = (ppqn * 4) / timeSignature.denominator;
  const ticksPerBar = ticksPerBeat * timeSignature.numerator;
  return bbt.bar * ticksPerBar + bbt.beat * ticksPerBeat + bbt.tick;
}

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
  remainder: Uint8Array;
} {
  const messages: EngineMessage[] = [];
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
    messages.push(validateEngineMessage(parsed));
    offset += 4 + length;
  }
  return { messages, remainder: buffer.subarray(offset) };
}
