import { z } from "zod";
import { MAX_BPM, MIN_BPM, PPQN, PROTOCOL_VERSION } from "../constants.js";
import { AssetRefSchema } from "./asset.js";
import { AutomationClipSchema } from "./automation.js";
import { EntityIdSchema } from "./base.js";
import { ChannelRackSchema } from "./channel.js";
import { MixerSchema } from "./mixer.js";
import { PatternSchema } from "./pattern.js";
import { PlaylistSchema } from "./playlist.js";
import { RoutingGraphSchema } from "./routing.js";
import { TimeSignatureSchema } from "./time.js";

export const ProjectSettingsSchema = z.object({
  audioBufferSize: z.number().int().min(16).max(8192).default(512),
  defaultTemplateId: EntityIdSchema.optional(),
});

export const ProjectSchema = z
  .object({
    version: z.literal(PROTOCOL_VERSION),
    id: EntityIdSchema,
    name: z.string().min(1).max(256),
    createdAt: z.string().datetime(),
    modifiedAt: z.string().datetime(),
    bpm: z.number().min(MIN_BPM).max(MAX_BPM).default(120),
    timeSignature: TimeSignatureSchema.default({ numerator: 4, denominator: 4 }),
    sampleRate: z
      .union([z.literal(44100), z.literal(48000), z.literal(88200), z.literal(96000)])
      .default(48000),
    channelRack: ChannelRackSchema,
    patterns: z.array(PatternSchema),
    playlist: PlaylistSchema,
    mixer: MixerSchema,
    routing: RoutingGraphSchema,
    automationClips: z.array(AutomationClipSchema).default([]),
    assets: z.array(AssetRefSchema).default([]),
    settings: ProjectSettingsSchema.default({}),
  })
  .strict();
