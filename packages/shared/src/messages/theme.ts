import { z } from "zod";
import { themeSettingsSchema, vsCodeThemeSchema } from "../theme.js";

export const themeChangedMessageSchema = z.object({
  type: z.literal("theme.changed"),
  payload: vsCodeThemeSchema,
});

export const themeScaleChangedMessageSchema = z.object({
  type: z.literal("theme.scaleChanged"),
  payload: z.object({ uiScale: z.enum(["75", "100", "125", "150", "200"]) }),
});

export const themeMessageSchema = z.union([
  themeChangedMessageSchema,
  themeScaleChangedMessageSchema,
]);
