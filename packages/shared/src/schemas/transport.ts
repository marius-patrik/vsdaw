import { z } from "zod";
import { SampleSchema } from "./time.js";

export const TransportStateSchema = z.enum(["stopped", "playing", "recording", "paused"]);

export const TransportModeSchema = z.enum(["song", "pattern"]);

export const MidiMessageSchema = z.object({
  bytes: z.array(z.number().int().min(0).max(255)).min(1).max(3),
  timestampSamples: SampleSchema.optional(),
});
