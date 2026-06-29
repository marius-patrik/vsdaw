import { z } from "zod";
import { themeSettingsSchema, uiScaleSchema, vsCodeThemeSchema } from "../theme.js";

export const themeChangedMessageSchema = z.object({
  type: z.literal("theme.changed"),
  payload: vsCodeThemeSchema,
});

export const themeScaleChangedMessageSchema = z.object({
  type: z.literal("theme.scaleChanged"),
  payload: z.object({ uiScale: uiScaleSchema }),
});

export const themeSettingsResponseSchema = themeSettingsSchema;

export const patchThemeSettingsRequestSchema = z.object({
  activeThemeId: z.string().optional(),
  uiScale: uiScaleSchema.optional(),
});

export const themeMessageSchema = z.union([
  themeChangedMessageSchema,
  themeScaleChangedMessageSchema,
]);
