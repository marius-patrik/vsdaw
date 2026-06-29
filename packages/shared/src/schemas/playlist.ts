import { z } from "zod";
import { EntityIdSchema, HexColorSchema } from "./base.js";
import { MixerInsertRefSchema } from "./channel.js";
import { SampleSchema, TickSchema } from "./time.js";

export const FadeTypeSchema = z.enum(["linear", "logarithmic", "exponential", "sCurve"]);

export const FadeSchema = z.object({
  type: FadeTypeSchema,
  durationTicks: TickSchema,
});

export const PatternClipSchema = z.object({
  type: z.literal("pattern"),
  id: EntityIdSchema,
  patternId: EntityIdSchema,
  startTick: TickSchema,
  durationTicks: TickSchema,
  offsetTicks: TickSchema.default(0),
  loop: z.boolean().default(false),
  color: HexColorSchema.optional(),
});

export const AudioClipSchema = z.object({
  type: z.literal("audio"),
  id: EntityIdSchema,
  assetId: EntityIdSchema,
  startTick: TickSchema,
  durationTicks: TickSchema,
  offsetSamples: SampleSchema.default(0),
  fadeIn: FadeSchema.default({ type: "linear", durationTicks: 0 }),
  fadeOut: FadeSchema.default({ type: "linear", durationTicks: 0 }),
  pitch: z.number().default(0),
  timeStretchRatio: z.number().positive().default(1),
  color: HexColorSchema.optional(),
});

export const AutomationClipRefSchema = z.object({
  type: z.literal("automation"),
  id: EntityIdSchema,
  automationClipId: EntityIdSchema,
  startTick: TickSchema,
  durationTicks: TickSchema,
  color: HexColorSchema.optional(),
});

export const ClipSchema = z.discriminatedUnion("type", [
  PatternClipSchema,
  AudioClipSchema,
  AutomationClipRefSchema,
]);

export const PlaylistTrackSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int().min(0),
  name: z.string().max(128),
  color: HexColorSchema.optional(),
  heightPx: z.number().int().min(20).default(60),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  recordArm: z.boolean().default(false),
  input: z.enum(["none", "stereo", "mono"]).default("none"),
  output: MixerInsertRefSchema.default({ insertId: "master" }),
  clips: z.array(ClipSchema),
});

export const PlaylistSchema = z.object({
  tracks: z.array(PlaylistTrackSchema).min(1),
});
