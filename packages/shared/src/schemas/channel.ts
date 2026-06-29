import { z } from "zod";
import { EntityIdSchema, HexColorSchema } from "./base.js";
import { PluginInstanceSchema } from "./plugin.js";

export const CHANNEL_TYPES = ["sampler", "vstInstrument", "audioClip", "layer", "midiOut"] as const;
export const ChannelTypeSchema = z.enum(CHANNEL_TYPES);

export const MixerInsertRefSchema = z.object({
  insertId: EntityIdSchema,
});

export const SamplerChannelSettingsSchema = z.object({
  type: z.literal("sampler"),
  sampleAssetId: EntityIdSchema,
  rootNote: z.number().int().min(0).max(127).default(60),
  loopMode: z.enum(["none", "forward", "pingPong"]).default("none"),
});

export const VstInstrumentChannelSettingsSchema = z.object({
  type: z.literal("vstInstrument"),
  plugin: PluginInstanceSchema,
});

export const AudioClipChannelSettingsSchema = z.object({
  type: z.literal("audioClip"),
  defaultAssetId: EntityIdSchema,
});

export const LayerChannelSettingsSchema = z.object({
  type: z.literal("layer"),
  childChannelIds: z.array(EntityIdSchema).max(256),
});

export const MidiOutChannelSettingsSchema = z.object({
  type: z.literal("midiOut"),
  deviceId: z.string().max(256).optional(),
  channel: z.number().int().min(1).max(16).default(1),
});

export const ChannelSettingsSchema = z.discriminatedUnion("type", [
  SamplerChannelSettingsSchema,
  VstInstrumentChannelSettingsSchema,
  AudioClipChannelSettingsSchema,
  LayerChannelSettingsSchema,
  MidiOutChannelSettingsSchema,
]);

export const ChannelSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int().min(0).max(255),
  name: z.string().min(1).max(128),
  type: ChannelTypeSchema,
  color: HexColorSchema.optional(),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  volume: z.number().min(0).max(1).default(0.78),
  pan: z.number().min(-1).max(1).default(0),
  pitch: z.number().default(0),
  output: MixerInsertRefSchema.default({ insertId: "master" }),
  settings: ChannelSettingsSchema,
});

export const ChannelRackSchema = z.object({
  channels: z.array(ChannelSchema).max(256),
});
