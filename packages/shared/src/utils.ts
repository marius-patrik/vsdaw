import { ENGINE_MAX_PAYLOAD_BYTES, PPQN } from "./constants.js";
import {
  EngineMessageSchema,
  EventSchema,
  MessageSchema,
  ReplySchema,
} from "./schemas/envelope.js";
import { ProjectSchema } from "./schemas/project.js";
import type { EngineMessage, Event, Message, Project, Reply, TimeSignature } from "./types.js";

export interface MusicalTime {
  bars: number;
  beats: number;
  ticks: number;
}

export function ticksToSeconds(ticks: number, bpm: number, ppqn = PPQN): number {
  if (!Number.isFinite(ticks) || !Number.isFinite(bpm) || !Number.isFinite(ppqn)) {
    throw new RangeError("ticks, bpm, and ppqn must be finite");
  }
  return (ticks / ppqn) * (60 / bpm);
}

export function secondsToTicks(seconds: number, bpm: number, ppqn = PPQN): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(bpm) || !Number.isFinite(ppqn)) {
    throw new RangeError("seconds, bpm, and ppqn must be finite");
  }
  return Math.round(seconds * (bpm / 60) * ppqn);
}

export function ticksToMusicalTime(
  ticks: number,
  timeSignature: TimeSignature,
  ppqn = PPQN,
): MusicalTime {
  if (!Number.isFinite(ticks)) {
    throw new RangeError("ticks must be finite");
  }
  const ticksPerBeat = (ppqn * 4) / timeSignature.denominator;
  const ticksPerBar = ticksPerBeat * timeSignature.numerator;
  const bars = Math.floor(ticks / ticksPerBar);
  const remainder = ticks % ticksPerBar;
  const beats = Math.floor(remainder / ticksPerBeat);
  const remTicks = remainder % ticksPerBeat;
  return { bars, beats, ticks: remTicks };
}

export function musicalTimeToTicks(
  musicalTime: MusicalTime,
  timeSignature: TimeSignature,
  ppqn = PPQN,
): number {
  if (
    !Number.isFinite(musicalTime.bars) ||
    !Number.isFinite(musicalTime.beats) ||
    !Number.isFinite(musicalTime.ticks)
  ) {
    throw new RangeError("musical time components must be finite");
  }
  const ticksPerBeat = (ppqn * 4) / timeSignature.denominator;
  const ticksPerBar = ticksPerBeat * timeSignature.numerator;
  return musicalTime.bars * ticksPerBar + musicalTime.beats * ticksPerBeat + musicalTime.ticks;
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
