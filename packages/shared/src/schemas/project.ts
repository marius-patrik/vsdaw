import { z } from "zod";
import { MAX_BPM, MIN_BPM, PPQN, PROTOCOL_VERSION } from "../constants.js";
import { EntityIdSchema } from "./base.js";

export const TimeSignatureSchema = z.object({
  numerator: z.number().int().min(1).max(64),
  denominator: z
    .number()
    .int()
    .min(1)
    .max(64)
    .refine((v) => Number.isInteger(Math.log2(v)), {
      message: "time-signature denominator must be a power of two",
    }),
});

export const ProjectSettingsSchema = z.object({
  audioBufferSize: z.number().int().min(16).max(8192).default(512),
  defaultTemplateId: EntityIdSchema.optional(),
});

export const ChannelRackSchema = z.object({
  channels: z.array(z.unknown()),
});

export const PlaylistSchema = z.object({
  tracks: z.array(z.unknown()),
});

export const MixerSchema = z.object({
  inserts: z.array(z.unknown()),
});

export const RoutingGraphSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
});

export const ProjectSchema = z
  .object({
    version: z.literal(PROTOCOL_VERSION),
    id: EntityIdSchema,
    name: z.string().min(1).max(256),
    createdAt: z.string().datetime(),
    modifiedAt: z.string().datetime(),
    bpm: z.number().min(MIN_BPM).max(MAX_BPM).default(120),
    timeSignature: TimeSignatureSchema,
    sampleRate: z
      .union([z.literal(44100), z.literal(48000), z.literal(88200), z.literal(96000)])
      .default(48000),
    settings: ProjectSettingsSchema,
    channelRack: ChannelRackSchema,
    patterns: z.array(z.unknown()),
    playlist: PlaylistSchema,
    mixer: MixerSchema,
    routing: RoutingGraphSchema,
    automationClips: z.array(z.unknown()),
    assets: z.array(z.unknown()),
  })
  .strict();

export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).max(256),
  templateId: EntityIdSchema.optional(),
});

export const ProjectMetadataPatchSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  bpm: z.number().min(MIN_BPM).max(MAX_BPM).optional(),
  timeSignature: TimeSignatureSchema.optional(),
  sampleRate: ProjectSchema.shape.sampleRate.optional(),
  settings: ProjectSettingsSchema.optional(),
});
