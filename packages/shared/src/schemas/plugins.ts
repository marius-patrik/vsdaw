import { z } from "zod";
import { EntityIdSchema } from "./base.js";

export const PluginFormatSchema = z.enum(["vst3", "au", "clap", "lv2", "aax"]);

export const PluginInfoSchema = z.object({
  id: EntityIdSchema,
  format: PluginFormatSchema,
  path: z.string(),
  name: z.string(),
  vendor: z.string(),
  category: z.string(),
  isInstrument: z.boolean(),
  version: z.string(),
  uniqueId: z.string(),
  scannedAt: z.string().datetime(),
});
