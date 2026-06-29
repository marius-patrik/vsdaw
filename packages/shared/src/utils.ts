import { PPQN } from "./constants.js";
import { EventSchema, MessageSchema, ReplySchema } from "./schemas/envelope.js";
import { ProjectSchema } from "./schemas/project.js";
import type { Event, Message, Project, Reply, TimeSignature } from "./types.js";

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

export function validateProject(input: unknown): Project {
  return ProjectSchema.parse(input);
}
