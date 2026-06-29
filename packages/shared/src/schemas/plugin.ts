import { z } from "zod";
import { EntityIdSchema } from "./base.js";

export const PluginFormatSchema = z.enum(["vst3", "au", "clap", "lv2", "aax"]);

export const PluginInstanceSchema = z.object({
  id: EntityIdSchema,
  descriptorId: EntityIdSchema,
  name: z.string().max(256),
  vendor: z.string().max(256),
  version: z.string().max(64),
  format: PluginFormatSchema,
  stateBlobBase64: z.string().optional(),
  parameters: z.record(z.string(), z.number()).default({}),
  delaySamples: z.number().int().min(0).default(0),
});
