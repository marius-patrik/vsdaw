import { z } from "zod";
import { EntityIdSchema, HexColorSchema } from "./base.js";
import { PluginInstanceSchema } from "./plugin.js";

export const PluginSlotSchema = z.object({
  slotIndex: z.number().int().min(0).max(9),
  plugin: PluginInstanceSchema.optional(),
  bypass: z.boolean().default(false),
});

export const SendSchema = z.object({
  targetInsertId: EntityIdSchema,
  levelDb: z.number().min(-80).max(12).default(0),
  preFader: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const InsertKindSchema = z.enum(["normal", "send", "master"]);

export const AudioInputSourceSchema = z.object({
  deviceInputIndex: z.number().int().min(0),
  label: z.string(),
});

export const MixerInsertSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int().min(0),
  name: z.string().max(128),
  color: HexColorSchema.optional(),
  kind: InsertKindSchema.default("normal"),
  volumeDb: z.number().min(-80).max(12).default(0),
  pan: z.number().min(-1).max(1).default(0),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  recordArm: z.boolean().default(false),
  inputSource: AudioInputSourceSchema.nullable().default(null),
  outputTargetId: EntityIdSchema.nullable().default(null),
  pluginSlots: z.array(PluginSlotSchema).max(10).default([]),
  sends: z.array(SendSchema).max(16).default([]),
});

export const MixerSchema = z.object({
  inserts: z.array(MixerInsertSchema).min(1),
});
