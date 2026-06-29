import { z } from "zod";
import { EntityIdSchema } from "./base.js";

export const AssetKindSchema = z.enum([
  "audio",
  "video",
  "image",
  "preset",
  "soundfont",
  "midi",
  "pluginState",
]);

export const AssetRefSchema = z.object({
  id: EntityIdSchema,
  kind: AssetKindSchema,
  name: z.string().max(256),
  originalPath: z.string().max(4096).optional(),
  bundlePath: z.string().max(4096),
  hashSha256: z.string().length(64).optional(),
  sizeBytes: z.number().int().min(0),
});
