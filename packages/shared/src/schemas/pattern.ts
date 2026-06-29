import { z } from "zod";
import { PPQN } from "../constants.js";
import { AutomationPointSchema } from "./automation.js";
import { EntityIdSchema, HexColorSchema } from "./base.js";
import { TickSchema } from "./time.js";

export const NoteEventSchema = z.object({
  id: EntityIdSchema,
  key: z.number().int().min(0).max(127),
  velocity: z.number().int().min(0).max(127).default(100),
  pan: z.number().int().min(-64).max(63).default(0),
  startTick: TickSchema,
  durationTicks: TickSchema,
  channelId: EntityIdSchema.optional(),
  color: HexColorSchema.optional(),
});

export const PatternChannelDataSchema = z.object({
  notes: z.array(NoteEventSchema).default([]),
  events: z.array(AutomationPointSchema).default([]),
  stepSequence: z.array(z.boolean()).max(64).optional(),
});

export const PatternSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int().min(0),
  name: z.string().max(128),
  color: HexColorSchema.optional(),
  lengthTicks: TickSchema.default(PPQN * 4),
  channelData: z.record(EntityIdSchema, PatternChannelDataSchema).default({}),
});
