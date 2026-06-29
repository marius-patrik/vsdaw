import { z } from "zod";
import { EntityIdSchema } from "./base.js";
import { TickSchema } from "./time.js";

export const AutomationTargetTypeSchema = z.enum([
  "channelParam",
  "pluginParam",
  "mixerParam",
  "transportParam",
]);

export const AutomationTargetSchema = z.object({
  type: AutomationTargetTypeSchema,
  entityId: EntityIdSchema,
  parameterId: z.string().min(1).max(128),
});

export const AutomationPointSchema = z.object({
  tick: TickSchema,
  value: z.number().finite(),
  curve: z.enum(["linear", "smooth", "hold", "exponential", "sine"]).default("linear"),
});

export const AutomationClipSchema = z.object({
  id: EntityIdSchema,
  name: z.string().max(128),
  target: AutomationTargetSchema,
  points: z.array(AutomationPointSchema),
});
